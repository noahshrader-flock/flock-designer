import { describe, expect, it, vi } from 'vitest';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { type BuildApi, type BuildPhase, previewCommandFor, runLocalBuild } from '../src/renderer/localBuild';

const iteration = (over: Partial<ProjectIteration> = {}): ProjectIteration => ({
	name: 'i1', branch: 'fd/users/i1', issueNumber: null, previewUrl: null, commit: null, contributors: [], ...over,
});
const project: Project = { id: 'users', title: 'Users', records: [], iterations: [], people: [], openComments: 0 };

/** A workspace that does what a healthy one does, with any step overridable. */
const api = (over: Partial<Record<keyof BuildApi, unknown>> = {}) => {
	const calls: string[] = [];
	const ok = (name: string, value: unknown) => vi.fn(async () => (calls.push(name), { ok: true as const, value }));
	const a = {
		openCheckout: ok('openCheckout', { root: '/r', name: 'coke', branch: 'fd/users/i1', clean: true }),
		continueIteration: ok('continueIteration', {}),
		startAgent: ok('startAgent', { state: 'running', startedAt: 'now' }),
		agentStatus: ok('agentStatus', { state: 'finished', exitCode: 0 }),
		startCommand: ok('startCommand', { state: 'running', commandId: 'preview', url: 'http://localhost:3100/' }),
		...over,
	} as unknown as BuildApi;
	return { a, calls };
};

const run = async (a: BuildApi, extra: Partial<Parameters<typeof runLocalBuild>[0]> = {}) => {
	const phases: BuildPhase[] = [];
	const url = await runLocalBuild({ api: a, root: '/r', project, iteration: iteration(), isLive: () => true, onPhase: (p) => phases.push(p), pollMs: 1, ...extra });
	return { url, phases };
};

describe('opening an iteration', () => {
	it('starts its preview and reports the address, with no one asked to do anything', async () => {
		const { a, calls } = api();
		const { url, phases } = await run(a);
		expect(url).toBe('http://localhost:3100/');
		expect(phases.map((p) => p.kind)).toEqual(['preview', 'running']);
		expect(calls).not.toContain('startAgent');
	});

	it('leaves the checkout alone when it is already on the iteration\'s branch', async () => {
		const { a, calls } = api();
		await run(a);
		expect(calls).not.toContain('continueIteration');
	});

	it('moves the checkout to the iteration\'s branch when it is elsewhere', async () => {
		const { a, calls } = api({ openCheckout: vi.fn(async () => ({ ok: true, value: { branch: 'develop' } })) });
		await run(a);
		expect(a.continueIteration).toHaveBeenCalledWith('/r', 'users', 'i1');
		expect(calls).toContain('startCommand');
	});

	it('serves a prototype with the prototype command and codebase work with the real shell', () => {
		expect(previewCommandFor(iteration({ name: 'i3' }))).toBe('preview');
		expect(previewCommandFor(iteration({ name: 'codebase' }))).toBe('design-mode');
	});

	it('names the project when it starts the preview, because every prototype shares one port', async () => {
		const { a } = api();
		await run(a);
		expect(a.startCommand).toHaveBeenCalledWith('/r', 'preview', 'users');
	});
});

describe('work that was just created', () => {
	it('has the agent build it first, then starts the preview', async () => {
		const { a, calls } = api();
		const { url, phases } = await run(a, { task: 'Flag inactive users' });
		expect(phases.map((p) => p.kind)).toEqual(['agent', 'preview', 'running']);
		expect(calls.indexOf('startAgent')).toBeLessThan(calls.indexOf('startCommand'));
		expect(a.startAgent).toHaveBeenCalledWith('/r', 'users', 'Flag inactive users');
		expect(url).toBeTruthy();
	});

	it('waits for the agent while it is still working', async () => {
		let polls = 0;
		const { a } = api({
			agentStatus: vi.fn(async () => ({ ok: true, value: ++polls < 3 ? { state: 'running' } : { state: 'finished', exitCode: 0 } })),
		});
		await run(a, { task: 'x' });
		expect(polls).toBe(3);
	});

	it('does not start the preview if the agent stopped with an error, and says so', async () => {
		const { a } = api({ agentStatus: vi.fn(async () => ({ ok: true, value: { state: 'finished', exitCode: 2 } })) });
		const { url, phases } = await run(a, { task: 'x' });
		expect(url).toBeNull();
		expect(a.startCommand).not.toHaveBeenCalled();
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'The agent stopped with code 2.' });
	});

	it('says what is wrong when the agent is not installed', async () => {
		const { a } = api({ startAgent: vi.fn(async () => ({ ok: true, value: { state: 'unavailable', detail: 'Is it installed and on PATH?' } })) });
		const { phases } = await run(a, { task: 'x' });
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'Is it installed and on PATH?' });
	});
});

describe('when something goes wrong', () => {
	it('reports a dirty working tree with what it was told, instead of carrying on', async () => {
		const { a } = api({
			openCheckout: vi.fn(async () => ({ ok: true, value: { branch: 'develop' } })),
			continueIteration: vi.fn(async () => ({ ok: false, error: 'There are uncommitted changes. Commit them first.' })),
		});
		const { url, phases } = await run(a);
		expect(url).toBeNull();
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'There are uncommitted changes. Commit them first.' });
		expect(a.startCommand).not.toHaveBeenCalled();
	});

	it('reports a preview that would not start', async () => {
		const { a } = api({ startCommand: vi.fn(async () => ({ ok: true, value: { state: 'failed', commandId: 'preview', detail: 'Port 3100 is in use.' } })) });
		const { phases } = await run(a);
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'Port 3100 is in use.' });
	});

	it('says the preview stopped, rather than a vague failure, when its process ended before answering', async () => {
		const { a } = api({ startCommand: vi.fn(async () => ({ ok: true, value: { state: 'stopped' } })) });
		const { phases } = await run(a);
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'The preview stopped before it was ready. Its output is below.' });
	});

	it('reports a failure to reach the repository', async () => {
		const { a } = api({ openCheckout: vi.fn(async () => ({ ok: false, error: 'not a git repository' })) });
		const { phases } = await run(a);
		expect(phases).toEqual([{ kind: 'failed', message: 'not a git repository' }]);
	});
});

describe('when nobody is looking any more', () => {
	it('stops before starting a preview that nobody will see', async () => {
		const { a } = api();
		let live = true;
		const phases: BuildPhase[] = [];
		const url = await runLocalBuild({
			api: { ...a, openCheckout: vi.fn(async () => { live = false; return { ok: true as const, value: { root: '/r', name: 'c', branch: 'fd/users/i1', clean: true } }; }) } as BuildApi,
			root: '/r', project, iteration: iteration(), isLive: () => live, onPhase: (p) => phases.push(p),
		});
		expect(url).toBeNull();
		expect(phases).toEqual([]);
		expect(a.startCommand).not.toHaveBeenCalled();
	});

	it('stops polling an agent whose screen has gone', async () => {
		let live = true;
		let polls = 0;
		const { a } = api({ agentStatus: vi.fn(async () => { polls++; live = false; return { ok: true, value: { state: 'running' } }; }) });
		const url = await runLocalBuild({ api: a, root: '/r', project, iteration: iteration(), task: 'x', isLive: () => live, onPhase: () => undefined, pollMs: 1 });
		expect(url).toBeNull();
		expect(polls).toBeLessThanOrEqual(1);
		expect(a.startCommand).not.toHaveBeenCalled();
	});
});
