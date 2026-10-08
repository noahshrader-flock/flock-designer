// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NewWork } from '../src/renderer/NewWork';
import type { ClonePlan, CloneProgress } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';

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
	design: null,
};

let current: Awaited<ReturnType<typeof render>> | null = null;
let progress: ((p: CloneProgress) => void) | null = null;
const open = async (more: Record<string, (...a: never[]) => unknown> = {}, props: Record<string, unknown> = {}) => {
	const app = fakeApp({
		listRepositories: async () => ok(REPOS),
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

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a repository with no clone on this machine', () => {
	it('says where it will be placed, with a way to change it, and that the design repository comes too when missing', async () => {
		await open({ clonePlan: async () => ok({ ...PLAN, design: { state: 'free', path: '/h/GitHub/flock-designer' } }) });
		await chooseRepository('flocksafety/flock-ops');
		expect(text()).toContain('Will be placed in /h/GitHub/flock-ops');
		expect(button('Change')).toBeTruthy();
		expect(text()).toContain('flock-designer, which holds the project records, is cloned beside it');
		// The trust is said before anything is cloned.
		expect(text()).toMatch(/lets Flock Designer run the commands flock-ops lists/);
	});

	it('asks again where it goes once the folder is changed with the picker', async () => {
		let asked = 0;
		const { app } = await open({ clonePlan: async () => (asked++, ok(asked > 1 ? { ...PLAN, place: { state: 'free', path: '/Volumes/w/flock-ops' } } : PLAN)), chooseCloneFolder: async () => ok('/Volumes/w') });
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Change'));
		await settle();
		expect(app.calls.chooseCloneFolder).toHaveLength(1);
		expect(text()).toContain('Will be placed in /Volumes/w/flock-ops');
	});

	it('clones once, shows how far it has got, then carries on with it as the repository in use', async () => {
		let finish: (v: unknown) => void = () => undefined;
		const made = { root: '/h/GitHub/flock-ops', name: 'flock-ops', branch: 'develop', clean: true };
		const { app, seen } = await open({ cloneRepository: () => new Promise((r) => (finish = r)) });
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Clone and continue'));
		await act(async () => progress?.({ repository: 'flocksafety/flock-ops', step: 'Receiving objects', percent: 45 }));
		expect(text()).toContain('Cloning flock-ops: Receiving objects 45%');
		expect(button('Stop')).toBeTruthy();
		await act(async () => finish(ok(made)));
		await settle();
		expect(app.calls.cloneRepository).toEqual([['flocksafety/flock-ops']]);
		expect(seen.checkout).toEqual([made]);
		expect(() => button('Stop')).toThrow(/0 buttons/);
	});

	it('says why a clone failed, and can be tried again', async () => {
		await open({ cloneRepository: async () => fail('GitHub would not let git on this computer clone flocksafety/flock-ops') });
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Clone and continue'));
		await settle();
		expect(text()).toContain('GitHub would not let git on this computer clone');
		expect(button('Clone and continue').disabled).toBe(false);
	});

	it('will not clone over something else in the way, and says what it is', async () => {
		await open({ clonePlan: async () => ok({ ...PLAN, place: { state: 'taken', path: '/h/GitHub/flock-ops', why: '/h/GitHub/flock-ops already exists, and is not a clone of flocksafety/flock-ops.' } }) });
		await chooseRepository('flocksafety/flock-ops');
		expect(text()).toContain('is not a clone of flocksafety/flock-ops');
		expect(button('Clone and continue').disabled).toBe(true);
	});

	it('uses a clone of it already there, rather than cloning it again', async () => {
		await open({ clonePlan: async () => ok({ ...PLAN, place: { state: 'cloned', path: '/h/GitHub/flock-ops' } }) });
		await chooseRepository('flocksafety/flock-ops');
		expect(text()).toContain('Already cloned in /h/GitHub/flock-ops');
		expect(button('Use it and continue')).toBeTruthy();
	});

	it('stops the clone when the modal is closed while it runs', async () => {
		const { app, seen } = await open({ cloneRepository: () => new Promise(() => undefined) });
		await chooseRepository('flocksafety/flock-ops');
		await press(button('Clone and continue'));
		await press(button('Cancel'));
		expect(app.calls.cancelClone).toHaveLength(1);
		expect(seen.closed).toBe(1);
	});

	it('says nothing about cloning for the repository in use', async () => {
		const { app } = await open();
		expect(app.calls.clonePlan).toBeUndefined();
		expect(text()).not.toContain('Will be placed in');
	});
});
