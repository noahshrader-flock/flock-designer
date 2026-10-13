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
import { latestDate } from '../shared/projectList';
import type { RepoRef } from '../shared/repoRef';
import type { GitHubApi } from './github';
import { HostError, hostErrorKind } from './hostError';
import { readPages } from './paging';
import { repoApiPath } from './repoFiles';
import { ISSUE } from '../shared/vocabulary';

/**
 * The review threads of a repository: comments are its issue comments, one issue per iteration, found by the branch line
 * in its body. That choice is what keeps a server out of the design: the host already stores them, notifies people, and
 * lets someone with only read access comment. Verified against the real API on 2026-10-05.
 */

const ITERATION_LABEL = 'flock-designer:review';

/** What the app knows of an iteration's review thread (or threads: a branch can have more than one). */
export interface ReviewThread {
	number: number;
	numbers: number[];
	openComments: number;
	/** When it last had a comment, by GitHub's account of it. */
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
	 * Review threads we created or found this session, by branch.
	 *
	 * GitHub's issue *listing* lags a new issue by ten seconds or more -- measured
	 * 2026-10-05 -- even though fetching the issue by number is immediate. Without
	 * this, the first comment on an iteration created a thread nobody could find,
	 * so it never appeared, and the next comment created a second thread.
	 */
	private readonly known = new Map<string, Set<number>>();

	/** The review threads, by the branch they carry comments for. */
	async byBranch(): Promise<Map<string, ReviewThread>> {
		const issues = (
			await readPages(this.session, `${this.apiPath}/issues?state=all&labels=${encodeURIComponent(ITERATION_LABEL)}`, { maxPages: 10 })
		).map(asRecord);

		// More than one thread can exist for a branch (the listing lag above made
		// some). All of them are read, the oldest is written to, and none is lost.
		const byBranch = new Map<string, ReviewThread>();
		for (const issue of issues) {
			const branch = /branch:\s*`([^`]+)`/.exec(String(issue.body ?? ''))?.[1];
			if (branch && typeof issue.number === 'number') {
				const have = byBranch.get(branch);
				const numbers = [...(have?.numbers ?? []), issue.number];
				byBranch.set(branch, {
					number: Math.min(...numbers),
					numbers,
					openComments: (have?.openComments ?? 0) + Number(issue.comments ?? 0),
					updatedAt: latestDate([have?.updatedAt, issue.updated_at]),
				});
			}
		}
		for (const [branch, known] of this.known) {
			const have = byBranch.get(branch);
			const numbers = [...new Set([...(have?.numbers ?? []), ...known])];
			byBranch.set(branch, { number: Math.min(...numbers), numbers, openComments: have?.openComments ?? 0, updatedAt: have?.updatedAt ?? null });
		}
		return byBranch;
	}

	/** The issue carrying an iteration's comments, created on first use. */
	async ensureIssue(projectId: string, branch: string): Promise<number> {
		const existing = (await this.byBranch()).get(branch);
		if (existing) return existing.number;
		// Listings lag, so a thread made seconds ago may not be in `existing`.

		const created = asRecord(
			await this.session.api(`${this.apiPath}/issues`, {
				method: 'POST',
				body: {
					title: `Review — ${projectId} (${branch})`,
					body: [
						`Review thread for **${projectId}**, branch: \`${branch}\`.`,
						'',
						'Comments here are written by DSNR and exported to the project record.',
						`Do not change the branch line above — the app finds this ${ISSUE} by it.`,
					].join('\n'),
					labels: [ITERATION_LABEL],
				},
			}),
		);
		if (typeof created.number !== 'number') {
			throw new Error(`Could not create a review thread for ${branch}.`);
		}
		this.known.set(branch, new Set([...(this.known.get(branch) ?? []), created.number]));
		return created.number;
	}

	/** One GitHub comment as the app knows it. The one place a comment's body is taken apart. */
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

	/** How many comments each iteration's thread has, by the iteration's key: what the published site shows. */
	async commentCounts(): Promise<Map<string, number>> {
		return new Map([...(await this.byBranch())].map(([branch, thread]) => [branch, thread.openComments]));
	}

	async readComments(branch: string): Promise<ReviewComment[]> {
		const issue = (await this.byBranch()).get(branch);
		if (!issue) return [];
		// Each comment with the thread it was read from: never the oldest one's, which would mix up a branch with several.
		const threads = await Promise.all(
			issue.numbers.map(async (n) =>
				(await readPages(this.session, `${this.apiPath}/issues/${n}/comments`, { maxPages: 20 })).map((c) => this.toComment(asRecord(c), n)),
			),
		);
		return threads.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	/**
	 * Moves a comment's pin by rewriting the anchor inside its body. GitHub lets
	 * a person edit their own comment and refuses anyone else, which is exactly
	 * the rule wanted: you can move your own pins, not someone else's.
	 */
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
	 * Marks a comment resolved, or open again. GitHub decides who may: the comment's author,
	 * or anyone who can write to the repository, so nothing is enforced here.
	 *
	 * Reopening also clears the agent's mark: a comment reopened is one whose change was not what was meant, so it is
	 * open as any other, with its pin, and Address can be run on it again.
	 */
	async setResolved(comment: CommentRef, resolved: boolean): Promise<ReviewComment> {
		const path = `${this.apiPath}/issues/comments/${comment.id}`;
		const current = asRecord(await this.session.api(path));
		const body = String(current.body ?? '');
		const next = resolved ? withResolved(body, true) : withAddressed(withResolved(body, false), null);
		if (isResolved(next) === isResolved(body) && addressedAt(next) === addressedAt(body)) return this.toComment(current, comment.thread);
		const updated = await this.session.api(path, { method: 'PATCH', body: { body: next } });
		return this.toComment(asRecord(updated), comment.thread);
	}

	/**
	 * Records that the agent acted on a comment, with the commit it made (on a prototype, the hash of its source, and
	 * the iteration it is in), and resolves it in the same write: its pin leaves the page, where it would otherwise point
	 * at what the agent just changed or removed. The person can still reopen it, and the mark stays to say what was done.
	 *
	 * Clears the mark when the commit is null, which is what re-addressing a comment that changed nothing should do. That
	 * leaves the comment open or resolved as the person had it.
	 */
	async setAddressed(comment: CommentRef, commit: string | null, iteration: string | null = null): Promise<ReviewComment> {
		const path = `${this.apiPath}/issues/comments/${comment.id}`;
		const current = asRecord(await this.session.api(path));
		const body = String(current.body ?? '');
		const addressed = withAddressed(body, commit, iteration);
		// Resolved only when a change was recorded: `withAddressed` writes only a real commit.
		const marked = addressedAt(addressed) === null ? addressed : withResolved(addressed, true);
		// Judged by what the marks say, not by the text: rewriting them can reorder a body that already says it.
		const same = addressedAt(marked) === addressedAt(body) && addressedIn(marked) === addressedIn(body) && isResolved(marked) === isResolved(body);
		if (same) return this.toComment(current, comment.thread);
		const updated = await this.session.api(path, { method: 'PATCH', body: { body: marked } });
		return this.toComment(asRecord(updated), comment.thread);
	}

	/**
	 * Deletes a comment for good: GitHub keeps no copy. GitHub decides who may (the comment's author, or
	 * anyone who can write to the repository), and its refusal is put in words a person can act on.
	 * A comment that is already gone counts as deleted: someone else got there first.
	 */
	async deleteComment(comment: CommentRef): Promise<void> {
		try {
			await this.session.api(`${this.apiPath}/issues/comments/${comment.id}`, { method: 'DELETE' });
		} catch (err) {
			if (hostErrorKind(err) === 'notFound') return;
			if (hostErrorKind(err) === 'forbidden') {
				throw new HostError("Only a comment's author, or someone who can write to the design repository, can delete it.", 403);
			}
			throw err;
		}
	}

	async postComment(
		projectId: string,
		branch: string,
		body: string,
		anchor: CommentAnchor | null = null,
		picture: string | null = null,
	): Promise<ReviewComment> {
		const number = await this.ensureIssue(projectId, branch);
		const created = asRecord(
			await this.session.api(`${this.apiPath}/issues/${number}/comments`, {
				method: 'POST',
				body: { body: composeBody(body, anchor, picture) },
			}),
		);
		// Read back from what GitHub stored, so what the window shows is what was saved.
		return this.toComment(created, number);
	}
}
