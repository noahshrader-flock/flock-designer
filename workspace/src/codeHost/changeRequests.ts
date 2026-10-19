import { asArray, asRecord } from '../shared/json';
import type { RepoRef } from '../shared/repoRef';
import type { GitHubApi } from './github';
import { repoApiPath } from './repoFiles';
import { CHANGE_REQUEST, HOST } from '../shared/vocabulary';

export interface PullRequest {
	number: number;
	url: string;
}

/** As `gh pr checks` reports it. */
export interface Check {
	name: string;
	/** The workflow that ran it; empty for a check an app or a commit status reported. */
	workflow: string;
	/** `pass`, `fail`, `pending`, `skipping` or `cancel`. */
	bucket: string;
	link: string;
	startedAt: string;
}

const runBucket = (status: unknown, conclusion: unknown): string => {
	if (status !== 'completed' || conclusion === 'stale') return 'pending';
	if (conclusion === 'success') return 'pass';
	if (conclusion === 'skipped' || conclusion === 'neutral') return 'skipping';
	if (conclusion === 'cancelled') return 'cancel';
	return 'fail';
};

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

	private get apiPath(): string {
		return repoApiPath(this.ref);
	}

	/** `head` is a branch of this repository. */
	async findOpen(head: string): Promise<PullRequest | null> {
		const open = asArray(await this.session.api(`${this.apiPath}/pulls?head=${encodeURIComponent(`${this.ref.owner}:${head}`)}&state=open`));
		return asPullRequest(open[0]);
	}

	/** Nothing here can open one that is ready for review. */
	async openDraft({ head, base, title, body }: { head: string; base: string; title: string; body: string }): Promise<PullRequest> {
		const made = asPullRequest(await this.session.api(`${this.apiPath}/pulls`, { method: 'POST', body: { title, head, base, body, draft: true } }));
		if (made === null) throw new Error(`${HOST} did not say which ${CHANGE_REQUEST} it opened.`);
		return made;
	}

	async isOpen(number: number): Promise<boolean> {
		const pr = asRecord(await this.session.api(`${this.apiPath}/pulls/${number}`));
		return pr.state === 'open' && !pr.merged_at;
	}

	/** Check runs and commit statuses (Chromatic reports as one): the first hundred of each, more than any repository here runs. */
	async checks(number: number): Promise<Check[]> {
		const sha = asRecord(asRecord(await this.session.api(`${this.apiPath}/pulls/${number}`)).head).sha;
		if (typeof sha !== 'string') throw new Error(`${HOST} did not say what ${CHANGE_REQUEST} ${number} is at.`);
		const [runs, statuses, workflows] = await Promise.all([
			this.session.api(`${this.apiPath}/commits/${sha}/check-runs?per_page=100`),
			this.session.api(`${this.apiPath}/commits/${sha}/status?per_page=100`),
			this.session.api(`${this.apiPath}/actions/runs?head_sha=${sha}&per_page=100`),
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
