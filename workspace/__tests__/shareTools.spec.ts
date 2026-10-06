import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitProblem, pushBranch } from '../src/main/services/git';
import { recordPreview, readIterations } from '../src/main/services/iterations';
import { type ShareStatus } from '../src/shared/contract';
import { ShareRunner, type ShareRequest } from '../src/main/services/share';
import { locateGh, realShareTools } from '../src/main/services/shareTools';

/**
 * The real git push and the real way of running `gh`, against a throwaway bare repository as
 * the remote and a stand-in `gh` that plays GitHub. Nothing here reaches the network, a real
 * repository or anyone's pull request list.
 */

let dir: string;
let work: string;
let remote: string;
let fakeGh: string;
const g = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

/**
 * A `gh` that logs every call and answers from files in $FAKE_GH_DIR:
 *  - `pr list` prints list.json (default `[]`)
 *  - `pr create` prints the pull request URL
 *  - `pr checks` prints checks-N.json for the Nth call (the last one repeats), exiting 8 while any is pending
 */
const writeFakeGh = (path: string) => {
	writeFileSync(
		path,
		`#!/bin/bash
echo "$@" >> "$FAKE_GH_DIR/calls.log"
case "$1 $2" in
  "pr list") cat "$FAKE_GH_DIR/list.json" 2>/dev/null || echo '[]' ;;
  "pr create") echo "https://github.test/o/r/pull/\${FAKE_PR:-42}" ;;
  "pr checks")
    n=$(( $(cat "$FAKE_GH_DIR/n" 2>/dev/null || echo 0) + 1 )); echo $n > "$FAKE_GH_DIR/n"
    f="$FAKE_GH_DIR/checks-$n.json"; [ -f "$f" ] || f=$(ls "$FAKE_GH_DIR"/checks-*.json | sort -V | tail -1)
    if [ -f "$FAKE_GH_DIR/stderr" ]; then cat "$FAKE_GH_DIR/stderr" >&2; exit 1; fi
    cat "$f"; grep -q pending "$f" && exit 8; exit 0 ;;
  *) echo "unexpected: $@" >&2; exit 2 ;;
esac
`,
	);
	chmodSync(path, 0o755);
};

const checks = (bucket: string, workflow = 'PR Deployment') =>
	JSON.stringify([{ name: 'deploy', workflow, bucket, link: 'https://github.test/run/1', startedAt: new Date().toISOString() }]);
const calls = () => (existsSync(join(dir, 'gh', 'calls.log')) ? readFileSync(join(dir, 'gh', 'calls.log'), 'utf8').trim().split('\n') : []);

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'fdw-share-'));
	remote = join(dir, 'origin.git');
	work = join(dir, 'work');
	mkdirSync(join(dir, 'gh'));
	process.env.FAKE_GH_DIR = join(dir, 'gh');
	delete process.env.FAKE_PR;
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', remote]);
	execFileSync('git', ['init', '-q', '-b', 'develop', work]);
	g(work, 'config', 'user.email', 'test@example.test');
	g(work, 'config', 'user.name', 'Test');
	writeFileSync(join(work, 'a.txt'), 'one\n');
	g(work, 'add', '.');
	g(work, 'commit', '-q', '-m', 'first');
	g(work, 'remote', 'add', 'origin', remote);
	g(work, 'push', '-q', 'origin', 'develop');
	g(work, 'checkout', '-q', '-b', 'fd/demo/i1');
	writeFileSync(join(work, 'proto.txt'), 'prototype\n');
	g(work, 'add', '.');
	g(work, 'commit', '-q', '-m', 'prototype');
	fakeGh = join(dir, 'fake-gh');
	writeFakeGh(fakeGh);
});

afterEach(() => {
	delete process.env.FAKE_GH_DIR;
	rmSync(dir, { recursive: true, force: true });
});

describe('pushBranch', () => {
	it('sends the branch to the remote, and says so', async () => {
		expect(await pushBranch(work, 'fd/demo/i1')).toEqual({ pushed: true });
		expect(g(remote, 'rev-parse', 'refs/heads/fd/demo/i1').trim()).toBe(g(work, 'rev-parse', 'HEAD').trim());
	});

	it('says nothing went when the remote already has exactly this', async () => {
		await pushBranch(work, 'fd/demo/i1');
		expect(await pushBranch(work, 'fd/demo/i1')).toEqual({ pushed: false });
	});

	it('sends only the new commits when shared again', async () => {
		await pushBranch(work, 'fd/demo/i1');
		writeFileSync(join(work, 'proto.txt'), 'changed\n');
		g(work, 'commit', '-q', '-am', 'change');
		expect(await pushBranch(work, 'fd/demo/i1')).toEqual({ pushed: true });
	});

	it('refuses, rather than forcing, when the remote has work this machine lacks', async () => {
		await pushBranch(work, 'fd/demo/i1');
		const other = join(dir, 'other');
		execFileSync('git', ['clone', '-q', remote, other]);
		g(other, 'config', 'user.email', 'o@example.test');
		g(other, 'config', 'user.name', 'Other');
		g(other, 'checkout', '-q', 'fd/demo/i1');
		writeFileSync(join(other, 'theirs.txt'), 'theirs\n');
		g(other, 'add', '.');
		g(other, 'commit', '-q', '-m', 'theirs');
		g(other, 'push', '-q', 'origin', 'fd/demo/i1');

		writeFileSync(join(work, 'proto.txt'), 'mine\n');
		g(work, 'commit', '-q', '-am', 'mine');
		const before = g(remote, 'rev-parse', 'refs/heads/fd/demo/i1');
		await expect(pushBranch(work, 'fd/demo/i1')).rejects.toThrow(/changes on the remote that this machine does not have/);
		expect(g(remote, 'rev-parse', 'refs/heads/fd/demo/i1')).toBe(before); // nothing was overwritten
	});

	it('refuses a branch that is not on this machine', async () => {
		await expect(pushBranch(work, 'fd/nope/i1')).rejects.toThrow(GitProblem);
	});
});

describe('sharing through the real tools', () => {
	const request: ShareRequest = {
		share: { url: 'https://dev-coke-pr-<pr>.example.test', workflow: 'PR Deployment', kinds: ['prototype'] },
		kind: 'prototype',
		projectId: 'demo',
		name: 'i1',
		branch: 'fd/demo/i1',
		title: 'Preview: demo i1 (not for merge)',
		body: 'draft',
	};
	const timings = { pollMs: 5, startupMs: 200, timeoutMs: 5000, skewMs: 120_000 };
	const settle = async (runner: ShareRunner) => {
		for (let i = 0; i < 400 && runner.status().state === 'running'; i++) await new Promise((r) => setTimeout(r, 10));
		return runner.status();
	};

	it('pushes, opens a DRAFT pull request, waits through a pending build, records the address', async () => {
		writeFileSync(join(dir, 'gh', 'checks-1.json'), checks('pending'));
		writeFileSync(join(dir, 'gh', 'checks-2.json'), checks('pass'));
		const records = join(dir, 'records');
		mkdirSync(join(records, 'demo'), { recursive: true });
		writeFileSync(join(records, 'demo', 'iterations.json'), JSON.stringify([{ projectId: 'demo', name: 'i1', branch: 'fd/demo/i1', commit: null, createdAt: 'x', note: '' }]));

		const seen: ShareStatus[] = [];
		const runner = new ShareRunner((s) => seen.push(s));
		runner.start({
			request,
			tools: realShareTools(work, fakeGh),
			timings,
			record: async (url) => void recordPreview(records, 'demo', 'i1', url),
		});
		const done = await settle(runner);

		expect(done).toMatchObject({ state: 'ready', url: 'https://dev-coke-pr-42.example.test', prUrl: 'https://github.test/o/r/pull/42' });
		expect(g(remote, 'rev-parse', 'refs/heads/fd/demo/i1').trim()).toBe(g(work, 'rev-parse', 'HEAD').trim());

		const create = calls().find((c) => c.startsWith('pr create'));
		expect(create).toContain('--draft');
		expect(create).toContain('--head fd/demo/i1');
		expect(calls().join('\n')).not.toMatch(/--ready|pr ready|pr merge/);
		expect(seen.map((s) => (s.state === 'running' ? s.step : s.state))).toEqual(expect.arrayContaining(['pushing', 'opening', 'building', 'ready']));

		expect(readIterations(records, 'demo')[0]?.previewUrl).toBe('https://dev-coke-pr-42.example.test');
	});

	it('does not open a second pull request when one is already open for the branch', async () => {
		writeFileSync(join(dir, 'gh', 'list.json'), JSON.stringify([{ number: 9, url: 'https://github.test/o/r/pull/9' }]));
		writeFileSync(join(dir, 'gh', 'checks-1.json'), checks('pass'));
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, fakeGh), timings, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'ready', url: 'https://dev-coke-pr-9.example.test' });
		expect(calls().some((c) => c.startsWith('pr create'))).toBe(false);
	});

	it('reports a failed deploy with the check and its log', async () => {
		writeFileSync(join(dir, 'gh', 'checks-1.json'), checks('fail'));
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, fakeGh), timings, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'failed', message: expect.stringContaining('run/1') });
	});

	it('treats "no checks reported" right after a push as not started yet', async () => {
		writeFileSync(join(dir, 'gh', 'checks-1.json'), '[]');
		writeFileSync(join(dir, 'gh', 'stderr'), "no checks reported on the 'fd/demo/i1' branch");
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, fakeGh), timings: { ...timings, startupMs: 40 }, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'failed', message: expect.stringContaining('did not start') });
	});

	it('says what to install when the GitHub CLI is missing', async () => {
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, join(dir, 'no-such-gh')), timings, record: async () => undefined });
		expect(await settle(runner)).toMatchObject({ state: 'failed', message: expect.stringContaining('https://cli.github.com') });
	});

	it('still pushes before it finds out gh is unusable, so nothing is lost', async () => {
		const runner = new ShareRunner(() => undefined);
		runner.start({ request, tools: realShareTools(work, join(dir, 'no-such-gh')), timings, record: async () => undefined });
		await settle(runner);
		expect(g(remote, 'rev-parse', '--verify', 'refs/heads/fd/demo/i1').trim()).toMatch(/^[0-9a-f]{40}$/);
	});
});

describe('locateGh', () => {
	it('prefers the PATH, then the usual install places, then the bare name', () => {
		expect(locateGh({ PATH: '/a:/b' }, (p) => p === '/b/gh')).toBe('/b/gh');
		expect(locateGh({ PATH: '/a' }, (p) => p === '/opt/homebrew/bin/gh')).toBe('/opt/homebrew/bin/gh');
		expect(locateGh({ PATH: '/a' }, () => false)).toBe('gh');
	});
});
