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
 * Comments are issue comments, one issue per piece of work, found by the branch line in its body. That keeps a server out
 * of the design: the host already stores them, notifies people, and lets someone with only read access comment.
 */

const REVIEW_LABEL = 'flock-designer:review';

/** A key can have more than one thread: `number` is the oldest, the one written to. */
export interface ReviewThread {
	number: number;
	numbers: number[];
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

	async byBranch(): Promise<Map<string, ReviewThread>> {
		const issues = (
			await readPages(this.session, `${this.apiPath}/issues?state=all&labels=${encodeURIComponent(REVIEW_LABEL)}`, { maxPages: 10 })
		).map(asRecord);

		// More than one thread can exist for a branch (the listing lag above can make some). All of them are read, the
		// oldest is written to, and none is lost.
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

	async ensureIssue(projectId: string, branch: string): Promise<number> {
		const existing = (await this.byBranch()).get(branch);
		if (existing) return existing.number;
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
	 * GitHub decides who may, so nothing is enforced here. Reopening also clears the agent's mark: its change was not what
	 * was meant, so Address can be run on it again.
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
	 * Resolves it in the same write, so its pin does not point at what the agent just changed. A null commit (a re-address
	 * that changed nothing) clears the mark and leaves the comment open or resolved as the person had it.
	 */
	async setAddressed(comment: CommentRef, commit: string | null, version: string | null = null): Promise<ReviewComment> {
		const path = `${this.apiPath}/issues/comments/${comment.id}`;
		const current = asRecord(await this.session.api(path));
		const body = String(current.body ?? '');
		const addressed = withAddressed(body, commit, version);
		// Resolved only when a change was recorded: `withAddressed` writes only a real commit.
		const marked = addressedAt(addressed) === null ? addressed : withResolved(addressed, true);
		// Judged by what the marks say, not by the text: rewriting them can reorder a body that already says it.
		const same = addressedAt(marked) === addressedAt(body) && addressedIn(marked) === addressedIn(body) && isResolved(marked) === isResolved(body);
		if (same) return this.toComment(current, comment.thread);
		const updated = await this.session.api(path, { method: 'PATCH', body: { body: marked } });
		return this.toComment(asRecord(updated), comment.thread);
	}

	/** For good: GitHub keeps no copy. A comment that is already gone counts as deleted. */
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
