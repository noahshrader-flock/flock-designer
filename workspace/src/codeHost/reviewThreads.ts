import type { CommentAnchor, CommentRef, ReviewComment } from '../shared/contract';
import {
	RESOLVED_MARK,
	addressedAt,
	addressedIn,
	composeBody,
	isResolved,
	parseAnchor,
	parsePicture,
	stripAnchor,
	withAddressed,
	withResolved,
} from '../shared/anchor';
import { asRecord } from '../shared/json';
import { prototypeKey } from '../shared/designPaths';
import { latestDate } from '../shared/prototypeList';
import type { RepoRef } from '../shared/repoRef';
import type { GitHubApi } from './github';
import { HostError, hostErrorKind } from './hostError';
import { readPages } from './paging';
import { repoApiPath } from './repoFiles';
import { ISSUE } from '../shared/vocabulary';

/**
 * Comments are issue comments, one issue per piece of work, found by the branch line in its body. That keeps a server out
 * of the design: the host already stores them, notifies people, and lets someone with only read access comment.
 */

const REVIEW_LABEL = 'flock-designer:review';

/** A key can have more than one thread: `number` is the oldest, the one written to. */
export interface ReviewThread {
	number: number;
	numbers: number[];
	/** The comments not resolved: counted only when asked for (`counting`), else 0. */
	openComments: number;
	updatedAt: string | null;
}

export class ReviewThreads {
	constructor(
		private readonly session: GitHubApi,
		private readonly ref: RepoRef,
	) {}

	private get apiPath(): string {
		return repoApiPath(this.ref);
	}

	/**
	 * Review threads created or found this session, by branch. GitHub's issue *listing* lags a new issue by ten seconds or
	 * more, though fetching it by number is immediate: without this, a thread just created could not be found, its first
	 * comment would never appear, and the next comment would create a second thread.
	 */
	private readonly known = new Map<string, Set<number>>();

	/**
	 * `counting`: how many comments of each thread are not resolved, read from its open issues' comments (a closed issue has
	 * none open), for the prototype list's badge. Not otherwise, as every comment written or changed asks for the threads.
	 */
	async byBranch({ counting = false }: { counting?: boolean } = {}): Promise<Map<string, ReviewThread>> {
		const issues = (
			await readPages(this.session, `${this.apiPath}/issues?state=all&labels=${encodeURIComponent(REVIEW_LABEL)}`, { maxPages: 10 })
		).map(asRecord);

		// More than one thread can exist for a branch (the listing lag above can make some). All of them are read, the
		// oldest is written to, and none is lost.
		const byBranch = new Map<string, ReviewThread>();
		// The issues whose comments say how many are open: open ones with comments, and a thread made this session, which the
		// listing may not show yet. What the listing says each has stands in where its comments cannot be read.
		const toRead = new Map<number, number>();
		const inListing = new Set(issues.map((issue) => issue.number));
		for (const issue of issues) {
			const branch = /branch:\s*`([^`]+)`/.exec(String(issue.body ?? ''))?.[1];
			if (branch && typeof issue.number === 'number') {
				const have = byBranch.get(branch);
				const numbers = [...(have?.numbers ?? []), issue.number];
				byBranch.set(branch, {
					number: Math.min(...numbers),
					numbers,
					openComments: 0,
					updatedAt: latestDate([have?.updatedAt, issue.updated_at]),
				});
				if (issue.state === 'open' && Number(issue.comments) > 0) toRead.set(issue.number, Number(issue.comments));
			}
		}
		for (const [branch, known] of this.known) {
			const have = byBranch.get(branch);
			const numbers = [...new Set([...(have?.numbers ?? []), ...known])];
			byBranch.set(branch, { number: Math.min(...numbers), numbers, openComments: 0, updatedAt: have?.updatedAt ?? null });
			for (const n of known) if (!inListing.has(n)) toRead.set(n, 0);
		}
		if (!counting) return byBranch;
		const open = new Map(await Promise.all([...toRead].map(async ([n, listed]) => [n, await this.unresolvedIn(n).catch(() => listed)] as const)));
		for (const [branch, thread] of byBranch)
			byBranch.set(branch, { ...thread, openComments: thread.numbers.reduce((sum, n) => sum + (open.get(n) ?? 0), 0) });
		return byBranch;
	}

	/** How many comments of a thread are not resolved. */
	private async unresolvedIn(number: number): Promise<number> {
		return (await this.rawComments(number)).filter((c) => !isResolved(String(c.body ?? ''))).length;
	}

	async ensureIssue(prototypeId: string, branch: string): Promise<number> {
		const existing = (await this.byBranch()).get(branch);
		if (existing) return existing.number;
		const created = asRecord(
			await this.session.api(`${this.apiPath}/issues`, {
				method: 'POST',
				body: {
					title: `Review — ${prototypeId} (${branch})`,
					body: [
						`Review thread for **${prototypeId}**, branch: \`${branch}\`.`,
						'',
						'Comments here are written by DSNR and exported to the prototype record.',
						`Do not change the branch line above — the app finds this ${ISSUE} by it.`,
					].join('\n'),
					labels: [REVIEW_LABEL],
				},
			}),
		);
		if (typeof created.number !== 'number') {
			throw new Error(`Could not create a review thread for ${branch}.`);
		}
		this.known.set(branch, new Set([...(this.known.get(branch) ?? []), created.number]));
		return created.number;
	}

	private toComment(raw: Record<string, unknown>, thread: number): ReviewComment {
		const body = String(raw.body ?? '');
		const user = asRecord(raw.user);
		return {
			thread,
			id: Number(raw.id),
			author: String(user.login ?? 'unknown'),
			authorAvatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
			body: stripAnchor(body.replace(RESOLVED_MARK, '').trim()),
			createdAt: String(raw.created_at ?? ''),
			resolved: isResolved(body),
			addressedAt: addressedAt(body),
			addressedIn: addressedIn(body),
			anchor: parseAnchor(body),
			picture: parsePicture(body),
		};
	}

	/** A thread's comments as GitHub has them, every page of them. */
	private async rawComments(number: number): Promise<Record<string, unknown>[]> {
		return (await readPages(this.session, `${this.apiPath}/issues/${number}/comments`, { maxPages: 20 })).map(asRecord);
	}

	async readComments(branch: string): Promise<ReviewComment[]> {
		const issue = (await this.byBranch()).get(branch);
		if (!issue) return [];
		// Each comment with the thread it was read from: never the oldest one's, which would mix up a branch with several.
		const threads = await Promise.all(issue.numbers.map(async (n) => (await this.rawComments(n)).map((c) => this.toComment(c, n))));
		return threads.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	/**
	 * A thread's issue is open while a comment in it is: closed when the last is resolved or deleted, open again when one is
	 * reopened or written. So the open issues are the work still to do. Asked after each change to a comment, which is done
	 * by then: a failure here leaves the issue as it was until the next change sets it, and is not the change's failure.
	 */
	private async settle(number: number): Promise<void> {
		const at = `${this.apiPath}/issues/${number}`;
		try {
			const open = (await this.unresolvedIn(number)) > 0;
			const issue = asRecord(await this.session.api(at));
			if (open === (issue.state === 'open')) return;
			await this.session.api(at, {
				method: 'PATCH',
				body: open ? { state: 'open' } : { state: 'closed', state_reason: 'completed' },
			});
		} catch {
			// As above: the comment's own change is done.
		}
	}

	/**
	 * A deleted prototype's threads: each closed as not planned, with a note saying why, and its label taken off, so it is no
	 * longer DSNR's and a new prototype of the same name starts with none. Its comments stay on GitHub. `branches` are the
	 * prototype's work as recorded; any version's thread is the prototype's too. How many were closed.
	 */
	async closeDeleted(prototypeId: string, branches: string[]): Promise<number> {
		const versions = prototypeKey(prototypeId, '');
		const mine = [...(await this.byBranch())].filter(([branch]) => branches.includes(branch) || branch.startsWith(versions));
		let closed = 0;
		for (const [branch, thread] of mine) {
			for (const number of thread.numbers) {
				const at = `${this.apiPath}/issues/${number}`;
				await this.session.api(`${at}/comments`, {
					method: 'POST',
					body: { body: `${prototypeId} was deleted in DSNR, so this review is closed. Its comments stay here.` },
				});
				await this.session.api(at, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
				await this.session.api(`${at}/labels/${encodeURIComponent(REVIEW_LABEL)}`, { method: 'DELETE' }).catch((err: unknown) => {
					if (hostErrorKind(err) !== 'notFound') throw err;
				});
				closed++;
			}
			this.known.delete(branch);
		}
		return closed;
	}

	/** GitHub lets a person edit only their own comment, which is exactly the rule wanted for moving pins. */
	async moveComment(comment: CommentRef, anchor: CommentAnchor): Promise<ReviewComment> {
		const path = `${this.apiPath}/issues/comments/${comment.id}`;
		const current = asRecord(await this.session.api(path));
		const body = String(current.body ?? '');
		const old = parseAnchor(body);
		const text = stripAnchor(body.replace(RESOLVED_MARK, '').trim());
		// The commit is when the comment was made, not when it was moved.
		// The picture is of where the comment was first placed, so it goes with the comment, not with the pin.
		const next = composeBody(text, { ...anchor, commit: old?.commit ?? anchor.commit }, parsePicture(body));
		return this.toComment(
			asRecord(await this.session.api(path, { method: 'PATCH', body: { body: withResolved(next, isResolved(body)) } })),
			comment.thread,
		);
	}

	/**
	 * GitHub decides who may, so nothing is enforced here. Reopening also clears an agent's mark left by an older DSNR: its
	 * change was not what was meant.
	 */
	async setResolved(comment: CommentRef, resolved: boolean): Promise<ReviewComment> {
		const path = `${this.apiPath}/issues/comments/${comment.id}`;
		const current = asRecord(await this.session.api(path));
		const body = String(current.body ?? '');
		const next = resolved ? withResolved(body, true) : withAddressed(withResolved(body, false), null);
		if (isResolved(next) === isResolved(body) && addressedAt(next) === addressedAt(body)) return this.toComment(current, comment.thread);
		const updated = await this.session.api(path, { method: 'PATCH', body: { body: next } });
		await this.settle(comment.thread);
		return this.toComment(asRecord(updated), comment.thread);
	}

	/** For good: GitHub keeps no copy. A comment that is already gone counts as deleted. */
	async deleteComment(comment: CommentRef): Promise<void> {
		try {
			await this.session.api(`${this.apiPath}/issues/comments/${comment.id}`, { method: 'DELETE' });
		} catch (err) {
			if (hostErrorKind(err) === 'forbidden') {
				throw new HostError("Only a comment's author, or someone who can write to the design repository, can delete it.", 403);
			}
			if (hostErrorKind(err) !== 'notFound') throw err;
		}
		await this.settle(comment.thread);
	}

	async postComment(
		prototypeId: string,
		branch: string,
		body: string,
		anchor: CommentAnchor | null = null,
		picture: string | null = null,
	): Promise<ReviewComment> {
		const number = await this.ensureIssue(prototypeId, branch);
		const created = asRecord(
			await this.session.api(`${this.apiPath}/issues/${number}/comments`, {
				method: 'POST',
				body: { body: composeBody(body, anchor, picture) },
			}),
		);
		await this.settle(number);
		// Read back from what GitHub stored, so what the window shows is what was saved.
		return this.toComment(created, number);
	}
}
