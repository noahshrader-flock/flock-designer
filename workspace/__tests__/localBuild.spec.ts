import { describe, expect, it, vi } from 'vitest';
import type { ProjectWork } from '../src/shared/contract';
import { type BuildApi, type BuildPhase, previewAddress, runLocalBuild } from '../src/renderer/localBuild';
import { agentFinished, agentRunning, aProject, projectWork } from './fixtures';

const work = (over: Partial<ProjectWork> = {}): ProjectWork => projectWork({ name: 'codebase', branch: 'feature/users', ...over });
const project = aProject({ id: 'users', title: 'Users' });

/** A workspace that does what a healthy one does, with any step overridable. */
const api = (over: Partial<Record<keyof BuildApi, unknown>> = {}) => {
	const calls: string[] = [];
	const ok = (name: string, value: unknown) => vi.fn(async () => (calls.push(name), { ok: true as const, value }));
	const a = {
		readCheckout: ok('readCheckout', { root: '/r', name: 'coke', branch: 'feature/users', clean: true }),
		continueWork: ok('continueWork', {}),
		startAgent: ok('startAgent', agentRunning()),
		startHandoff: ok('startHandoff', agentRunning('feature/users', 'handoff')),
		agentStatus: ok('agentStatus', agentFinished()),
		startCommand: ok('startCommand', { state: 'running', commandId: 'design-mode', url: 'http://localhost:3100/' }),
		...over,
	} as unknown as BuildApi;
	return { a, calls };
};

const run = async (a: BuildApi, extra: Partial<Parameters<typeof runLocalBuild>[0]> = {}) => {
	const phases: BuildPhase[] = [];
	const url = await runLocalBuild({
		api: a,
		root: '/r',
		project,
		work: work(),
		isLive: () => true,
		onPhase: (p) => phases.push(p),
		pollMs: 1,
		...extra,
	});
	return { url, phases };
};

describe('opening a version', () => {
	it('starts its preview and reports the address, with no one asked to do anything', async () => {
		const { a, calls } = api();
		const { url, phases } = await run(a);
		expect(url).toBe('http://localhost:3100/');
		expect(phases.map((p) => p.kind)).toEqual(['preview', 'running']);
		expect(calls).not.toContain('startAgent');
	});

	it("leaves the checkout alone when it is already on the version's branch", async () => {
		const { a, calls } = api();
		await run(a);
		expect(calls).not.toContain('continueWork');
	});

	it("moves the checkout to the version's branch when it is elsewhere", async () => {
		const { a, calls } = api({ readCheckout: vi.fn(async () => ({ ok: true, value: { branch: 'develop' } })) });
		await run(a);
		expect(a.continueWork).toHaveBeenCalledWith('/r', 'users', 'codebase');
		expect(calls).toContain('startCommand');
	});

	it("opens where the work is when the record says, instead of the product's front door", async () => {
		// Codebase work runs the whole product. Without this it opens on whatever the app shows
		// first, which is how a comment meant for /roles/compare was made on the Organizations list.
		const { a } = api();
		const { url, phases } = await run(a, { work: work({ name: 'codebase', route: '/roles/compare' }) });
		expect(url).toBe('http://localhost:3100/roles/compare');
		expect(phases.at(-1)).toEqual({ kind: 'running', url: 'http://localhost:3100/roles/compare' });
	});

	it("starts the product's own design mode, naming the project, as every piece of work shares one port", async () => {
		const { a } = api();
		await run(a);
		expect(a.startCommand).toHaveBeenCalledWith('/r', 'design-mode', 'users');
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
			agentStatus: vi.fn(async () => ({
				ok: true,
				value: ++polls < 3 ? { state: 'running' } : agentFinished(),
			})),
		});
		await run(a, { task: 'x' });
		expect(polls).toBe(3);
	});

	it('does not start the preview if the agent stopped with an error, and says so', async () => {
		const { a } = api({ agentStatus: vi.fn(async () => ({ ok: true, value: agentFinished(2) })) });
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
			readCheckout: vi.fn(async () => ({ ok: true, value: { branch: 'develop' } })),
			continueWork: vi.fn(async () => ({ ok: false, error: 'There are uncommitted changes. Commit them first.' })),
		});
		const { url, phases } = await run(a);
		expect(url).toBeNull();
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'There are uncommitted changes. Commit them first.' });
		expect(a.startCommand).not.toHaveBeenCalled();
	});

	it('reports a preview that would not start', async () => {
		const { a } = api({
			startCommand: vi.fn(async () => ({ ok: true, value: { state: 'failed', commandId: 'design-mode', detail: 'Port 3100 is in use.' } })),
		});
		const { phases } = await run(a);
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'Port 3100 is in use.' });
	});

	it('says the preview stopped, rather than a vague failure, when its process ended before answering', async () => {
		const { a } = api({ startCommand: vi.fn(async () => ({ ok: true, value: { state: 'stopped' } })) });
		const { phases } = await run(a);
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'The preview stopped before it was ready. Its output is below.' });
	});

	it('reports a failure to reach the repository', async () => {
		const { a } = api({ readCheckout: vi.fn(async () => ({ ok: false, error: 'not a git repository' })) });
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
			api: {
				...a,
				readCheckout: vi.fn(async () => {
					live = false;
					return { ok: true as const, value: { root: '/r', name: 'c', branch: 'feature/users', clean: true } };
				}),
			} as BuildApi,
			root: '/r',
			project,
			work: work(),
			isLive: () => live,
			onPhase: (p) => phases.push(p),
		});
		expect(url).toBeNull();
		expect(phases).toEqual([]);
		expect(a.startCommand).not.toHaveBeenCalled();
	});

	it('does not switch branches for a screen that has already gone', async () => {
		// React runs every effect twice in development, canceling the first run. If that run
		// still switched branches, two checkouts ran at once and one hit git's lock.
		let live = true;
		const { a } = api({
			readCheckout: vi.fn(async () => {
				live = false;
				return { ok: true, value: { branch: 'develop' } };
			}),
		});
		const url = await runLocalBuild({ api: a, root: '/r', project, work: work(), isLive: () => live, onPhase: () => undefined });
		expect(url).toBeNull();
		expect(a.continueWork).not.toHaveBeenCalled();
	});

	it('waits on its own agent when opened again mid-build, without asking for the work twice', async () => {
		let polls = 0;
		const { a, calls } = api({
			agentStatus: vi.fn(async () => ({
				ok: true,
				value: ++polls < 3 ? { state: 'running', work: 'feature/users' } : agentFinished(),
			})),
		});
		const { url, phases } = await run(a);
		expect(calls).not.toContain('startAgent');
		expect(phases.map((p) => p.kind)).toEqual(['agent', 'preview', 'running']);
		expect(url).toBe('http://localhost:3100/');
	});

	it("does not mistake another piece of work's run for its own", async () => {
		const { a, calls } = api({ agentStatus: vi.fn(async () => ({ ok: true, value: { state: 'running', work: 'prototype/other/v1' } })) });
		const { phases } = await run(a);
		expect(calls).not.toContain('startAgent');
		expect(phases.map((p) => p.kind)).toEqual(['preview', 'running']);
	});

	it('does not call a run finished that left changes it never committed', async () => {
		let opens = 0;
		const { a, calls } = api({
			readCheckout: vi.fn(async () => ({ ok: true, value: { root: '/r', name: 'coke', branch: 'feature/users', clean: opens++ === 0 } })),
		});
		const { phases } = await run(a, { task: 'build it' });
		expect(phases.at(-1)).toMatchObject({ kind: 'failed', message: expect.stringMatching(/did not commit/) });
		expect(calls).not.toContain('startCommand');
	});

	it('ends a Handoff with a report, not a preview, and has the main process start it', async () => {
		const { a, calls } = api();
		const { url, phases } = await run(a, { handoff: true });
		expect(url).toBeNull();
		expect(phases).toEqual([{ kind: 'agent', handoff: true }, { kind: 'reported' }]);
		expect(calls).toContain('startHandoff');
		expect(calls).not.toContain('startAgent');
		expect(calls).not.toContain('startCommand');
	});

	it('picks a Handoff up again when opened mid-run, and still ends in its report', async () => {
		let polls = 0;
		const { a, calls } = api({
			agentStatus: vi.fn(async () => ({
				ok: true,
				value: ++polls < 3 ? { state: 'running', work: 'feature/users', purpose: 'handoff' } : agentFinished(),
			})),
		});
		const { phases } = await run(a);
		expect(phases).toEqual([{ kind: 'agent', handoff: true }, { kind: 'reported' }]);
		expect(calls).not.toContain('startHandoff');
		expect(calls).not.toContain('startCommand');
	});

	it('says when the checkout has changes nobody here made, and still opens the preview', async () => {
		const { a } = api({
			readCheckout: vi.fn(async () => ({ ok: true, value: { root: '/r', name: 'coke', branch: 'feature/users', clean: false } })),
		});
		const { phases } = await run(a);
		expect(phases.at(-1)).toMatchObject({ kind: 'running', uncommitted: true });
	});

	it('stops polling an agent whose screen has gone', async () => {
		let live = true;
		let polls = 0;
		const { a } = api({
			agentStatus: vi.fn(async () => {
				polls++;
				live = false;
				return { ok: true, value: { state: 'running' } };
			}),
		});
		const url = await runLocalBuild({
			api: a,
			root: '/r',
			project,
			work: work(),
			task: 'x',
			isLive: () => live,
			onPhase: () => undefined,
			pollMs: 1,
		});
		expect(url).toBeNull();
		expect(polls).toBeLessThanOrEqual(1);
		expect(a.startCommand).not.toHaveBeenCalled();
	});
});

describe('previewAddress', () => {
	it("joins the version's route onto the preview, keeping its port", () => {
		expect(previewAddress('http://localhost:3100/', '/roles/compare')).toBe('http://localhost:3100/roles/compare');
		expect(previewAddress('http://localhost:3000/', '/roles/compare?state=error')).toBe('http://localhost:3000/roles/compare?state=error');
	});

	it('opens where the preview starts when there is no route, which is every prototype', () => {
		expect(previewAddress('http://localhost:3100/', null)).toBe('http://localhost:3100/');
		expect(previewAddress('http://localhost:3100/', undefined)).toBe('http://localhost:3100/');
		expect(previewAddress('http://localhost:3100/', '')).toBe('http://localhost:3100/');
	});

	it('never leaves the preview, whatever the record says', () => {
		// asRoute refuses these where the record is read; this is the second door, because the value
		// is joined onto an address the preview then loads.
		for (const bad of ['https://evil.test/steal', '//evil.test', 'javascript:alert(1)']) {
			expect(previewAddress('http://localhost:3100/', bad)).toBe('http://localhost:3100/');
		}
	});

	it('keeps a preview address that is not a URL rather than failing to open anything', () => {
		expect(previewAddress('not a url', '/roles/compare')).toBe('not a url');
	});
});
