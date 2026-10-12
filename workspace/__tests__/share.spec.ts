import { describe, expect, it } from 'vitest';
import type { ShareStatus } from '../src/shared/contract';
import {
	type Check,
	DEFAULT_TIMINGS,
	type ShareRequest,
	ShareRunner,
	type ShareTools,
	previewIsUp,
	previewUrlFor,
	pullRequestText,
	runShare,
} from '../src/main/services/share';

const share = { url: 'https://dev-coke-pr-<pr>.example.test', workflow: 'PR Deployment', kinds: ['prototype' as const] };
const request: ShareRequest = {
	share,
	kind: 'prototype',
	projectId: 'demo',
	name: 'i1',
	branch: 'fd/demo/i1',
	title: 'Preview: demo i1',
	body: 'body',
};
const timings = { pollMs: 10, startupMs: 100, timeoutMs: 1000, skewMs: 50 };

/** A clock that only moves when the flow sleeps, so waiting costs no real time. */
const harness = (over: Partial<ShareTools> & { checkSequence?: Check[][] } = {}) => {
	let clock = 1_000_000;
	const calls: string[] = [];
	let n = 0;
	const tools: ShareTools = {
		push: async () => (calls.push('push'), { pushed: true }),
		findPr: async () => (calls.push('findPr'), null),
		createDraftPr: async () => (calls.push('createDraftPr'), { number: 42, url: 'https://github.test/o/r/pull/42' }),
		checks: async () => {
			calls.push('checks');
			const seq = over.checkSequence ?? [[check('pass')]];
			return seq[Math.min(n++, seq.length - 1)] ?? [];
		},
		sleep: async (ms) => void (clock += ms),
		now: () => clock,
		...over,
	};
	return { tools, calls, advance: (ms: number) => void (clock += ms), now: () => clock };
};
const check = (bucket: string, extra: Partial<Check> = {}): Check => ({
	name: 'deploy',
	workflow: 'PR Deployment',
	bucket,
	link: 'https://github.test/run/1',
	startedAt: new Date(1_000_000).toISOString(),
	...extra,
});

describe('runShare', () => {
	it('pushes, opens a draft pull request, waits for the deploy, and returns the address the descriptor describes', async () => {
		const h = harness({ checkSequence: [[check('pending')], [check('pending')], [check('pass')]] });
		const steps: string[] = [];
		const result = await runShare(request, h.tools, (s) => steps.push(s), timings);
		expect(result).toEqual({ url: 'https://dev-coke-pr-42.example.test', prUrl: 'https://github.test/o/r/pull/42' });
		expect(h.calls.slice(0, 3)).toEqual(['push', 'findPr', 'createDraftPr']);
		expect([...new Set(steps)]).toEqual(['pushing', 'opening', 'building']);
	});

	it('reuses the open pull request for the branch instead of opening a second', async () => {
		const h = harness({ findPr: async () => ({ number: 7, url: 'https://github.test/o/r/pull/7' }) });
		const r = await runShare(request, h.tools, () => undefined, timings);
		expect(h.calls).not.toContain('createDraftPr');
		expect(r.url).toBe('https://dev-coke-pr-7.example.test');
	});

	it('names the check that failed, with its log, rather than returning an address', async () => {
		const h = harness({ checkSequence: [[check('pending')], [check('fail', { name: 'build-artifact', link: 'https://github.test/run/9' })]] });
		await expect(runShare(request, h.tools, () => undefined, timings)).rejects.toThrow(/"build-artifact" did not succeed.*run\/9/s);
	});

	it('is not held up, or fooled, by other workflows: only the deploy workflow counts', async () => {
		const lint = check('fail', { workflow: 'Pull Request', name: 'lint' });
		const h = harness({ checkSequence: [[lint, check('pass')]] });
		await expect(runShare(request, h.tools, () => undefined, timings)).resolves.toMatchObject({ url: expect.any(String) });
	});

	it('says so when the deploy workflow never starts', async () => {
		const h = harness({ checkSequence: [[]] });
		await expect(runShare(request, h.tools, () => undefined, timings)).rejects.toThrow(/"PR Deployment" workflow did not start/);
	});

	it('does not take the previous push’s passing checks as evidence about this one', async () => {
		// A check that finished before this push began, which is what is left from last time.
		const old = check('pass', { startedAt: new Date(1_000_000 - 10_000).toISOString() });
		const h = harness({ checkSequence: [[old], [old], [check('pending')], [check('pass', { startedAt: new Date(1_000_100).toISOString() })]] });
		let waited = 0;
		await runShare(request, h.tools, (s) => s === 'building' && waited++, { ...timings, startupMs: 1000 });
		expect(waited).toBeGreaterThanOrEqual(3); // it kept waiting rather than returning on the stale pass
	});

	it('accepts existing checks when nothing new was pushed', async () => {
		const old = check('pass', { startedAt: new Date(1_000_000 - 10_000_000).toISOString() });
		const h = harness({ push: async () => ({ pushed: false }), checkSequence: [[old]] });
		await expect(runShare(request, h.tools, () => undefined, timings)).resolves.toMatchObject({ url: expect.any(String) });
	});

	it('gives up with a message that says it may still finish', async () => {
		const h = harness({ checkSequence: [[check('pending')]] });
		await expect(runShare(request, h.tools, () => undefined, { ...timings, timeoutMs: 100 })).rejects.toThrow(/still building.*may yet finish/s);
	});

	it('refuses a kind the repository does not build previews for, before touching anything', async () => {
		const h = harness();
		await expect(runShare({ ...request, kind: 'codebase' }, h.tools, () => undefined, timings)).rejects.toThrow(
			/does not build a preview for codebase work.*prototype/s,
		);
		expect(h.calls).toEqual([]);
	});

	it.each(['-delete', '--force', 'a/../b', ''])('refuses a branch name that could be read as an option or a path: %j', async (branch) => {
		const h = harness();
		await expect(runShare({ ...request, branch }, h.tools, () => undefined, timings)).rejects.toThrow(/is not a branch name that can be shared/);
		expect(h.calls).toEqual([]);
	});

	it('stops when nobody is waiting any more', async () => {
		const h = harness({ checkSequence: [[check('pending')]] });
		let live = true;
		const done = runShare(
			request,
			h.tools,
			(s) => s === 'building' && (live = false),
			timings,
			() => live,
		);
		await expect(done).rejects.toThrow(/stopped/);
	});
});

describe('the pull request text', () => {
	it('says it is a preview and not for merge, and where the record is', () => {
		const { title, body } = pullRequestText('demo', 'i1');
		expect(title).toMatch(/not for merge/);
		expect(body).toMatch(/draft pull request/);
		expect(body).toMatch(/should not be merged/);
		expect(body).toContain('projects/demo');
	});
});

describe('addresses', () => {
	it('fills the pull request number into the descriptor’s pattern', () => {
		expect(previewUrlFor(share, 1486)).toBe('https://dev-coke-pr-1486.example.test');
	});

	it.each([
		[200, true],
		[302, true],
		[401, true],
		[403, true],
		[404, false],
		[502, false],
		[503, false],
	])('treats HTTP %i as up: %s', (status, up) => {
		expect(previewIsUp(status)).toBe(up);
	});
});

describe('ShareRunner', () => {
	const flush = () => new Promise((r) => setTimeout(r, 0));

	it('reports running, then ready with what happened to the record', async () => {
		const seen: ShareStatus[] = [];
		const runner = new ShareRunner((s) => seen.push(s));
		const recorded: string[][] = [];
		const h = harness();
		runner.start({
			request,
			tools: h.tools,
			timings,
			record: async (url, prUrl) => void recorded.push([url, prUrl]),
		});
		await flush();
		expect(seen[0]).toMatchObject({ state: 'running', projectId: 'demo', name: 'i1' });
		expect(seen.at(-1)).toEqual({
			state: 'ready',
			projectId: 'demo',
			name: 'i1',
			url: 'https://dev-coke-pr-42.example.test',
			prUrl: 'https://github.test/o/r/pull/42',
		});
		expect(recorded).toEqual([['https://dev-coke-pr-42.example.test', 'https://github.test/o/r/pull/42']]);
	});

	it('reports a failure, and records nothing', async () => {
		const runner = new ShareRunner(() => undefined);
		let recorded = false;
		runner.start({
			request,
			tools: harness({ checkSequence: [[check('fail')]] }).tools,
			timings,
			record: async () => void (recorded = true),
		});
		await flush();
		expect(runner.status()).toMatchObject({ state: 'failed', message: expect.stringContaining('did not succeed') });
		expect(recorded).toBe(false);
	});

	it('does not start a second share while one is running', async () => {
		const runner = new ShareRunner(() => undefined);
		const h = harness({ checkSequence: [[check('pending')]], sleep: () => new Promise((r) => setTimeout(r, 5)) });
		runner.start({ request, tools: h.tools, timings: { ...timings, timeoutMs: 10_000 }, record: async () => undefined });
		expect(() => runner.start({ request, tools: h.tools, timings, record: async () => undefined })).toThrow(/Already sharing demo i1/);
		runner.stop();
	});

	it('can be shared again after it finishes', async () => {
		const runner = new ShareRunner(() => undefined);
		const job = { request, tools: harness().tools, timings, record: async () => undefined };
		runner.start(job);
		await flush();
		runner.start({ ...job, tools: harness().tools });
		expect(runner.status().state).toBe('running');
		await flush();
	});

	it('has sensible defaults for a real build', () => {
		expect(DEFAULT_TIMINGS.timeoutMs).toBeGreaterThanOrEqual(10 * 60_000);
	});
});
