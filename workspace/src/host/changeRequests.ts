import { asArray, asRecord } from '../shared/json';
import type { RepoRef } from '../shared/repoRef';
import type { GitHubApi } from './designRepo';
import { repoPath } from './repoFiles';
import { CHANGE_REQUEST, HOST } from '../shared/vocabulary';

/**
 * A repository's change requests (GitHub's pull requests) through the host's API: the one open from a branch, a draft
 * opened, whether it is still open, and the checks on it. One implementation, for sharing a preview, a token change and
 * a voice and tone change alike, whoever is asking (the person's own command line, for a product's repository).
 */

export interface PullRequest {
	number: number;
	url: string;
}

/** One check on a change request, as the command line's `gh pr checks` reports it. */
export interface Check {
	name: string;
	/** The workflow that ran it; empty for a check an app or a commit status reported. */
	workflow: string;
	/** `pass`, `fail`, `pending`, `skipping` or `cancel`. */
	bucket: string;
	link: string;
	startedAt: string;
}

/** A check run's outcome in one word, as `gh pr checks` puts it: anything not finished is pending. */
const runBucket = (status: unknown, conclusion: unknown): string => {
	if (status !== 'completed') return 'pending';
	if (conclusion === 'success' || conclusion === 'neutral') return 'pass';
	if (conclusion === 'skipped') return 'skipping';
	if (conclusion === 'cancelled') return 'cancel';
	return 'fail';
};

/** A commit status's state in the same words. */
const statusBucket = (state: unknown): string => (state === 'success' ? 'pass' : state === 'pending' ? 'pending' : 'fail');

const asPullRequest = (raw: unknown): PullRequest | null => {
	const pr = asRecord(raw);
	return typeof pr.number === 'number' && typeof pr.html_url === 'string' ? { number: pr.number, url: pr.html_url } : null;
};

export class ChangeRequests {
	constructor(
		private readonly session: GitHubApi,
		private readonly ref: RepoRef,
	) {}

	private get base(): string {
		return repoPath(this.ref);
	}

	/** The one open from `head` (a branch of this repository), or null. */
	async findOpen(head: string): Promise<PullRequest | null> {
		const open = asArray(await this.session.api(`${this.base}/pulls?head=${encodeURIComponent(`${this.ref.owner}:${head}`)}&state=open`));
		return asPullRequest(open[0]);
	}

	/** Whether any was ever opened from `head`, open or not. */
	async anyFrom(head: string): Promise<boolean> {
		return asArray(await this.session.api(`${this.base}/pulls?head=${encodeURIComponent(`${this.ref.owner}:${head}`)}&state=all`)).length > 0;
	}

	/** Always a draft. Nothing here can open one that is ready for review. */
	async openDraft({ head, base, title, body }: { head: string; base: string; title: string; body: string }): Promise<PullRequest> {
		const made = asPullRequest(await this.session.api(`${this.base}/pulls`, { method: 'POST', body: { title, head, base, body, draft: true } }));
		if (made === null) throw new Error(`${HOST} did not say which ${CHANGE_REQUEST} it opened.`);
		return made;
	}

	/** Whether it is still open: not once it is merged or closed. */
	async isOpen(number: number): Promise<boolean> {
		const pr = asRecord(await this.session.api(`${this.base}/pulls/${number}`));
		return pr.state === 'open' && !pr.merged_at;
	}

	/**
	 * The checks on its head, as `gh pr checks` gives them: each check run, named by the workflow that ran it, and each
	 * commit status (Chromatic reports as one). The first hundred of each, which is more than any repository here runs.
	 */
	async checks(number: number): Promise<Check[]> {
		const sha = asRecord(asRecord(await this.session.api(`${this.base}/pulls/${number}`)).head).sha;
		if (typeof sha !== 'string') throw new Error(`${HOST} did not say what ${CHANGE_REQUEST} ${number} is at.`);
		const [runs, statuses, workflows] = await Promise.all([
			this.session.api(`${this.base}/commits/${sha}/check-runs?per_page=100`),
			this.session.api(`${this.base}/commits/${sha}/status?per_page=100`),
			this.session.api(`${this.base}/actions/runs?head_sha=${sha}&per_page=100`),
		]);
		const workflowOf = new Map(asArray(asRecord(workflows).workflow_runs).map((w) => [asRecord(w).check_suite_id, String(asRecord(w).name ?? '')]));
		return [
			...asArray(asRecord(runs).check_runs)
				.map(asRecord)
				.map((r) => ({
					name: String(r.name ?? ''),
					workflow: workflowOf.get(asRecord(r.check_suite).id) ?? '',
					bucket: runBucket(r.status, r.conclusion),
					link: String(r.details_url ?? r.html_url ?? ''),
					startedAt: String(r.started_at ?? ''),
				})),
			...asArray(asRecord(statuses).statuses)
				.map(asRecord)
				.map((s) => ({
					name: String(s.context ?? ''),
					workflow: '',
					bucket: statusBucket(s.state),
					link: String(s.target_url ?? ''),
					startedAt: String(s.created_at ?? ''),
				})),
		];
	}
}
