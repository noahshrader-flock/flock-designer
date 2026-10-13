import { describe, expect, it } from 'vitest';
import { ChangeRequests } from '../src/host/changeRequests';
import { fakeGitHub } from './fakes/github';

const REF = { owner: 'o', repo: 'r' };
const SHA = 'a'.repeat(40);
const BASE = '/repos/o/r';

describe('change requests, over the API', () => {
	it('finds the open one from a branch, and says when there is none', async () => {
		const { github, calls } = fakeGitHub({
			[`${BASE}/pulls?head=o%3Afd%2Fdemo%2Fi1&state=open`]: [{ number: 9, html_url: 'https://github.com/o/r/pull/9', state: 'open' }],
			[`${BASE}/pulls?head=o%3Afd%2Fdemo%2Fi2&state=open`]: [],
		});
		const crs = new ChangeRequests(github, REF);
		expect(await crs.findOpen('fd/demo/i1')).toEqual({ number: 9, url: 'https://github.com/o/r/pull/9' });
		expect(await crs.findOpen('fd/demo/i2')).toBeNull();
		expect(calls.every((c) => c.method === 'GET')).toBe(true);
	});

	it('opens one only as a draft, onto the base it is given', async () => {
		const { github, writes } = fakeGitHub({ [`POST ${BASE}/pulls`]: { number: 42, html_url: 'https://github.com/o/r/pull/42' } });
		expect(await new ChangeRequests(github, REF).openDraft({ head: 'fd/demo/i1', base: 'develop', title: 'T', body: 'B' })).toEqual({
			number: 42,
			url: 'https://github.com/o/r/pull/42',
		});
		expect(writes).toEqual([
			{ method: 'POST', path: `${BASE}/pulls`, body: { title: 'T', head: 'fd/demo/i1', base: 'develop', body: 'B', draft: true } },
		]);
	});

	it('says whether one is still open: not once it is merged or closed', async () => {
		const { github } = fakeGitHub({
			[`${BASE}/pulls/1`]: { state: 'open', merged_at: null },
			[`${BASE}/pulls/2`]: { state: 'closed', merged_at: '2026-10-10T00:00:00Z' },
			[`${BASE}/pulls/3`]: { state: 'closed', merged_at: null },
		});
		const crs = new ChangeRequests(github, REF);
		expect([await crs.isOpen(1), await crs.isOpen(2), await crs.isOpen(3)]).toEqual([true, false, false]);
	});

	it("gives each check on its head as the command line's `pr checks` does: its workflow, and its outcome in one word", async () => {
		const run = (name: string, status: string, conclusion: string | null, suite = 7) => ({
			name,
			status,
			conclusion,
			details_url: `https://ci.test/${name}`,
			html_url: `https://github.com/o/r/runs/${name}`,
			started_at: '2026-10-10T12:00:00Z',
			check_suite: { id: suite },
		});
		const { github } = fakeGitHub({
			[`${BASE}/pulls/42`]: { head: { sha: SHA } },
			[`${BASE}/commits/${SHA}/check-runs?per_page=100`]: {
				check_runs: [
					run('deploy', 'completed', 'success'),
					run('lint', 'completed', 'neutral'),
					run('e2e', 'in_progress', null),
					run('build', 'completed', 'failure', 8),
					run('slow', 'completed', 'timed_out', 8),
					run('docs', 'completed', 'skipped', 8),
					run('old', 'completed', 'cancelled', 9),
				],
			},
			[`${BASE}/commits/${SHA}/status?per_page=100`]: {
				statuses: [{ context: 'UI Tests', state: 'pending', target_url: 'https://www.chromatic.com/build?id=1', created_at: '2026-10-10T12:01:00Z' }],
			},
			[`${BASE}/actions/runs?head_sha=${SHA}&per_page=100`]: {
				workflow_runs: [
					{ check_suite_id: 7, name: 'PR Deployment' },
					{ check_suite_id: 8, name: 'CI' },
				],
			},
		});
		expect(await new ChangeRequests(github, REF).checks(42)).toEqual([
			{ name: 'deploy', workflow: 'PR Deployment', bucket: 'pass', link: 'https://ci.test/deploy', startedAt: '2026-10-10T12:00:00Z' },
			{ name: 'lint', workflow: 'PR Deployment', bucket: 'pass', link: 'https://ci.test/lint', startedAt: '2026-10-10T12:00:00Z' },
			{ name: 'e2e', workflow: 'PR Deployment', bucket: 'pending', link: 'https://ci.test/e2e', startedAt: '2026-10-10T12:00:00Z' },
			{ name: 'build', workflow: 'CI', bucket: 'fail', link: 'https://ci.test/build', startedAt: '2026-10-10T12:00:00Z' },
			{ name: 'slow', workflow: 'CI', bucket: 'fail', link: 'https://ci.test/slow', startedAt: '2026-10-10T12:00:00Z' },
			{ name: 'docs', workflow: 'CI', bucket: 'skipping', link: 'https://ci.test/docs', startedAt: '2026-10-10T12:00:00Z' },
			// A check run from an app, not a workflow, has no workflow to name.
			{ name: 'old', workflow: '', bucket: 'cancel', link: 'https://ci.test/old', startedAt: '2026-10-10T12:00:00Z' },
			{ name: 'UI Tests', workflow: '', bucket: 'pending', link: 'https://www.chromatic.com/build?id=1', startedAt: '2026-10-10T12:01:00Z' },
		]);
	});
});
