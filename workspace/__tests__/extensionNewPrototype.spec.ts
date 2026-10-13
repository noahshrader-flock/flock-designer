import { describe, expect, it, vi } from 'vitest';
import { type Given, type NewPrototypeDeps, newPrototype, readGiven, readyToStart } from '../extension/src/newPrototype';
import type { AgentStatus, Iteration, Project, RunLogLine } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * Starting a prototype from DSNR in VS Code (ELECTRON_MIGRATION_PLAN 4.1): what stands in the way said first (a product
 * open, Claude Code, the product's packages, with Install when it says how); then the app's own build of what the panel's
 * dialog asked (a name, what it explores, its folder), its progress said and its log shown, stoppable; then its review.
 */

const created: Iteration = {
	projectId: 'alert-history',
	name: 'v1-i1',
	branch: 'prototype/alert-history/v1-i1',
	commit: null,
	createdAt: '2026-10-13T10:00:00Z',
	note: 'Explore it.',
};
const finished: AgentStatus = { state: 'finished', exitCode: 0, work: 'prototype/alert-history/v1-i1', purpose: null };
const inFolder = (folder: string) => ({ id: folder, title: folder, folder, records: [], iterations: [], people: [] }) as Project;

/** A world where everything is ready, the answers are given, and the agent finishes at once. */
const world = (more: { given?: Given; api?: Record<string, unknown>; choose?: (string | undefined)[] } = {}) => {
	const chosen = [...(more.choose ?? [])];
	const logged: string[] = [];
	const said: string[] = [];
	const told: string[] = [];
	const logListeners: ((l: RunLogLine) => void)[] = [];
	const api = {
		agentReadiness: vi.fn(async () => ok({ state: 'ready' })),
		prototypeReadiness: vi.fn(async () => ok({ ready: true, designSystem: '@acme/ui', version: '1.0.0' })),
		installPackages: vi.fn(async () => ok(null)),
		cancelInstall: vi.fn(async () => ok(null)),
		onInstallLine: vi.fn(() => () => undefined),
		listProjects: vi.fn(async () => ok([inFolder('Maps'), inFolder('Admin')])),
		readCheckout: vi.fn(async () => ok({ root: '/p', name: 'p', branch: 'main', clean: true })),
		createPrototype: vi.fn(async () => ok(created)),
		agentStatus: vi.fn(async () => ok({ state: 'idle' })),
		buildPrototype: vi.fn(async () => ok({ state: 'running', startedAt: '', work: created.branch, purpose: null })),
		savePrototype: vi.fn(async () => ok(null)),
		checkAccessibility: vi.fn(async () => ({ ok: false, error: 'not here yet' })),
		fixAccessibility: vi.fn(),
		openPrototype: vi.fn(async () => ok({ url: 'http://127.0.0.1:1/p/', states: [] })),
		stopAgent: vi.fn(async () => ok(null)),
		onAgentLog: vi.fn((l: (line: RunLogLine) => void) => {
			logListeners.push(l);
			return () => undefined;
		}),
		...more.api,
	};
	// The first status is asked before the build (is it still building?), the next once it has started.
	api.agentStatus.mockResolvedValueOnce(ok({ state: 'idle' })).mockResolvedValue(ok(finished));
	const deps: NewPrototypeDeps = {
		api: api as unknown as NewPrototypeDeps['api'],
		product: { root: '/p', why: '' },
		given: more.given ?? { title: 'Alert history', task: 'Explore it.', folder: null },
		choose: vi.fn(async (message: string) => {
			told.push(message);
			return chosen.shift();
		}),
		progress: vi.fn(async (title, task) => {
			said.push(title);
			await task((m: string) => void said.push(m));
		}),
		log: { start: vi.fn(), line: (text) => void logged.push(text) },
		onChanged: vi.fn(),
		openReview: vi.fn(async () => undefined),
		pollMs: 0,
	};
	return { deps, api, said, told, logged, logListeners };
};

describe('starting a prototype from VS Code', () => {
	it('builds it from the product’s branch, with the answers it is given, and opens its review', async () => {
		const { deps, api, said } = world({ given: { title: 'Alert history', task: 'Explore it.', folder: 'Maps' } });
		await newPrototype(deps);
		expect(api.createPrototype).toHaveBeenCalledWith('alert-history', 'Alert history', 'Explore it.', { root: '/p', branch: 'main' }, 'Maps');
		// Once made, and once built.
		expect(deps.onChanged).toHaveBeenCalledTimes(2);
		expect(api.buildPrototype).toHaveBeenCalledWith('alert-history', 'v1-i1', 'Explore it.');
		expect(api.savePrototype).toHaveBeenCalled();
		expect(said[0]).toBe('Building Alert history');
		expect(said).toContain('The agent is writing it from your request. This takes a few minutes.');
		expect(deps.openReview).toHaveBeenCalledWith({ projectId: 'alert-history', name: 'v1-i1', title: 'Alert history · V1 · I1' });
	});

	it('trims its name and what it explores', async () => {
		const { deps, api } = world({ given: { title: '  Zone coverage ', task: ' Show it.\n', folder: null } });
		await newPrototype(deps);
		expect(api.createPrototype).toHaveBeenCalledWith('zone-coverage', 'Zone coverage', 'Show it.', { root: '/p', branch: 'main' }, null);
	});

	it('refuses answers the dialog would not take: a name with nothing to make an id of, or nothing to explore', async () => {
		const { deps, api } = world({ given: { title: '!!!', task: 'Show it.', folder: null } });
		await expect(newPrototype(deps)).rejects.toThrow('Give it a name with a letter or a number.');
		const blank = world({ given: { title: 'Zone coverage', task: '   ', folder: null } });
		await expect(newPrototype(blank.deps)).rejects.toThrow('Say what it should explore.');
		expect(api.createPrototype).not.toHaveBeenCalled();
		expect(blank.api.createPrototype).not.toHaveBeenCalled();
	});

	it('shows the agent’s log as it works', async () => {
		const { deps, logged, logListeners, api } = world();
		api.buildPrototype.mockImplementation(async () => {
			for (const l of logListeners) l({ commandId: 'agent', stream: 'stdout', text: '→ Write page.tsx\n' });
			return ok({ state: 'running', startedAt: '', work: created.branch, purpose: null });
		});
		await newPrototype(deps);
		expect(deps.log.start).toHaveBeenCalledWith('Alert history');
		expect(logged).toEqual(['→ Write page.tsx']);
	});

	it('stops the agent when Stop is pressed, and opens nothing', async () => {
		const { deps, api } = world();
		let stop = () => undefined as void;
		deps.progress = vi.fn(async (_title, task, onStop) => {
			stop = onStop;
			api.buildPrototype.mockImplementation(async () => {
				stop();
				return ok({ state: 'running', startedAt: '', work: created.branch, purpose: null });
			});
			await task(() => undefined);
		});
		await newPrototype(deps);
		expect(api.stopAgent).toHaveBeenCalled();
		expect(api.savePrototype).not.toHaveBeenCalled();
		expect(deps.openReview).not.toHaveBeenCalled();
	});

	it('fails saying how the build failed, with its log already shown, and waits on nobody', async () => {
		const { deps, api } = world();
		api.agentStatus
			.mockReset()
			.mockResolvedValueOnce(ok({ state: 'idle' }))
			.mockResolvedValue(ok({ ...finished, exitCode: 2 }));
		await expect(newPrototype(deps)).rejects.toThrow('Alert history was not built: The agent stopped with code 2.');
		expect(deps.log.start).toHaveBeenCalledTimes(1);
		expect(deps.choose).not.toHaveBeenCalled();
		expect(deps.openReview).not.toHaveBeenCalled();
	});
});

describe('what stands in the way, said first', () => {
	it('is no product open, in the words the context gives', async () => {
		const { deps, api } = world();
		deps.product = { root: null, why: 'No product is open: open its folder.' };
		await expect(newPrototype(deps)).rejects.toThrow('No product is open: open its folder.');
		expect(api.agentReadiness).not.toHaveBeenCalled();
	});

	it.each([
		['missing', /Claude Code is not installed/],
		['signedOut', /Claude Code is not signed in/],
	])('is Claude Code %s', async (state, words) => {
		const { deps, api } = world({ api: { agentReadiness: vi.fn(async () => ok({ state })) } });
		await expect(newPrototype(deps)).rejects.toThrow(words);
		expect(api.createPrototype).not.toHaveBeenCalled();
	});

	it('is the packages not installed: installs them when asked, with their lines as progress, then goes on', async () => {
		const readiness = vi
			.fn()
			.mockResolvedValueOnce(ok({ ready: false, why: 'not-installed', designSystem: '@acme/ui', repository: 'coke', canInstall: true }))
			.mockResolvedValue(ok({ ready: true, designSystem: '@acme/ui', version: '1.0.0' }));
		const { deps, api, told, said } = world({ api: { prototypeReadiness: readiness }, choose: ['Install packages'] });
		api.onInstallLine.mockImplementation(((l: (line: string) => void) => {
			l('added 300 packages');
			return () => undefined;
		}) as never);
		await newPrototype(deps);
		expect(told[0]).toBe("A prototype is built from @acme/ui, and coke's packages are not installed on this machine yet.");
		expect(api.installPackages).toHaveBeenCalledWith('/p');
		expect(said.slice(0, 2)).toEqual(["Installing coke's packages", 'added 300 packages']);
		expect(api.createPrototype).toHaveBeenCalled();
	});

	it('is the packages not installed, and not installed when the person does not ask', async () => {
		const readiness = vi.fn(async () => ok({ ready: false, why: 'not-installed', designSystem: '@acme/ui', repository: 'coke', canInstall: true }));
		const { deps, api } = world({ api: { prototypeReadiness: readiness }, choose: [undefined] });
		await newPrototype(deps);
		expect(api.installPackages).not.toHaveBeenCalled();
		expect(api.createPrototype).not.toHaveBeenCalled();
	});

	it('is an install stopped: the install is cancelled, and nothing is made', async () => {
		const readiness = vi.fn(async () => ok({ ready: false, why: 'not-installed', designSystem: '@acme/ui', repository: 'coke', canInstall: true }));
		const { deps, api } = world({ api: { prototypeReadiness: readiness }, choose: ['Install packages'] });
		deps.progress = vi.fn(async (_title, task, onStop) => {
			onStop();
			await task(() => undefined);
		});
		api.installPackages.mockResolvedValue({ ok: false, error: 'The install was stopped.' } as never);
		await newPrototype(deps);
		expect(api.cancelInstall).toHaveBeenCalled();
		expect(api.createPrototype).not.toHaveBeenCalled();
	});

	it('is packages it cannot install, said with what to run', async () => {
		const readiness = vi.fn(async () => ok({ ready: false, why: 'not-installed', designSystem: '@acme/ui', repository: 'coke', canInstall: false }));
		const { deps } = world({ api: { prototypeReadiness: readiness } });
		await expect(newPrototype(deps)).rejects.toThrow(/it is not installed in coke on this machine\. Run npm ci in it/);
	});
});

describe('ready to start', () => {
	it('is a product open and Claude Code usable, said before the person is asked anything', async () => {
		const { deps, api } = world();
		await expect(readyToStart(deps)).resolves.toBeUndefined();
		deps.product = { root: null, why: 'No product is open: open its folder.' };
		await expect(readyToStart(deps)).rejects.toThrow('No product is open: open its folder.');
		const missing = world({ api: { agentReadiness: vi.fn(async () => ok({ state: 'missing' })) } });
		await expect(readyToStart(missing.deps)).rejects.toThrow(/Claude Code is not installed/);
		expect(api.agentReadiness).toHaveBeenCalledTimes(1);
	});
});

describe('what the command may be given', () => {
	it('is its name and what it explores, with its folder if it has one, as text, and nothing else', () => {
		expect(readGiven({ title: 'A', task: 'B', folder: 'Maps' })).toEqual({ title: 'A', task: 'B', folder: 'Maps' });
		expect(readGiven({ title: 'A', task: 'B' })).toEqual({ title: 'A', task: 'B', folder: null });
		expect(readGiven({ title: 'A', task: 'B', folder: null })).toEqual({ title: 'A', task: 'B', folder: null });
		expect(readGiven({ title: 'A', task: 'B', run: 'rm -rf /' })).toEqual({ title: 'A', task: 'B', folder: null });
	});

	it('is nothing when it lacks either, or they are not text or are too long', () => {
		for (const raw of [
			undefined,
			'A',
			{},
			{ title: 'A' },
			{ task: 'B' },
			{ title: 3, task: 'B' },
			{ title: 'A', task: ['x'] },
			{ title: 'A', task: 'x'.repeat(4001) },
		])
			expect(readGiven(raw)).toBeNull();
	});
});
