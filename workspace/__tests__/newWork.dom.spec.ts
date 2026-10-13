import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NewWork } from '../src/renderer/NewWork';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import type { ClonePlan, CloneProgress } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * Cloning from the New modal (C3 of the clone plan): a repository with no clone here is chosen like any other, says
 * where it will go, and is cloned and carried on with from there. Against a fake app.
 */

const HERE = { root: '/h/GitHub/flock-coke', name: 'flock-coke', branch: 'develop', clean: true };
const REPOS = [
	{ name: 'flocksafety/flock-coke', root: HERE.root },
	{ name: 'flocksafety/flock-ops', root: null },
];
const PLAN: ClonePlan = {
	repository: 'flocksafety/flock-ops',
	place: { state: 'free', path: '/h/GitHub/flock-ops' },
	where: '~/GitHub/flock-ops',
	design: null,
};

let current: Awaited<ReturnType<typeof render>> | null = null;
let progress: ((p: CloneProgress) => void) | null = null;
const open = async (more: Record<string, (...a: never[]) => unknown> = {}, props: Record<string, unknown> = {}) => {
	const app = fakeApp({
		listRepositories: async () => ok({ repositories: REPOS, reach: 'account' }),
		agentReadiness: async () => ok({ state: 'ready' }),
		listBaseBranches: async () => ok(['develop']),
		prototypeReadiness: async () => ok({ ready: true, designSystem: 'x', version: '1' }),
		clonePlan: async () => ok(PLAN),
		onCloneProgress: (l: (p: CloneProgress) => void) => {
			progress = l;
			return () => void (progress = null);
		},
		...more,
	});
	(window as unknown as { workspace: unknown }).workspace = app.api;
	const seen: { checkout: unknown[]; closed: number } = { checkout: [], closed: 0 };
	current = await render(
		createElement(NewWork, {
			open: true,
			onClose: () => void seen.closed++,
			checkout: HERE,
			onChoose: () => undefined,
			onCheckout: (c: unknown) => void seen.checkout.push(c),
			onCreated: () => undefined,
			...props,
		}),
	);
	return { app, seen };
};
/** Chooses a repository from the modal's searchable list, as a person does. */
const chooseRepository = async (name: string) => {
	await press(document.getElementById('new-work-repo') as HTMLElement);
	await settle();
	const option = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((o) => o.textContent === name);
	if (!option) throw new Error(`no option ${name}`);
	await press(option);
	await settle();
};
const text = () => document.body.textContent ?? '';
/** The line that says the branch it starts from, under the repository; null when there is none. */
const startsFrom = () => document.querySelector<HTMLElement>('[data-starts-from]');

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('what it makes', () => {
	const fill = async () => {
		await typeInto(document.getElementById('new-work-name') as HTMLInputElement, 'Ops list');
		await typeInto(document.getElementById('new-work-task') as HTMLTextAreaElement, 'A list');
	};

	it('is a prototype only: no choice of codebase work, which is started in the codebase', async () => {
		await open();
		expect(document.querySelector('[role="tab"]')).toBeNull();
		expect(text()).not.toContain('Codebase work');
		expect(text()).toContain('New prototype');
		expect(() => button('Start codebase work')).toThrow(/0 buttons/);
	});

	it('is modeled on any branch, and makes a prototype from it', async () => {
		const made = {
			projectId: 'ops-list',
			name: 'v1-i1',
			branch: 'prototype/ops-list/v1-i1',
			commit: null,
			createdAt: '2026-10-08T00:00:00Z',
			note: 'A list',
		};
		const { app } = await open({ listBaseBranches: async () => ok(['develop', 'noah/flock-designer']), createPrototype: async () => ok(made) });
		await fill();
		expect(button('Create prototype').disabled).toBe(false);
		await press(button('Create prototype'));
		await settle();
		expect(app.calls.createPrototype?.[0]).toEqual(['ops-list', 'Ops list', 'A list', { root: HERE.root, branch: 'develop' }, null]);
	});
});

describe('how the form is laid out', () => {
	const position = (id: string) => {
		const at = document.getElementById(id) as HTMLElement;
		return [...document.querySelectorAll('*')].indexOf(at);
	};
	const made = {
		projectId: 'ops-list',
		name: 'v1-i1',
		branch: 'prototype/ops-list/v1-i1',
		commit: null,
		createdAt: '2026-10-08T00:00:00Z',
		note: 'A list',
	};
	const branches = async () => ok(['develop', 'release', 'noah/flock-designer']);

	it('asks for the name, then what it should explore, then the repository', async () => {
		await open();
		expect(position('new-work-name')).toBeLessThan(position('new-work-task'));
		expect(position('new-work-task')).toBeLessThan(position('new-work-repo'));
	});

	it('says nothing of the id made from the name, which nobody needs to know', async () => {
		await open();
		await typeInto(document.getElementById('new-work-name') as HTMLInputElement, 'Ops list');
		expect(text()).not.toMatch(/project id|id is made/i);
	});

	it('says what it starts from under the repository, with a way to change it, and no list until then', async () => {
		await open({ listBaseBranches: branches });
		expect(startsFrom()?.textContent).toContain('develop');
		expect(document.getElementById('new-work-from')).toBeNull();
		expect(button('Change').disabled).toBe(false);
	});

	it('says the branch with a branch icon before it, and not in words', async () => {
		await open({ listBaseBranches: branches });
		const line = startsFrom()!;
		expect(line.querySelector('svg')).not.toBeNull();
		expect(line.textContent).toBe('developChange');
		expect(text()).not.toContain('Starts from');
	});

	it('opens the list of branches from Change, and starts from the one chosen, said again under the repository', async () => {
		const { app } = await open({ listBaseBranches: branches, createPrototype: async () => ok(made) });
		await typeInto(document.getElementById('new-work-name') as HTMLInputElement, 'Ops list');
		await typeInto(document.getElementById('new-work-task') as HTMLTextAreaElement, 'A list');
		await press(button('Change'));
		await settle();
		const option = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((o) => o.textContent === 'release');
		await press(option as HTMLElement);
		await settle();
		expect(startsFrom()?.textContent).toContain('release');
		expect(document.getElementById('new-work-from')).toBeNull();
		await press(button('Create prototype'));
		await settle();
		expect(app.calls.createPrototype?.[0]).toEqual(['ops-list', 'Ops list', 'A list', { root: HERE.root, branch: 'release' }, null]);
	});

	it('has no Change when the repository has no other branch to list', async () => {
		await open({ listBaseBranches: async () => ok([]) });
		expect(button('Change').disabled).toBe(true);
	});

	it('says nothing of a branch for a repository chosen but not switched to, or when there is none in use', async () => {
		const repos = [...REPOS, { name: 'flocksafety/flock-ops', root: '/h/GitHub/flock-ops' }].filter((r) => r.root !== null);
		await open({ listRepositories: async () => ok({ repositories: repos, reach: 'account' }), useCheckout: async () => fail('not usable') });
		await chooseRepository('flocksafety/flock-ops');
		expect(startsFrom()).toBeNull();
		await unmountAll(current!.root);
		await open({ lastCheckout: async () => ok(null) }, { checkout: null });
		expect(startsFrom()).toBeNull();
	});

	it('closes the list without changing the branch when it is left without choosing', async () => {
		await open({ listBaseBranches: branches });
		await press(button('Change'));
		await settle();
		await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
		await settle();
		expect(startsFrom()?.textContent).toContain('develop');
		expect(document.getElementById('new-work-from')).toBeNull();
	});
});

describe('its folder', () => {
	const made = {
		projectId: 'ops-list',
		name: 'v1-i1',
		branch: 'prototype/ops-list/v1-i1',
		commit: null,
		createdAt: '2026-10-08T00:00:00Z',
		note: 'A list',
	};
	const fill = async () => {
		await typeInto(document.getElementById('new-work-name') as HTMLInputElement, 'Ops list');
		await typeInto(document.getElementById('new-work-task') as HTMLTextAreaElement, 'A list');
	};
	const pickFolder = async (name: string) => {
		await press(document.getElementById('new-work-folder') as HTMLElement);
		await settle();
		await press([...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find((o) => o.textContent === name) as HTMLElement);
		await settle();
	};

	it('is asked for after the repository, as optional, starting on the folder being viewed', async () => {
		await open({}, { folders: ['Admin', 'Roles'], folder: 'Roles' });
		const at = (id: string) => [...document.querySelectorAll('*')].indexOf(document.getElementById(id) as HTMLElement);
		expect(at('new-work-repo')).toBeLessThan(at('new-work-folder'));
		expect(document.querySelector('label[for="new-work-folder"]')?.textContent).toBe('Folder (optional)');
		expect((document.getElementById('new-work-folder') as HTMLElement).textContent).toBe('Roles');
	});

	it('starts again on the folder being viewed each time it is opened', async () => {
		await open({}, { folders: ['Admin', 'Roles'], folder: 'Roles' });
		await pickFolder('Admin');
		const props = (isOpen: boolean) => ({
			open: isOpen,
			onClose: () => undefined,
			checkout: HERE,
			onChoose: () => undefined,
			onCheckout: () => undefined,
			onCreated: () => undefined,
			folders: ['Admin', 'Roles'],
			folder: 'Roles',
		});
		// Rendered as the harness renders it, so it is the same form closed and opened again, not a new one.
		await act(async () => current!.root.render(createElement(TooltipProvider, null, createElement(NewWork, props(false)))));
		await act(async () => current!.root.render(createElement(TooltipProvider, null, createElement(NewWork, props(true)))));
		await settle();
		expect((document.getElementById('new-work-folder') as HTMLElement).textContent).toBe('Roles');
	});

	it('hands the screen the new project in its folder, so it is listed there before the list is read again', async () => {
		const created: Array<{ project: { folder: string | null } }> = [];
		await open(
			{ createPrototype: async () => ok(made) },
			{ folders: ['Admin'], onCreated: (c: { project: { folder: string | null } }) => void created.push(c) },
		);
		await fill();
		await pickFolder('Admin');
		await press(button('Create prototype'));
		await settle();
		expect(created.at(-1)?.project.folder).toBe('Admin');
	});

	it('makes the prototype in the folder chosen, or in a new one named there, or in none', async () => {
		const { app } = await open({ createPrototype: async () => ok(made) }, { folders: ['Admin'] });
		await fill();
		await pickFolder('Admin');
		await press(button('Create prototype'));
		await settle();
		expect(app.calls.createPrototype?.at(-1)?.[4]).toBe('Admin');
		await pickFolder('Add new folder');
		await typeInto(document.getElementById('new-work-folder-new') as HTMLInputElement, 'Alerts');
		await fill();
		await press(button('Create prototype'));
		await settle();
		expect(app.calls.createPrototype?.at(-1)?.[4]).toBe('Alerts');
	});

	it('makes it in no folder when none is chosen, or a new one is left without a name', async () => {
		const { app } = await open({ createPrototype: async () => ok(made) }, { folders: ['Admin'] });
		await fill();
		await press(button('Create prototype'));
		await settle();
		expect(app.calls.createPrototype?.at(-1)?.[4]).toBeNull();
		await pickFolder('Add new folder');
		await fill();
		await press(button('Create prototype'));
		await settle();
		expect(app.calls.createPrototype?.at(-1)?.[4]).toBeNull();
	});
});

describe('installing its packages', () => {
	const notInstalled = (canInstall: boolean) => ({
		ready: false,
		why: 'not-installed',
		designSystem: '@flocksafety/fui',
		repository: 'flock-coke',
		canInstall,
	});

	it('offers to install them when the repository says how, shows how far it has got, then asks again whether it is ready', async () => {
		let line: ((l: string) => void) | null = null;
		let finish: (v: unknown) => void = () => undefined;
		let asked = 0;
		const { app } = await open({
			prototypeReadiness: async () => (asked++, ok(asked > 1 ? { ready: true, designSystem: '@flocksafety/fui', version: '1' } : notInstalled(true))),
			installPackages: () => new Promise((r) => (finish = r)),
			onInstallLine: (l: (s: string) => void) => ((line = l), () => undefined),
		});
		expect(text()).toContain("flock-coke's packages are not installed on this machine yet");
		await press(button('Install packages'));
		await act(async () => line?.('added 812 packages in 41s'));
		expect(text()).toContain('added 812 packages in 41s');
		expect(button('Stop')).toBeTruthy();
		await act(async () => finish(ok(null)));
		await settle();
		expect(app.calls.installPackages).toEqual([[HERE.root]]);
		expect(text()).not.toContain('not installed');
	});

	it('says why an install failed, and offers it again', async () => {
		await open({
			prototypeReadiness: async () => ok(notInstalled(true)),
			installPackages: async () => fail('npm on this computer is not signed in to GitHub Packages'),
		});
		await press(button('Install packages'));
		await settle();
		expect(text()).toContain('not signed in to GitHub Packages');
		expect(button('Install packages')).toBeTruthy();
	});

	it('says what to run, with no button, when the repository does not say how it installs', async () => {
		await open({ prototypeReadiness: async () => ok(notInstalled(false)) });
		expect(text()).toContain('Run npm ci in it');
		expect(() => button('Install packages')).toThrow(/0 buttons/);
	});
});

describe('how far the list reaches', () => {
	it('says when it is only the repositories DSNR’s GitHub App can see, as the Connect screen does', async () => {
		await open({ listRepositories: async () => ok({ repositories: REPOS, reach: 'app' }) });
		expect(document.body.textContent).toContain('Only the repositories DSNR’s GitHub App is installed on are listed.');
	});
});

describe('a repository with no clone on this machine', () => {
	it('offers one button, with where it goes under it, the design repository when it comes too, and a way to change it', async () => {
		await open({ clonePlan: async () => ok({ ...PLAN, design: { state: 'free', path: '/h/GitHub/flock-designer' } }) });
		await chooseRepository('flocksafety/flock-ops');
		expect(button('Clone repository')).toBeTruthy();
		expect(text()).toContain('Into ~/GitHub/flock-ops, with flock-designer beside it · Change');
		await unmountAll((current as NonNullable<typeof current>).root);
		await open();
		await chooseRepository('flocksafety/flock-ops');
		expect(text()).toContain('Into ~/GitHub/flock-ops · Change');
		// Nothing to point the app at by hand: clones in the usual places and the clone folder are found by themselves.
		expect(text()).not.toContain('Point the app at it');
	});

	it('asks again where it goes once the folder is changed with the picker', async () => {
		let asked = 0;
		const { app } = await open({
			clonePlan: async () => (
				asked++,
				ok(asked > 1 ? { ...PLAN, place: { state: 'free', path: '/Volumes/w/flock-ops' }, where: '/Volumes/w/flock-ops' } : PLAN)
			),
			chooseCloneFolder: async () => ok('/Volumes/w'),
		});
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Change'));
		await settle();
		expect(app.calls.chooseCloneFolder).toHaveLength(1);
		expect(text()).toContain('Into /Volumes/w/flock-ops');
	});

	it('clones once, shows how far it has got, then carries on with it as the repository in use', async () => {
		let finish: (v: unknown) => void = () => undefined;
		const made = { root: '/h/GitHub/flock-ops', name: 'flock-ops', branch: 'develop', clean: true };
		const { app, seen } = await open({ cloneRepository: () => new Promise((r) => (finish = r)) });
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Clone repository'));
		await act(async () => progress?.({ repository: 'flocksafety/flock-ops', step: 'Receiving objects', percent: 45 }));
		expect(text()).toContain('Cloning flock-ops: Receiving objects 45%');
		expect(button('Stop')).toBeTruthy();
		await act(async () => finish(ok(made)));
		await settle();
		expect(app.calls.cloneRepository).toEqual([['flocksafety/flock-ops']]);
		expect(seen.checkout).toEqual([made]);
		// And the list is read again, which has it here now.
		expect(app.calls.listRepositories).toHaveLength(2);
		expect(() => button('Stop')).toThrow(/0 buttons/);
	});

	it('asks what it starts from only once it is cloned, not before', async () => {
		let finish: (v: unknown) => void = () => undefined;
		const made = { root: '/h/GitHub/flock-ops', name: 'flock-ops', branch: 'develop', clean: true };
		await open({ cloneRepository: () => new Promise((r) => (finish = r)) }, {});
		expect(startsFrom()).not.toBeNull();
		await chooseRepository('flocksafety/flock-ops');
		expect(startsFrom()).toBeNull();
		await press(button('Clone repository'));
		expect(startsFrom()).toBeNull();
		await act(async () => finish(ok(made)));
		await settle();
		expect(startsFrom()).not.toBeNull();
	});

	it('says why a clone failed where the button is, and can be tried again', async () => {
		await open({ cloneRepository: async () => fail('GitHub would not let git on this computer clone flocksafety/flock-ops') });
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Clone repository'));
		await settle();
		expect(text()).toContain('GitHub would not let git on this computer clone');
		expect(button('Clone repository').disabled).toBe(false);
	});

	it('says, once cloned, why it cannot be used, and where it is now, with no button left to press', async () => {
		let cloned = false;
		await open({
			clonePlan: async () => ok(cloned ? { ...PLAN, place: { state: 'cloned', path: '/h/GitHub/flock-ops' } } : PLAN),
			cloneRepository: async () => (
				(cloned = true),
				fail("Cloned, but no branch of flock-ops has the DSNR setup (.dsnr/workspace.json), so it can't be used here yet.")
			),
		});
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Clone repository'));
		await settle();
		expect(text()).toContain('Already in ~/GitHub/flock-ops');
		expect(text()).toContain('no branch of flock-ops has the DSNR setup');
		expect(() => button(/Clone repository|Use repository/)).toThrow(/0 buttons/);
	});

	it('shows where it goes under the repository, before the button', async () => {
		await open();
		await chooseRepository('flocksafety/flock-ops');
		const where = [...document.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Into ')) as HTMLElement;
		expect(where.compareDocumentPosition(button('Clone repository')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('will not clone over something else in the way, and says what it is', async () => {
		await open({
			clonePlan: async () =>
				ok({
					...PLAN,
					place: {
						state: 'taken',
						path: '/h/GitHub/flock-ops',
						why: '/h/GitHub/flock-ops already exists, and is not a clone of flocksafety/flock-ops.',
					},
				}),
		});
		await chooseRepository('flocksafety/flock-ops');
		expect(text()).toContain('is not a clone of flocksafety/flock-ops');
		expect(() => button('Clone repository')).toThrow(/0 buttons/);
	});

	it('uses a clone of it already there, rather than cloning it again', async () => {
		await open({ clonePlan: async () => ok({ ...PLAN, place: { state: 'cloned', path: '/h/GitHub/flock-ops' } }) });
		await chooseRepository('flocksafety/flock-ops');
		expect(text()).toContain('Already in ~/GitHub/flock-ops');
		expect(button('Use repository')).toBeTruthy();
	});

	it('stops the clone when the modal is closed while it runs', async () => {
		const { app, seen } = await open({ cloneRepository: () => new Promise(() => undefined) });
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Clone repository'));
		await press(button('Cancel'));
		expect(app.calls.cancelClone).toHaveLength(1);
		expect(seen.closed).toBe(1);
	});

	it('says nothing about cloning for the repository in use', async () => {
		const { app } = await open();
		expect(app.calls.clonePlan).toBeUndefined();
		expect(text()).not.toContain('Clone repository');
	});
});

describe('the repositories it chooses from', () => {
	it('shows the field loading while the list is read, not that there is no repository', async () => {
		await open({ listRepositories: () => new Promise(() => undefined) }, { checkout: null });
		expect(text()).not.toContain('No product repository found');
		expect([...document.querySelectorAll('[role="status"]')].some((e) => e.textContent === 'Loading your repositories…')).toBe(true);
	});

	it('says there is none only once the list is read and empty', async () => {
		await open({ listRepositories: async () => ok({ repositories: [], reach: 'account' }) }, { checkout: null });
		expect(text()).toContain('No product repository found');
	});

	it('says why the list could not be read, rather than nothing', async () => {
		await open({ listRepositories: async () => fail('Could not reach GitHub.') }, { checkout: null });
		expect(text()).toContain('Could not reach GitHub.');
		expect(text()).not.toContain('No product repository found');
	});

	it('is read once a session, for New and Connect alike, and again after a new sign-in (and after a clone, above)', async () => {
		let signedIn: () => void = () => undefined;
		const { app } = await open({
			onSignInChanged: (l: () => void) => {
				signedIn = l;
				return () => undefined;
			},
		});
		expect(app.calls.listRepositories).toHaveLength(1);
		await unmountAll(current!.root);
		current = await render(
			createElement(NewWork, {
				open: true,
				onClose: () => undefined,
				checkout: HERE,
				onChoose: () => undefined,
				onCheckout: () => undefined,
				onCreated: () => undefined,
			}),
		);
		await settle();
		expect(app.calls.listRepositories).toHaveLength(1);
		await act(async () => signedIn());
		await settle();
		expect(app.calls.listRepositories).toHaveLength(2);
	});
});
