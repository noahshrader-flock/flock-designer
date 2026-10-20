import { describe, expect, it, vi } from 'vitest';
import { type CodebaseDeps, type LocalRun, handOff, openCode, shareCodebase, runLocally, updateBranch } from '../extension/src/codebase';
import type { HandoffResult, Project, RunLogLine, ShareStatus } from '../src/shared/contract';
import { ok } from '../src/shared/result';

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
	work: [{ name: 'v1', branch: 'prototype/zone-coverage/v1', createdAt: '2026-10-01T10:00:00Z' }, codebase],
} as unknown as Project;
const prototypeOnly = { ...zone, id: 'alert-history', title: 'Alert history', work: [zone.work[0]] } as unknown as Project;

const world = (more: Record<string, unknown> = {}) => {
	const told: string[] = [];
	const said: string[] = [];
	const offered: [string, string[]][] = [];
	const shareListeners: ((s: ShareStatus) => void)[] = [];
	const watching: (() => Promise<boolean>)[] = [];
	const api = {
		agentReadiness: vi.fn(async () => ok({ state: 'ready' })),
		listProjects: vi.fn(async () => ok([zone, prototypeOnly])),
		handOff: vi.fn(async () => ok({ agent: 'Claude Code', opened: 'typed', command: null })),
		handoffResult: vi.fn(async () => ok({ state: 'waiting' } as HandoffResult)),
		handCodebaseUpdate: vi.fn(async () => ok({ agent: 'Claude Code', opened: 'typed', command: null })),
		runLocally: vi.fn(async () => ok({ url: 'http://localhost:5173/zones', uncommitted: false })),
		stopCommand: vi.fn(async () => ok({ state: 'stopped' })),
		shareWork: vi.fn(async () => ok({ state: 'running', projectId: zone.id, name: 'codebase', step: 'pushing' })),
		onShareStatus: vi.fn((l: (s: ShareStatus) => void) => {
			shareListeners.push(l);
			return () => undefined;
		}),
		stopAgent: vi.fn(async () => ok(null)),
		onAgentLog: vi.fn(() => () => undefined),
		...more,
	};
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
		watch: (check) => void watching.push(check),
	};
	return { deps, api, told, said, offered, shareListeners, watching };
};

describe('Update this branch, from VS Code', () => {
	it('hands the update to the agent, says nothing is merged until it does it, and watches for nothing', async () => {
		const { deps, api, told, watching } = world();
		await updateBranch(deps, 'zone-coverage');
		expect(api.handCodebaseUpdate).toHaveBeenCalledWith('/p', 'zone-coverage');
		expect(told).toEqual([
			'Bringing feature/zone-coverage up to date is in Claude Code in this window now: a new conversation there has the task typed in. Press Enter there to start it. Nothing is merged until it does it there; DSNR kept where the branch was, so the update can be undone.',
		]);
		expect(watching).toEqual([]);
	});

	it('refuses a project with no codebase work, before asking anything', async () => {
		const { deps, api } = world();
		await expect(updateBranch(deps, 'alert-history')).rejects.toThrow('Alert history has no codebase work yet');
		expect(api.handCodebaseUpdate).not.toHaveBeenCalled();
	});
});

describe('Handoff, from VS Code', () => {
	const done = (result: Partial<Extract<HandoffResult, { state: 'done' }>>) =>
		vi.fn(async () => ok({ state: 'done', verdict: 'ready', pushed: false, outside: [], ...result } as HandoffResult));

	it('hands the project’s codebase work to the agent, says so, and watches for HANDOFF.md', async () => {
		const { deps, api, told, watching } = world();
		await handOff(deps, 'zone-coverage');
		expect(api.handOff).toHaveBeenCalledWith('/p', 'zone-coverage');
		expect(told).toHaveLength(1);
		expect(told[0]).toMatch(/^The handoff of Zone coverage is in Claude Code in this window now/);
		expect(told[0]).toMatch(/When HANDOFF\.md is committed on feature\/zone-coverage, DSNR says whether it is ready\.$/);
		expect(watching).toHaveLength(1);
		// Still going: it keeps watching and says nothing more.
		expect(await watching[0]!()).toBe(false);
		expect(told).toHaveLength(1);
	});

	it('offers a draft pull request once HANDOFF.md says ready and nothing was pushed', async () => {
		const { deps, offered, watching } = world({ handoffResult: done({}) });
		await handOff(deps, 'zone-coverage');
		expect(await watching[0]!()).toBe(true);
		expect(offered).toEqual([
			['Ready for engineering: HANDOFF.md is on feature/zone-coverage, and nothing was pushed.', ['Open a draft pull request']],
		]);
	});

	it('says when it is not ready, or HANDOFF.md says neither, and offers nothing', async () => {
		for (const [verdict, words] of [
			['not ready', 'Zone coverage is not ready for engineering yet: HANDOFF.md says why.'],
			[null, 'HANDOFF.md is committed on feature/zone-coverage, but its first line says neither Ready for engineering nor Not ready.'],
		] as const) {
			const { deps, told, offered, watching } = world({ handoffResult: done({ verdict }) });
			await handOff(deps, 'zone-coverage');
			await watching[0]!();
			expect(told.slice(1)).toEqual([words]);
			expect(offered).toEqual([]);
		}
	});

	it('says a push, which keeps the work from being offered, and names files a handoff leaves alone', async () => {
		const pushed = world({ handoffResult: done({ pushed: true, outside: ['.github/workflows/ci.yml'] }) });
		await handOff(pushed.deps, 'zone-coverage');
		await pushed.watching[0]!();
		expect(pushed.offered).toEqual([]);
		expect(pushed.told.slice(1)).toEqual([
			'HANDOFF.md says Zone coverage is ready, but it is not recorded as ready. The agent pushed feature/zone-coverage, which a handoff never does: look at what reached GitHub. It changed files a handoff leaves alone: .github/workflows/ci.yml.',
		]);
		// Files it should have left alone are said, not a reason to hold back work that is ready.
		const outside = world({ handoffResult: done({ outside: ['package-lock.json'] }) });
		await handOff(outside.deps, 'zone-coverage');
		await outside.watching[0]!();
		expect(outside.offered).toEqual([
			[
				'Ready for engineering: HANDOFF.md is on feature/zone-coverage, and nothing was pushed. It changed files a handoff leaves alone: package-lock.json.',
				['Open a draft pull request'],
			],
		]);
	});

	it('is only for codebase work, and says why one was refused', async () => {
		await expect(handOff(world().deps, 'alert-history')).rejects.toThrow('Alert history has no codebase work yet: build it in the codebase first.');
		const { deps, watching } = world({ handOff: vi.fn(async () => ({ ok: false, error: 'Open feature/zone-coverage first.' })) });
		await expect(handOff(deps, 'zone-coverage')).rejects.toThrow('Open feature/zone-coverage first.');
		expect(watching).toEqual([]);
	});
});

describe('sharing codebase work for review: a draft pull request, with a preview', () => {
	it('is said step by step until it is ready, and offers the pull request and the preview’s link', async () => {
		const { deps, api, said, offered, shareListeners } = world();
		deps.offer = vi.fn(async (message: string, actions: string[]) => {
			offered.push([message, actions]);
			return 'Open the pull request';
		});
		api.shareWork.mockImplementation(async () => {
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
		expect(api.shareWork).toHaveBeenCalledWith('/p', 'zone-coverage', 'codebase');
		expect(said).toEqual(['Sharing Zone coverage for review', 'Pushing the branch…', 'Opening a draft pull request…']);
		expect(offered).toEqual([['Zone coverage is shared: a draft pull request, with a preview.', ['Open the pull request', 'Copy the preview link']]]);
		expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/flocksafety/flock-coke/pull/7');
	});

	it('copies the preview’s link when asked', async () => {
		const { deps, api, shareListeners } = world();
		deps.offer = vi.fn(async () => 'Copy the preview link');
		api.shareWork.mockImplementation(async () => {
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
		api.shareWork.mockImplementation(async () => {
			setTimeout(() => {
				for (const l of shareListeners) l({ state: 'failed', projectId: zone.id, name: 'codebase', message: 'The preview did not build.' });
			}, 0);
			return ok({ state: 'running', projectId: zone.id, name: 'codebase', step: 'pushing' });
		});
		await expect(shareCodebase(deps, 'zone-coverage')).rejects.toThrow('Zone coverage was not shared: The preview did not build.');
	});

	it('says at once when it cannot start', async () => {
		const { deps } = world({ shareWork: vi.fn(async () => ({ ok: false, error: 'This product does not say how its work is shared.' })) });
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
				ok([{ ...zone, work: [zone.work[0], { ...codebase, pullRequest: 'https://github.com/flocksafety/flock-coke/pull/7' }] }]),
			),
		});
		await openCode(withPr.deps, 'zone-coverage');
		expect(withPr.deps.openExternal).toHaveBeenCalledWith('https://github.com/flocksafety/flock-coke/pull/7');
	});

	it('says when its record says neither', async () => {
		const { deps } = world({
			listProjects: vi.fn(async () => ok([{ ...zone, work: [{ ...codebase, repository: null }] }])),
		});
		await expect(openCode(deps, 'zone-coverage')).rejects.toThrow('The record of Zone coverage’s codebase work does not say where it is on GitHub.');
	});
});

describe('Run locally: codebase work run on this machine, in the browser', () => {
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
		await runLocally(deps, l, 'zone-coverage');
		// Its own earlier run is stopped first, so there is only ever one.
		expect(api.stopCommand).toHaveBeenCalledWith('/p', 'design-mode');
		expect(l.answers).toHaveBeenCalledWith(3000);
		expect(api.runLocally).toHaveBeenCalledWith('/p', 'zone-coverage', 'codebase');
		expect(said[0]).toBe('Starting Zone coverage locally');
		expect(l.loads).toHaveBeenCalledWith('http://localhost:5173/zones');
		expect(deps.openExternal).toHaveBeenCalledWith('http://localhost:5173/zones');
		expect(offered.at(-1)).toEqual(['Zone coverage is running locally at http://localhost:5173/zones.', ['Stop']]);
	});

	it('says when the work has no page recorded, so it opened at the app’s front door', async () => {
		const noRoute = { ...zone, work: [zone.work[0], { ...codebase, route: null }] } as unknown as Project;
		const {
			deps,
			offered,
			local: l,
		} = run({
			listProjects: vi.fn(async () => ok([noRoute])),
			runLocally: vi.fn(async () => ok({ url: 'http://localhost:5173/', uncommitted: false })),
		});
		await runLocally(deps, l, 'zone-coverage');
		expect(deps.openExternal).toHaveBeenCalledWith('http://localhost:5173/');
		expect(offered.at(-1)).toEqual([
			'Zone coverage is running locally at http://localhost:5173/. Its record names no page for this work, so it opened at the app’s front door.',
			['Stop'],
		]);
	});

	it('stops the server it started when the browser cannot be opened, and says why, rather than leaving it running', async () => {
		const { deps, api, offered, local: l } = run();
		deps.openExternal = vi.fn(async () => {
			throw new Error('VS Code would not open it.');
		});
		await expect(runLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			'Zone coverage is running locally at http://localhost:5173/zones, but it could not be opened in the browser: VS Code would not open it.',
		);
		// Its own earlier run, then this one, stopped.
		expect(api.stopCommand).toHaveBeenCalledTimes(2);
		expect(offered.some(([m]) => m.includes('is running locally'))).toBe(false);
	});

	it('stops it when Stop is pressed', async () => {
		const { deps, api, local: l } = run();
		deps.offer = vi.fn(async () => 'Stop');
		await runLocally(deps, l, 'zone-coverage');
		expect(api.stopCommand).toHaveBeenCalledTimes(2);
	});

	it('does not start when something else already answers on the product’s port, and says so', async () => {
		const { deps, api, local: l } = run({}, { answers: vi.fn(async () => true) });
		await expect(runLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			'Zone coverage couldn’t run locally: something else is already answering on port 3000. Stop it, then try again.',
		);
		expect(api.runLocally).not.toHaveBeenCalled();
	});

	it('says the product does not say how to run it, when it declares no port for design mode', async () => {
		const { deps, api, local: l } = run({}, { port: () => null });
		await expect(runLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			'Zone coverage couldn’t run locally: the product’s .dsnr/workspace.json declares no design-mode command with a port.',
		);
		expect(api.runLocally).not.toHaveBeenCalled();
	});

	it('takes a build error in the server’s output as a failure, with that line, stops the server, and opens nothing', async () => {
		const { deps, api, local: l, say } = run();
		api.runLocally.mockImplementation((async () => {
			say('\u001b[31merror\u001b[39m   Build error:\n');
			say(
				"  × ESModulesLinkingError: export 'TransparencyPortalV2' (imported as 'TransparencyPortalV2') was not found in '@flocksafety/flock-transparency-portal' (possible exports: CsvComponent, DATA_UNAVAILABLE, FlockLogoComponent)\n",
			);
			say('error   build failed in 1.07 s\n');
			return ok({ url: 'http://localhost:5173/', uncommitted: false });
		}) as never);
		await expect(runLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			"Zone coverage couldn’t run locally: ESModulesLinkingError: export 'TransparencyPortalV2' (imported as 'TransparencyPortalV2') was not found in '@flocksafety/flock-transparency-portal'. Its packages may be out of date: npm ci",
		);
		expect(api.stopCommand).toHaveBeenCalledTimes(2);
		expect(deps.openExternal).not.toHaveBeenCalled();
	});

	it('takes a page that errors or draws nothing as a failure, not as running', async () => {
		const { deps, api, local: l } = run({}, { loads: vi.fn(async () => "Cannot read properties of undefined (reading 'None')") });
		await expect(runLocally(deps, l, 'zone-coverage')).rejects.toThrow(
			"Zone coverage couldn’t run locally: Cannot read properties of undefined (reading 'None')",
		);
		expect(api.stopCommand).toHaveBeenCalledTimes(2);
		expect(deps.openExternal).not.toHaveBeenCalled();
	});

	it('says why it did not start, and leaves the checkout alone when it is not clean', async () => {
		const notClean = run({
			runLocally: vi.fn(async () => ({ ok: false, error: 'There are uncommitted changes in p. Commit or stash them first.' })),
		});
		await expect(runLocally(notClean.deps, notClean.local, 'zone-coverage')).rejects.toThrow(
			'Zone coverage couldn’t run locally: There are uncommitted changes in p. Commit or stash them first.',
		);
		const failed = run({ runLocally: vi.fn(async () => ({ ok: false, error: 'exited with code 1' })) });
		await expect(runLocally(failed.deps, failed.local, 'zone-coverage')).rejects.toThrow('Zone coverage couldn’t run locally: exited with code 1');
	});

	it('shows what the server prints in the log as it starts', async () => {
		const { deps, api, local: l, say } = run();
		api.runLocally.mockImplementation((async () => {
			say('ready   built in 4.2 s\n');
			return ok({ url: 'http://localhost:5173/', uncommitted: false });
		}) as never);
		await runLocally(deps, l, 'zone-coverage');
		expect(deps.log.start).toHaveBeenCalledWith('Zone coverage, locally');
		expect(deps.log.line).toHaveBeenCalledWith('ready   built in 4.2 s');
	});
});
