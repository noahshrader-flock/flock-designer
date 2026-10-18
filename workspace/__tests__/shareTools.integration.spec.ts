import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pushBranch } from '../src/core/services/platform/git';
import { recordPreview, readWork } from '../src/core/services/projects/workRecords';
import { type ShareStatus } from '../src/shared/contract';
import { ShareRunner, type ShareRequest } from '../src/core/services/codebase/share';
import { ghApi, locateGh } from '../src/core/services/platform/ghCli';
import { fakeGitHub } from './fakes/github';
import { realShareTools } from '../src/core/services/codebase/shareTools';
import { g } from './fixtures';

/**
 * The real git push and the real way of running `gh`, against a throwaway bare repository as
 * the remote and a stand-in `gh` that plays GitHub. Nothing here reaches the network, a real
 * repository or anyone's pull request list.
 */

let dir: string;
let work: string;
let remote: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-share-'));
	remote = join(dir, 'origin.git');
	work = join(dir, 'work');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', remote]);
	execFileSync('git', ['init', '-q', '-b', 'develop', work]);
	writeFileSync(join(work, 'a.txt'), 'one\n');
	g(work, 'add', '.');
	g(work, 'commit', '-q', '-m', 'first');
	g(work, 'remote', 'add', 'origin', remote);
	g(work, 'push', '-q', 'origin', 'develop');
	g(work, 'checkout', '-q', '-b', 'feature/demo');
	writeFileSync(join(work, 'proto.txt'), 'prototype\n');
	g(work, 'add', '.');
	g(work, 'commit', '-q', '-m', 'prototype');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('pushBranch', () => {
	it('sends the branch to the remote, and says so', async () => {
		expect(await pushBranch(work, 'feature/demo')).toEqual({ pushed: true });
		expect(g(remote, 'rev-parse', 'refs/heads/feature/demo').trim()).toBe(g(work, 'rev-parse', 'HEAD').trim());
	});

	it('says nothing went when the remote already has exactly this', async () => {
		await pushBranch(work, 'feature/demo');
		expect(await pushBranch(work, 'feature/demo')).toEqual({ pushed: false });
	});

	it('sends only the new commits when shared again', async () => {
		await pushBranch(work, 'feature/demo');
		writeFileSync(join(work, 'proto.txt'), 'changed\n');
		g(work, 'commit', '-q', '-am', 'change');
		expect(await pushBranch(work, 'feature/demo')).toEqual({ pushed: true });
	});

	it('refuses, rather than forcing, when the remote has work this machine lacks', async () => {
		await pushBranch(work, 'feature/demo');
		const other = join(dir, 'other');
		execFileSync('git', ['clone', '-q', remote, other]);
		g(other, 'config', 'user.email', 'o@example.test');
		g(other, 'config', 'user.name', 'Other');
		g(other, 'checkout', '-q', 'feature/demo');
		writeFileSync(join(other, 'theirs.txt'), 'theirs\n');
		g(other, 'add', '.');
		g(other, 'commit', '-q', '-m', 'theirs');
		g(other, 'push', '-q', 'origin', 'feature/demo');

		writeFileSync(join(work, 'proto.txt'), 'mine\n');
		g(work, 'commit', '-q', '-am', 'mine');
		const before = g(remote, 'rev-parse', 'refs/heads/feature/demo');
		await expect(pushBranch(work, 'feature/demo')).rejects.toThrow(/changes on the remote that this machine does not have/);
		expect(g(remote, 'rev-parse', 'refs/heads/feature/demo')).toBe(before); // nothing was overwritten
	});

	it('refuses a branch that is not on this machine', async () => {
		await expect(pushBranch(work, 'prototype/nope/v1')).rejects.toThrow(/does not exist on this machine, so there is nothing to share/);
	});
});

describe('sharing through the real tools', () => {
	const request: ShareRequest = {
		share: { url: 'https://dev-coke-pr-<pr>.example.test', workflow: 'PR Deployment', kinds: ['codebase'] },
		projectId: 'demo',
		name: 'codebase',
		branch: 'feature/demo',
		title: 'Preview: demo codebase (not for merge)',
		body: 'draft',
	};
	const timings = { pollMs: 5, startupMs: 200, timeoutMs: 5000, skewMs: 120_000 };
	const settle = async (runner: ShareRunner) => {
		for (let i = 0; i < 400 && runner.status().state === 'running'; i++) await new Promise((r) => setTimeout(r, 10));
		return runner.status();
	};
	const REPO = { owner: 'o', repo: 'r' };
	const SHA = 'c'.repeat(40);
	/**
	 * GitHub, as the person's command line reaches it: `open` pull requests for the branch (none by default), a new one
	 * numbered 42, and the deploy's check run reading `buckets` one look at a time, the last one repeating.
	 */
	const github = ({ open = [] as unknown[], conclusions = ['success'] as (string | null)[] } = {}) => {
		let looks = 0;
		return fakeGitHub({
			'GET /repos/o/r/pulls?*': open,
			'GET /repos/o/r': { default_branch: 'develop' },
			'POST /repos/o/r/pulls': { number: 42, html_url: 'https://github.test/o/r/pull/42' },
			'GET /repos/o/r/pulls/*': { head: { sha: SHA } },
			[`GET /repos/o/r/commits/${SHA}/check-runs?per_page=100`]: () => {
				const conclusion = conclusions[Math.min(looks++, conclusions.length - 1)];
				if (conclusion === undefined) return { check_runs: [] };
				return {
					check_runs: [
						{
							name: 'deploy',
							status: conclusion === null ? 'in_progress' : 'completed',
							conclusion,
							details_url: 'https://github.test/run/1',
							started_at: new Date().toISOString(),
							check_suite: { id: 7 },
						},
					],
				};
			},
			[`GET /repos/o/r/commits/${SHA}/status?per_page=100`]: { statuses: [] },
			[`GET /repos/o/r/actions/runs?head_sha=${SHA}&per_page=100`]: { workflow_runs: [{ check_suite_id: 7, name: 'PR Deployment' }] },
		});
	};

	it('pushes, opens a DRAFT pull request onto the default branch, waits through a pending build, records the address', async () => {
		const gh = github({ conclusions: [null, 'success'] });
		const records = join(dir, 'records');
		mkdirSync(join(records, 'demo'), { recursive: true });
		writeFileSync(
			join(records, 'demo', 'work.json'),
			JSON.stringify([{ projectId: 'demo', name: 'codebase', branch: 'feature/demo', commit: null, createdAt: 'x', note: '' }]),
		);

		const seen: ShareStatus[] = [];
		const runner = new ShareRunner((s) => seen.push(s));
		runner.start({
			request,
			tools: realShareTools(work, gh.github, REPO),
			timings,
			record: async (url) => void recordPreview(records, 'demo', 'codebase', url),
		});
		const done = await settle(runner);

		expect(done).toMatchObject({ state: 'ready', url: 'https://dev-coke-pr-42.example.test', prUrl: 'https://github.test/o/r/pull/42' });
		expect(g(remote, 'rev-parse', 'refs/heads/feature/demo').trim()).toBe(g(work, 'rev-parse', 'HEAD').trim());
		// One write, and it is a draft: nothing here marks a pull request ready, or merges one.
		expect(gh.writes).toEqual([
			{
				method: 'POST',
				path: '/repos/o/r/pulls',
				body: { title: request.title, head: 'feature/demo', base: 'develop', body: 'draft', draft: true },
			},
		]);
		expect(seen.map((s) => (s.state === 'running' ? s.step : s.state))).toEqual(expect.arrayContaining(['pushing', 'opening', 'building', 'ready']));

		expect(readWork(records, 'demo')[0]?.previewUrl).toBe('https://dev-coke-pr-42.example.test');
	});

	it('opens a draft onto the branch named, not the default, when one is named: the branch a change was made from', async () => {
		const gh = github();
		await realShareTools(work, gh.github, REPO).createDraftPr('dsnr/handoff-20261017-ab12', 'FSButton: 1 change from DSNR', 'draft', 'main');
		expect(gh.writes).toEqual([
			{
				method: 'POST',
				path: '/repos/o/r/pulls',
				body: { title: 'FSButton: 1 change from DSNR', head: 'dsnr/handoff-20261017-ab12', base: 'main', body: 'draft', draft: true },
			},
		]);
	});

	it('does not open a second pull request when one is already open for the branch', async () => {
		const gh = github({ open: [{ number: 9, html_url: 'https://github.test/o/r/pull/9' }] });
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, gh.github, REPO), timings, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'ready', url: 'https://dev-coke-pr-9.example.test' });
		expect(gh.writes).toEqual([]);
	});

	it('reports a failed deploy with the check and its log', async () => {
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, github({ conclusions: ['failure'] }).github, REPO), timings, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'failed', message: expect.stringContaining('run/1') });
	});

	it('treats no checks yet, right after a push, as not started, and says so when they never start', async () => {
		const runner = new ShareRunner(() => undefined);
		runner.start({
			request,
			tools: realShareTools(work, github({ conclusions: [] }).github, REPO),
			timings: { ...timings, startupMs: 40 },
			record: async () => undefined,
		});
		expect(await settle(runner)).toMatchObject({ state: 'failed', message: expect.stringContaining('did not start') });
	});

	it('says what to install when the GitHub CLI is missing', async () => {
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, ghApi(join(dir, 'no-such-gh')), REPO), timings, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'failed', message: expect.stringContaining('https://cli.github.com') });
	});

	it('still pushes before it finds out gh is unusable, so nothing is lost', async () => {
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, ghApi(join(dir, 'no-such-gh')), REPO), timings, record: async () => undefined });
		await settle(runner);
		expect(g(remote, 'rev-parse', '--verify', 'refs/heads/feature/demo').trim()).toMatch(/^[0-9a-f]{40}$/);
	});

	it('says so when the repository is not on GitHub, rather than guessing where its pull requests are', async () => {
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, github().github), timings, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'failed', message: expect.stringContaining('not on GitHub') });
	});
});

describe('locateGh', () => {
	it('prefers the PATH, then the usual install places, then the bare name', () => {
		expect(locateGh({ PATH: '/a:/b' }, (p) => p === '/b/gh')).toBe('/b/gh');
		expect(locateGh({ PATH: '/a' }, (p) => p === '/opt/homebrew/bin/gh')).toBe('/opt/homebrew/bin/gh');
		expect(locateGh({ PATH: '/a' }, () => false)).toBe('gh');
	});
});
