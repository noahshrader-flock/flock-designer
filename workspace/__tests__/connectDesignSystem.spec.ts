// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectDesignSystem } from '../src/renderer/ConnectDesignSystem';
import type { ClonePlan } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';

/**
 * Connecting the design system (P0 of the design system plan): Clone, with the New modal's own picker and clone panel,
 * and Locate, with the system's folder picker. Against a fake app.
 */

const LIB = 'flocksafety/flock-react-component-lib';
const REPOS = [
	{ name: 'flocksafety/flock-coke', root: '/h/GitHub/flock-coke' },
	{ name: LIB, root: null },
];
const PLAN: ClonePlan = { repository: LIB, place: { state: 'free', path: '/h/GitHub/flock-react-component-lib' }, where: '~/GitHub/flock-react-component-lib', design: null };

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (more: Record<string, (...a: never[]) => unknown> = {}, lost: string | null = null) => {
	const app = fakeApp({ listRepositories: async () => ok(REPOS), clonePlan: async () => ok(PLAN), ...more });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	const onConnected = vi.fn();
	current = await render(createElement(ConnectDesignSystem, { repository: LIB, lost, onConnected }));
	return { app, onConnected };
};
const text = () => document.body.textContent ?? '';
const tab = (name: string) =>
	act(async () => void [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === name)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('Clone', () => {
	it('is the first tab, with the library already chosen and where it will go', async () => {
		const { app } = await open();
		expect(text()).toContain('Connect the design system');
		expect(button(LIB)).toBeTruthy();
		expect(text()).toContain('Into ~/GitHub/flock-react-component-lib');
		// The design system is read, not worked in: no design repository beside it.
		expect(text()).not.toContain('flock-designer');
		expect(app.calls.clonePlan).toEqual([[LIB]]);
	});

	it('clones the library through the design system clone, and says it is connected', async () => {
		const { app, onConnected } = await open({ cloneDesignSystem: async () => ok(null) });
		await press(button('Clone repository'));
		await settle();
		expect(app.calls.cloneDesignSystem).toEqual([[LIB]]);
		expect(app.calls.cloneRepository).toBeUndefined();
		expect(onConnected).toHaveBeenCalledOnce();
	});

	it('says why a clone could not be used, and does not connect', async () => {
		const { onConnected } = await open({ cloneDesignSystem: async () => fail('Could not reach GitHub to clone flocksafety/flock-react-component-lib.') });
		await press(button('Clone repository'));
		await settle();
		expect(text()).toContain('Could not reach GitHub');
		expect(onConnected).not.toHaveBeenCalled();
	});

	it('says another repository is not the design system, and offers nothing to clone', async () => {
		await open();
		await press(button(LIB));
		await settle();
		const coke = [...document.querySelectorAll('[cmdk-item]')].find((i) => i.textContent === 'flocksafety/flock-coke')!;
		await act(async () => void coke.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		await settle();
		expect(text()).toContain('That is not the design system library.');
		expect([...document.querySelectorAll('button')].some((b) => /Clone repository|Use repository/.test(b.textContent ?? ''))).toBe(false);
	});

	it('says to ask for access when the person’s list does not have the library', async () => {
		await open({ listRepositories: async () => ok([REPOS[0]]) });
		expect(text()).toContain(`Your GitHub account cannot see ${LIB}`);
	});
});

describe('Locate', () => {
	it('opens the folder picker in the app, and says it is connected', async () => {
		const { app, onConnected } = await open({ locateDesignSystem: async () => ok(true) });
		await tab('Locate');
		await press(button('Browse…'));
		await settle();
		expect(app.calls.locateDesignSystem).toEqual([[]]);
		expect(onConnected).toHaveBeenCalledOnce();
	});

	it('says why a folder was refused, and a cancel says nothing', async () => {
		let answer = fail('/x is a clone of flocksafety/flock-coke, not flocksafety/flock-react-component-lib.') as ReturnType<typeof ok<boolean>> | ReturnType<typeof fail>;
		const { onConnected } = await open({ locateDesignSystem: async () => answer });
		await tab('Locate');
		await press(button('Browse…'));
		await settle();
		expect(text()).toContain('is a clone of flocksafety/flock-coke');
		answer = ok(false);
		await press(button('Browse…'));
		await settle();
		expect(text()).not.toContain('is a clone of');
		expect(onConnected).not.toHaveBeenCalled();
	});
});

it('clears what went wrong in one tab when the other is chosen', async () => {
	await open({ locateDesignSystem: async () => fail('/x is not a git repository.') });
	await tab('Locate');
	await press(button('Browse…'));
	await settle();
	expect(text()).toContain('/x is not a git repository.');
	await tab('Clone');
	expect(text()).not.toContain('/x is not a git repository.');
});

it('says a folder connected before is lost', async () => {
	await open({}, '/h/Old/fui');
	expect(text()).toContain('is no longer there: /h/Old/fui');
});
