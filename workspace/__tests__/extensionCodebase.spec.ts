import { describe, expect, it, vi } from 'vitest';
import { type CodebaseDeps, type LocalRun, handOff, openCode, shareCodebase, viewLocally } from '../extension/src/codebase';
import type { AgentStatus, Project, RunLogLine, ShareStatus } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * A project's codebase work in VS Code (ELECTRON_MIGRATION_PLAN 5.2, 5.3): Handoff (the product's gate, both reviews,
 * HANDOFF.md, a verdict) as a build is shown, with Stop and its log; a draft pull request with a preview (Share); the
 * branch's own preview in the person's browser; and the work on GitHub. No pins: comments on it go on its pull request.
 */

const codebase = {
	name: 'codebase',
	branch: 'feature/zone-coverage',
	createdAt: '2026-10-10T10:00:00Z',
	repository: 'flocksafety/flock-coke',
	pullRequest: null,
	route: '/zones',
	openComments: 0,
};
const zone = {
	id: 'zone-coverage',
	title: 'Zone coverage',
	folder: null,
	records: [],
	people: [],
	iterations: [{ name: 'v1-i1', branch: 'prototype/zone-coverage/v1-i1', createdAt: '2026-10-01T10:00:00Z' }, codebase],
} as unknown as Project;
const prototypeOnly = { ...zone, id: 'alert-history', title: 'Alert history', iterations: [zone.iterations[0]] } as unknown as Project;

const world = (more: Record<string, unknown> = {}) => {
	const told: string[] = [];
	const said: string[] = [];
	const offered: [string, string[]][] = [];
	const shareListeners: ((s: ShareStatus) => void)[] = [];
	const finished: AgentStatus = { state: 'finished', exitCode: 0, work: codebase.branch, purpose: 'handoff' };
	const api = {
		agentReadiness: vi.fn(async () => ok({ state: 'ready' })),
		listProjects: vi.fn(async () => ok([zone, prototypeOnly])),
		readCheckout: vi.fn(async () => ok({ root: '/p', name: 'p', branch: codebase.branch, clean: true })),
		continueIteration: vi.fn(async () => ok({ root: '/p', name: 'p', branch: codebase.branch, clean: true })),
		agentStatus: vi.fn(async () => ok({ state: 'idle' })),
		startHandoff: vi.fn(async () => ok({ state: 'running', startedAt: '', work: codebase.branch, purpose: 'handoff' })),
		startAgent: vi.fn(),
		startCommand: vi.fn(async () => ok({ state: 'running', url: 'http://localhost:5173/' })),
		stopCommand: vi.fn(async () => ok({ state: 'stopped' })),
		handoffResult: vi.fn(async () => ok(true)),
		shareIteration: vi.fn(async () => ok({ state: 'running', projectId: zone.id, name: 'codebase', step: 'pushing' })),
		onShareStatus: vi.fn((l: (s: ShareStatus) => void) => {
			shareListeners.push(l);
			return () => undefined;
		}),
		stopAgent: vi.fn(async () => ok(null)),
		onAgentLog: vi.fn(() => () => undefined),
		...more,
	};
	api.agentStatus.mockResolvedValueOnce(ok({ state: 'idle' })).mockResolvedValue(ok(finished));
	const deps: CodebaseDeps = {
		api: api as unknown as CodebaseDeps['api'],
		root: '/p',
		progress: vi.fn(async (title, task) => {
			said.push(title);
			await task((m: string) => void said.push(m));
		}),
		log: { start: vi.fn(), line: vi.fn() },
		tell: (m) => void told.push(m),
		offer: vi.fn(async (message: string, actions: string[]) => {
			offered.push([message, actions]);
			return undefined;
		}),
		openExternal: vi.fn(async () => undefined),
		copy: vi.fn(async () => undefined),
		pollMs: 0,
	};
	return { deps, api, told, said, offered, shareListeners };
};

describe('Handoff, from VS Code', () => {
	it('runs on the project’s codebase work, said as it goes, and gives the verdict: ready, with a draft pull request offered', async () => {
		const { deps, api, said, offered } = world();
		await handOff(deps, 'zone-coverage');
		expect(api.startHandoff).toHaveBeenCalledWith('/p', 'zone-coverage');
		expect(said).toEqual(['Handing off Zone coverage', 'Running the product’s gate, both reviews and the fixes. This takes a while.']);
		expect(deps.log.start).toHaveBeenCalledWith('Zone coverage: handoff');
		expect(api.handoffResult).toHaveBeenCalledWith('/p');
		expect(offered).toEqual([
			['Ready for engineering: HANDOFF.md is on feature/zone-coverage, and nothing was pushed.', ['Open a draft pull request']],
		]);
	});

	it('says when it is not ready, or finished without saying, and offers nothing', async () => {
		for (const [verdict, words] of [
			[false, 'Zone coverage is not ready for engineering yet: its log says why.'],
			[null, 'The handoff of Zone coverage finished: its log says how it went.'],
		] as const) {
			const { deps, told, offered } = world({ handoffResult: vi.fn(async () => ok(verdict)) });
			await handOff(deps, 'zone-coverage');
			expect(told).toEqual([words]);
			expect(offered).toEqual([]);
		}
	});

	it('stops the agent when Stop is pressed, and gives no verdict', async () => {
		const { deps, api } = world();
		deps.progress = vi.fn(async (_title, task, onStop) => {
			onStop?.();
			await task(() => undefined);
		});
		await handOff(deps, 'zone-coverage');
		expect(api.stopAgent).toHaveBeenCalled();
		expect(api.handoffResult).not.toHaveBeenCalled();
	});

	it('is only for codebase work, and needs Claude Code', async () => {
		await expect(handOff(world().deps, 'alert-history')).rejects.toThrow('Alert history has no codebase work yet: build it in the codebase first.');
		const missing = world({ agentReadiness: vi.fn(async () => ok({ state: 'missing' })) });
		await expect(handOff(missing.deps, 'zone-coverage')).rejects.toThrow(/Claude Code is not installed/);
		expect(missing.api.startHandoff).not.toHaveBeenCalled();
	});

	it('says how a run that failed failed', async () => {
		const { deps } = world({ startHandoff: vi.fn(async () => ({ ok: false, error: 'Open feature/zone-coverage first.' })) });
		await expect(handOff(deps, 'zone-coverage')).rejects.toThrow('The handoff of Zone coverage did not finish: Open feature/zone-coverage first.');
	});
});

describe('sharing codebase work for review: a draft pull request, with a preview', () => {
	it('is said step by step until it is ready, and offers the pull request and the preview’s link', async () => {
		const { deps, api, said, offered, shareListeners } = world();
		deps.offer = vi.fn(async (message: string, actions: string[]) => {
			offered.push([message, actions]);
			return 'Open the pull request';
		});
		api.shareIteration.mockImplementation(async () => {
			setTimeout(() => {
				for (const l of shareListeners) l({ state: 'running', projectId: zone.id, name: 'codebase', step: 'opening' });
				for (const l of shareListeners)
					l({
						state: 'ready',
						projectId: zone.id,
						name: 'codebase',
						url: 'https://preview.example/pr-7',
						prUrl: 'https://github.com/flocksafety/flock-coke/pull/7',
					});
			}, 0);
			return ok({ state: 'running', projectId: zone.id, name: 'codebase', step: 'pushing' });
		});
		await shareCodebase(deps, 'zone-coverage');
		expect(api.shareIteration).toHaveBeenCalledWith('/p', 'zone-coverage', 'codebase');
		expect(said).toEqual(['Sharing Zone coverage for review', 'Pushing the branch…', 'Opening a draft pull request…']);
		expect(offered).toEqual([['Zone coverage is shared: a draft pull request, with a preview.', ['Open the pull request', 'Copy the preview link']]]);
		expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/flocksafety/flock-coke/pull/7');
	});

	it('copies the preview’s link when asked', async () => {
		const { deps, api, shareListeners } = world();
		deps.offer = vi.fn(async () => 'Copy the preview link');
		api.shareIteration.mockImplementation(async () => {
			setTimeout(() => {
				for (const l of shareListeners)
					l({ state: 'ready', projectId: zone.id, name: 'codebase', url: 'https://preview.example/pr-7', prUrl: 'https://github.com/x/y/pull/7' });
			}, 0);
			return ok({ state: 'running', projectId: zone.id, name: 'codebase', step: 'pushing' });
		});
		await shareCodebase(deps, 'zone-coverage');
		expect(deps.copy).toHaveBeenCalledWith('https://preview.example/pr-7');
	});

	it('says why it failed', async () => {
		const { deps, api, shareListeners } = world();
		api.shareIteration.mockImplementation(async () => {
			setTimeout(() => {
				for (const l of shareListeners) l({ state: 'failed', projectId: zone.id, name: 'codebase', message: 'The preview did not build.' });
			}, 0);
			return ok({ state: 'running', projectId: zone.id, name: 'codebase', step: 'pushing' });
		});
		await expect(shareCodebase(deps, 'zone-coverage')).rejects.toThrow('Zone coverage was not shared: The preview did not build.');
	});

	it('says at once when it cannot start', async () => {
		const { deps } = world({ shareIteration: vi.fn(async () => ({ ok: false, error: 'This product does not say how its work is shared.' })) });
		await expect(shareCodebase(deps, 'zone-coverage')).rejects.toThrow(
			'Zone coverage was not shared: This product does not say how its work is shared.',
		);
	});
});

describe('codebase work on GitHub', () => {
	it('is its pull request when it has one, else its branch, in the browser', async () => {
		const { deps } = world();
		await openCode(deps, 'zone-coverage');
		expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/flocksafety/flock-coke/tree/feature/zone-coverage');
		const withPr = world({
			listProjects: vi.fn(async () =>
				ok([{ ...zone, iterations: [zone.iterations[0], { ...codebase, pullRequest: 'https://github.com/flocksafety/flock-coke/pull/7' }] }]),
			),
		});
		await openCode(withPr.deps, 'zone-coverage');
		expect(withPr.deps.openExternal).toHaveBeenCalledWith('https://github.com/flocksafety/flock-coke/pull/7');
	});

	it('says when its record says neither', async () => {
		const { deps } = world({
			listProjects: vi.fn(async () => ok([{ ...zone, iterations: [{ ...codebase, repository: null }] }])),
		});
		await expect(openCode(deps, 'zone-coverage')).rejects.toThrow('The record of Zone coverage’s codebase work does not say where it is on GitHub.');
	});
});

describe('View locally: codebase work run on this machine, in the browser', () => {
	/** The product's own way of running, and this machine, as `extension.ts` gives them; each test changes what it is about. */
	const local = (over: Partial<LocalRun> = {}): LocalRun => ({
		port: () => 3000,
		installCommand: () => 'npm ci',
		answers: vi.fn(async () => false),
		loads: vi.fn(async () => null),
		...over,
	});
	const run = (more: Record<string, unknown> = {}, over: Partial<LocalRun> = {}) => {
		const logListeners: ((l: RunLogLine) => void)[] = [];
		const w = world({
			onRunLog: vi.fn((l: (line: RunLogLine) => void) => {
				logListeners.push(l);
				return () => undefined;
			}),
			...more,
		});
		const say = (text: string) => logListeners.forEach((l) => l({ commandId: 'design-mode', stream: 'stdout', text }));
		return { ...w, local: local(over), say };
	};

	it('runs the product’s own design mode on the work’s branch, checks the page loads, and opens it at its route, with Stop', async () => {
		const { deps, api, said, offered, local: l } = run();
		await viewLocally(deps, l, 'zone-coverage');
		// Its own earlier run first, so there is only ever one; then the port is checked as free; then it starts.
		expect(api.stopCommand).toHaveBeenCalledWith('/p', 'design-mode');
		expect(l.answers).toHaveBeenCalledWith(3000);
		expect(api.startCommand).toHaveBeenCalledWith('/p', 'design-mode', 'zone-coverage');
		expect(said[0]).toBe('Starting Zone coverage locally');
		expect(l.loads).toHaveBeenCalledWith('http://localhost:5173/zones');
		expect(deps.openExternal).toHaveBeenCalledWith('http://localhost:5173/zones');
		expect(offered.at(-1)).toEqual(['Zone coverage is running locally at http://localhost:5173/zones.', ['Stop']]);
	});

	it('says when the work has no page recorded, so it opened at the app’s front door', async () => {
		const noRoute = { ...zone, iterations: [zone.iterations[0], { ...codebase, route: null }] } as unknown as Project;
		const { deps, offered, local: l } = run({ listProjects: vi.fn(async () => ok([noRoute])) });
		await viewLocally(deps, l, 'zone-coverage');
		expect(deps.openExternal).toHaveBeenCalledWith('http://localhost:5173/');
		expect(offered.at(-1)).toEqual([
			'Zone coverage is running locally at http://localhost:5173/. Its record names no page for this work, so it opened at the app’s front door.',
			['Stop'],
		]);
	});

	it('stops it when Stop is pressed', async () => {
		const { deps, api, local: l } = run();
		deps.offer = vi.fn(async () => 'Stop');
		await viewLocally(deps, l, 'zone-coverage');
		expect(api.stopCommand).toHaveBeenCalledTimes(2);
	});

	it('does not start when something else already answers on the product’s port, and says so', async () => {
		const { deps, api, local: l } = run({}, { answers: vi.fn(async () => true) });
		await expect(viewLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			'Zone coverage couldn’t load locally: something else is already answering on port 3000. Stop it, then try again.',
		);
		expect(api.startCommand).not.toHaveBeenCalled();
	});

	it('says the product does not say how to run it, when it declares no port for design mode', async () => {
		const { deps, api, local: l } = run({}, { port: () => null });
		await expect(viewLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			'Zone coverage couldn’t load locally: the product’s .dsnr/workspace.json declares no design-mode command with a port.',
		);
		expect(api.startCommand).not.toHaveBeenCalled();
	});

	it('takes a build error in the server’s output as a failure, with that line, stops the server, and opens nothing', async () => {
		const { deps, api, local: l, say } = run();
		api.startCommand.mockImplementation((async () => {
			say('\u001b[31merror\u001b[39m   Build error:\n');
			say(
				"  × ESModulesLinkingError: export 'TransparencyPortalV2' (imported as 'TransparencyPortalV2') was not found in '@flocksafety/flock-transparency-portal' (possible exports: CsvComponent, DATA_UNAVAILABLE, FlockLogoComponent)\n",
			);
			say('error   build failed in 1.07 s\n');
			return ok({ state: 'running', url: 'http://localhost:5173/' });
		}) as never);
		await expect(viewLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			"Zone coverage couldn’t load locally: ESModulesLinkingError: export 'TransparencyPortalV2' (imported as 'TransparencyPortalV2') was not found in '@flocksafety/flock-transparency-portal'. Its packages may be out of date: npm ci",
		);
		expect(api.stopCommand).toHaveBeenCalledTimes(2);
		expect(deps.openExternal).not.toHaveBeenCalled();
	});

	it('takes a page that errors or draws nothing as a failure, not as running', async () => {
		const { deps, api, local: l } = run({}, { loads: vi.fn(async () => "Cannot read properties of undefined (reading 'None')") });
		await expect(viewLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			"Zone coverage couldn’t load locally: Cannot read properties of undefined (reading 'None')",
		);
		expect(api.stopCommand).toHaveBeenCalledTimes(2);
		expect(deps.openExternal).not.toHaveBeenCalled();
	});

	it('says why it did not start, and leaves the checkout alone when it is not clean', async () => {
		const notClean = run({
			readCheckout: vi.fn(async () => ok({ root: '/p', name: 'p', branch: 'develop', clean: false })),
			continueIteration: vi.fn(async () => ({ ok: false, error: 'There are uncommitted changes in p. Commit or stash them first.' })),
		});
		await expect(viewLocally(notClean.deps, notClean.local, 'zone-coverage')).rejects.toThrow(
			'Zone coverage couldn’t load locally: There are uncommitted changes in p. Commit or stash them first.',
		);
		expect(notClean.api.startCommand).not.toHaveBeenCalled();
		const failed = run({ startCommand: vi.fn(async () => ok({ state: 'failed', detail: 'exited with code 1' })) });
		await expect(viewLocally(failed.deps, failed.local, 'zone-coverage')).rejects.toThrow('Zone coverage couldn’t load locally: exited with code 1');
	});

	it('shows what the server prints in the log as it starts', async () => {
		const { deps, api, local: l, say } = run();
		api.startCommand.mockImplementation((async () => {
			say('ready   built in 4.2 s\n');
			return ok({ state: 'running', url: 'http://localhost:5173/' });
		}) as never);
		await viewLocally(deps, l, 'zone-coverage');
		expect(deps.log.start).toHaveBeenCalledWith('Zone coverage, locally');
		expect(deps.log.line).toHaveBeenCalledWith('ready   built in 4.2 s');
	});
});
