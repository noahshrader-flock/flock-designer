import { describe, expect, it, vi } from 'vitest';
import { type Given, type NewPrototypeDeps, newPrototype, readAsked, readGiven, readyToStart } from '../extension/src/newPrototype';
import type { Work } from '../src/shared/contract';
import { ok } from '../src/shared/result';

const created: Work = {
	projectId: 'alert-history',
	name: 'v1',
	branch: 'prototype/alert-history/v1',
	commit: null,
	createdAt: '2026-10-13T10:00:00Z',
	note: 'Explore it.',
};

const world = (more: { given?: Given; api?: Record<string, unknown>; choose?: (string | undefined)[] } = {}) => {
	const chosen = [...(more.choose ?? [])];
	const said: string[] = [];
	const told: string[] = [];
	const toldDone: string[] = [];
	const api = {
		prototypeReadiness: vi.fn(async () => ok({ ready: true, designSystem: '@acme/ui', version: '1.0.0' })),
		installPackages: vi.fn(async () => ok(null)),
		cancelInstall: vi.fn(async () => ok(null)),
		onInstallLine: vi.fn(() => () => undefined),
		readCheckout: vi.fn(async () => ok({ root: '/p', name: 'p', branch: 'main', clean: true })),
		createPrototype: vi.fn(async () => ok(created)),
		handPrototypeBuild: vi.fn(async () => ok({ editor: true, command: null })),
		...more.api,
	};
	const deps: NewPrototypeDeps = {
		api: api as unknown as NewPrototypeDeps['api'],
		product: { root: '/p', why: '' },
		given: more.given ?? { title: 'Alert history', task: 'Explore it.', folder: null },
		choose: vi.fn(async (message: string) => {
			told.push(message);
			return chosen.shift();
		}),
		tell: (message) => void toldDone.push(message),
		progress: vi.fn(async (title, task) => {
			said.push(title);
			await task((m: string) => void said.push(m));
		}),
		onChanged: vi.fn(),
		watchBuild: vi.fn(),
	};
	return { deps, api, said, told, toldDone };
};

describe('starting a prototype from VS Code', () => {
	it('makes it from the product’s branch, with the answers it is given, and hands its build to Claude Code in the product', async () => {
		const { deps, api } = world({ given: { title: 'Alert history', task: 'Explore it.', folder: 'Maps' } });
		await newPrototype(deps);
		expect(api.createPrototype).toHaveBeenCalledWith('alert-history', 'Alert history', 'Explore it.', { root: '/p', branch: 'main' }, 'Maps');
		expect(deps.onChanged).toHaveBeenCalledTimes(1);
		expect(api.handPrototypeBuild).toHaveBeenCalledWith('/p', 'alert-history', 'v1', 'Explore it.');
	});

	it('says it is in Claude Code, with its task typed in for Enter, and that it is opened for review from the list once built', async () => {
		const { deps, toldDone } = world();
		await newPrototype(deps);
		expect(toldDone).toHaveLength(1);
		expect(toldDone[0]).toContain('Alert history is in Claude Code in this window');
		expect(toldDone[0]).toContain('Press Enter there to start it');
		expect(toldDone[0]).toContain('saves it when it is built, and its picture appears in the list');
		// No accessibility notification for a prototype: it is checked when the work moves into the code, and at Handoff.
		expect(toldDone[0]).not.toMatch(/accessib|checks it/i);
	});

	it('says, when Claude Code is not in this VS Code, that the command is on the clipboard', async () => {
		const { deps, toldDone } = world({ api: { handPrototypeBuild: vi.fn(async () => ok({ editor: false, command: 'cd /p && claude "x"' })) } });
		await newPrototype(deps);
		expect(toldDone[0]).toContain('Claude Code is not in this VS Code');
		expect(toldDone[0]).toContain('on your clipboard');
	});

	it('starts watching for the build once it is handed over, by the prototype’s name, and not before', async () => {
		const { deps, api } = world();
		await newPrototype(deps);
		expect(deps.watchBuild).toHaveBeenCalledWith('alert-history', 'v1', 'Alert history');
		const failed = world({ api: { handPrototypeBuild: vi.fn(async () => ({ ok: false, error: 'No.' })) } });
		await expect(newPrototype(failed.deps)).rejects.toThrow('No.');
		expect(failed.deps.watchBuild).not.toHaveBeenCalled();
		expect(api.handPrototypeBuild).toHaveBeenCalled();
	});

	it('does not run the agent here, or show a review for what is not built', async () => {
		const { deps, said } = world();
		await newPrototype(deps);
		expect(said).toEqual([]);
		expect(deps).not.toHaveProperty('openReview');
	});

	it('fails with why the hand-over failed, the prototype made and in the list', async () => {
		const { deps } = world({ api: { handPrototypeBuild: vi.fn(async () => ({ ok: false, error: 'Nothing to start.' })) } });
		await expect(newPrototype(deps)).rejects.toThrow('Nothing to start.');
		expect(deps.onChanged).toHaveBeenCalledTimes(1);
	});

	it('trims its name and what it explores', async () => {
		const { deps, api } = world({ given: { title: '  Zone coverage ', task: ' Show it.\n', folder: null } });
		await newPrototype(deps);
		expect(api.createPrototype).toHaveBeenCalledWith('zone-coverage', 'Zone coverage', 'Show it.', { root: '/p', branch: 'main' }, null);
		expect(api.handPrototypeBuild).toHaveBeenCalledWith('/p', 'alert-history', 'v1', 'Show it.');
	});

	it('refuses answers the dialog would not take: a name with nothing to make an id of, or nothing to explore', async () => {
		const { deps, api } = world({ given: { title: '!!!', task: 'Show it.', folder: null } });
		await expect(newPrototype(deps)).rejects.toThrow('Give it a name with a letter or a number.');
		const blank = world({ given: { title: 'Zone coverage', task: '   ', folder: null } });
		await expect(newPrototype(blank.deps)).rejects.toThrow('Say what it should explore.');
		expect(api.createPrototype).not.toHaveBeenCalled();
		expect(blank.api.createPrototype).not.toHaveBeenCalled();
	});
});

describe('what stands in the way, said first', () => {
	it('is no product open, in the words the context gives', async () => {
		const { deps, api } = world();
		deps.product = { root: null, why: 'No product is open: open its folder.' };
		await expect(newPrototype(deps)).rejects.toThrow('No product is open: open its folder.');
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
	it('is a product open, said before the person is asked anything', async () => {
		const { deps } = world();
		await expect(readyToStart(deps)).resolves.toBeUndefined();
		deps.product = { root: null, why: 'No product is open: open its folder.' };
		await expect(readyToStart(deps)).rejects.toThrow('No product is open: open its folder.');
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
			{ title: 'x'.repeat(301), task: 'B' },
			{ title: 'A', task: 'B', folder: 'x'.repeat(101) },
		])
			expect(readGiven(raw)).toBeNull();
	});
});

describe('what New prototype is called with', () => {
	it('is the panel’s dialog to ask, when it is called with nothing, as from the palette', () => {
		expect(readAsked(undefined)).toBe('ask');
	});

	it('is the dialog to ask too when VS Code hands it something of its own, as the plus button of the title bar can: never an error', () => {
		for (const fromVsCode of [{}, { webviewSection: 'project', projectId: 'a' }, { $mid: 1, path: '/x' }, 'dsnr.panel', 3, null, [], ['x']])
			expect(readAsked(fromVsCode)).toBe('ask');
	});

	it('is the answers, when code gave them, as `readGiven` reads them', () => {
		expect(readAsked({ title: 'A', task: 'B' })).toEqual({ title: 'A', task: 'B', folder: null });
		expect(readAsked({ title: 'A', task: 'B', folder: 'Maps' })).toEqual({ title: 'A', task: 'B', folder: 'Maps' });
	});

	it('is refused, when code meant to give answers (a name or what it explores) and they are not right', () => {
		for (const bad of [{ title: 'A' }, { task: 'B' }, { title: 3, task: 'B' }, { title: 'A', task: 'x'.repeat(4001) }])
			expect(readAsked(bad)).toBeNull();
	});
});
