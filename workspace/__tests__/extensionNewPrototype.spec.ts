import { describe, expect, it, vi } from 'vitest';
import { type NewPrototypeDeps, newPrototype, readGiven } from '../extension/src/newPrototype';
import type { AgentStatus, Iteration, Project, RunLogLine } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * Starting a prototype from DSNR in VS Code (ELECTRON_MIGRATION_PLAN 4.1): what stands in the way said first (Claude Code,
 * the product's packages, with Install when it says how), then a name, what it should explore and its folder, asked in
 * VS Code's own boxes; then the app's own build, its progress said and its log shown, stoppable; then its review.
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

/** A world where everything is ready, the person answers `answers` in turn, and the agent finishes at once. */
const world = (more: { answers?: (string | undefined)[]; api?: Record<string, unknown>; choose?: (string | undefined)[] } = {}) => {
	const answers = [...(more.answers ?? ['Alert history', 'Explore it.', 'No folder'])];
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
		ask: {
			text: vi.fn(async ({ validate }) => {
				const answer = answers.shift();
				if (answer !== undefined && validate?.(answer)) throw new Error(`refused: ${validate(answer)}`);
				return answer;
			}),
			pick: vi.fn(async ({ items }) => {
				const answer = answers.shift();
				// Chosen by its label, as a person sees it.
				return answer === undefined ? undefined : items.find((i: { label: string }) => i.label === answer)?.value;
			}),
		},
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
	it('asks its name, what it should explore and its folder, then builds it from the product’s branch and opens its review', async () => {
		const { deps, api, said } = world({ answers: ['Alert history', 'Explore it.', 'Maps'] });
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

	it('offers the folders there are, no folder, and a new one', async () => {
		const { deps } = world({ answers: ['Alert history', 'Explore it.', '$(add) New folder…', 'Zones'] });
		await newPrototype(deps);
		const { items } = vi.mocked(deps.ask.pick).mock.calls[0]![0];
		expect(items.map((i) => i.label)).toEqual(['No folder', 'Admin', 'Maps', '$(add) New folder…']);
		expect(vi.mocked(deps.api.createPrototype).mock.calls[0]![4]).toBe('Zones');
	});

	it('refuses a name with nothing to make an id of, and what is not said', async () => {
		const { deps } = world({ answers: ['!!!'] });
		await expect(newPrototype(deps)).rejects.toThrow(/refused: Give it a name with a letter or a number/);
		const blank = world({ answers: ['Alert history', '   '] });
		await expect(newPrototype(blank.deps)).rejects.toThrow(/refused: Say what it should explore/);
	});

	it('does nothing when a question is dismissed', async () => {
		for (const answers of [[undefined], ['Alert history', undefined], ['Alert history', 'Explore it.', undefined]]) {
			const { deps, api } = world({ answers });
			await newPrototype(deps);
			expect(api.createPrototype).not.toHaveBeenCalled();
		}
	});

	it('takes its answers when the command is given them, and asks only what is not given', async () => {
		const { deps, api } = world({ answers: [] });
		deps.given = { title: 'Zone coverage', task: 'Show it.', folder: null };
		await newPrototype(deps);
		expect(deps.ask.text).not.toHaveBeenCalled();
		expect(deps.ask.pick).not.toHaveBeenCalled();
		expect(api.createPrototype).toHaveBeenCalledWith('zone-coverage', 'Zone coverage', 'Show it.', { root: '/p', branch: 'main' }, null);
		const some = world({ answers: ['Explore it.', 'No folder'] });
		some.deps.given = { title: 'Zone coverage' };
		await newPrototype(some.deps);
		expect(vi.mocked(some.deps.ask.text).mock.calls.map(([o]) => o.prompt)).toEqual(['What should it explore?']);
	});

	it('refuses given answers it would not take from the boxes', async () => {
		const { deps, api } = world({ answers: [] });
		deps.given = { title: '!!!', task: 'Show it.', folder: null };
		await expect(newPrototype(deps)).rejects.toThrow('Give it a name with a letter or a number.');
		expect(api.createPrototype).not.toHaveBeenCalled();
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

describe('what the command may be given', () => {
	it('is its name, what it explores and its folder, as text, and nothing else', () => {
		expect(readGiven(undefined)).toEqual({});
		expect(readGiven({ title: 'A', task: 'B', folder: 'Maps' })).toEqual({ title: 'A', task: 'B', folder: 'Maps' });
		expect(readGiven({ title: 'A', folder: null })).toEqual({ title: 'A', folder: null });
		expect(readGiven({ title: 3, task: ['x'], run: 'rm -rf /' })).toEqual({});
		expect(readGiven({ task: 'x'.repeat(4001) })).toEqual({});
		expect(readGiven('A')).toEqual({});
	});
});
