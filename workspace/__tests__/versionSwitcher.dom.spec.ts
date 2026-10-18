import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionSwitcher, StateSwitcher } from '../src/renderer/VersionSwitcher';
import { button, chooseState, openMenu, press, render, shownState, stateMenu, unmountAll } from './reviewHarness';

/**
 * Switching between a prototype's versions: a dropdown of them, the newest first, saying which is shown. Against the
 * component on its own.
 */

const at = (name: string) => ({ name, branch: `prototype/demo/${name}` });
// Newest first, as the screens hold them.
const PROTOTYPES = ['v4', 'v3', 'v2', 'v1'].map(at);

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (name: string, more: Record<string, unknown> = {}) => {
	const onSelect = vi.fn();
	current = await render(createElement(VersionSwitcher, { current: at(name), siblings: PROTOTYPES, onSelect, ...more } as never));
	return onSelect;
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

const names = (items: HTMLElement[]) => items.map((i) => i.textContent?.trim());

describe('for prototypes', () => {
	it('is one dropdown that says the version shown, with no second menu for versions', async () => {
		await show('v2');
		expect(button('Version 2: switch version').textContent).toBe('Version 2');
		expect(document.querySelector('[aria-label*="iteration"]')).toBeNull();
		expect(document.querySelector('.lucide-history')).toBeNull();
	});

	it('scrolls its menu when there are many versions', async () => {
		await show('v2');
		await openMenu(button('Version 2: switch version'));
		expect(document.querySelector('[data-slot="dropdown-menu-content"]')?.className.split(' ')).toContain('max-h-72');
	});

	it('lists every version, the newest first, with this one chosen', async () => {
		await show('v2');
		const items = await openMenu(button('Version 2: switch version'));
		expect(names(items)).toEqual(['Version 4', 'Version 3', 'Version 2', 'Version 1']);
		expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
	});

	it('lists them newest first, whatever order it was given them in, by number and not by spelling', async () => {
		await show('v2', { siblings: ['v1', 'v10', 'v2', 'v9'].map(at) });
		expect(names(await openMenu(button('Version 2: switch version')))).toEqual(['Version 10', 'Version 9', 'Version 2', 'Version 1']);
	});

	it('goes to the version chosen', async () => {
		const onSelect = await show('v2');
		await press((await openMenu(button('Version 2: switch version')))[0]!);
		expect(onSelect).toHaveBeenLastCalledWith(at('v4'));
	});

	it('does nothing when the one you are on is chosen again', async () => {
		const onSelect = await show('v2');
		await press((await openMenu(button('Version 2: switch version')))[2]!);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('says which version one was started from, beside its name', async () => {
		await show('v1', { siblings: [{ ...at('v3'), from: 'v1' }, at('v2'), at('v1')] });
		expect(names(await openMenu(button('Version 1: switch version')))).toEqual(['Version 3 · based on Version 1', 'Version 2', 'Version 1']);
	});

	it('is there with one version, so where you are is always visible', async () => {
		await show('v1', { siblings: [at('v1')] });
		expect(names(await openMenu(button('Version 1: switch version')))).toEqual(['Version 1']);
	});
});

describe('a prototype’s states', () => {
	const STATES = ['default', 'filtered', 'panel'];
	const showStates = async (more: Record<string, unknown> = {}) => {
		const onSelect = vi.fn();
		current = await render(createElement(StateSwitcher, { states: STATES, current: null, onSelect, ...more } as never));
		return onSelect;
	};

	it('are a dropdown that says the one shown, and lists them all in the prototype’s own order', async () => {
		await showStates();
		expect(stateMenu()?.getAttribute('aria-label')).toBe('State Default: switch state');
		expect(shownState()).toBe('Default');
		const items = await openMenu(stateMenu() as Element);
		expect(names(items)).toEqual(['Default', 'Filtered', 'Panel']);
		expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
	});

	it('say the one you are on, the first until another is chosen', async () => {
		await showStates({ current: 'panel' });
		expect(shownState()).toBe('Panel');
		expect((await openMenu(stateMenu() as Element)).map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
	});

	it('go to the state chosen, and back to the first as the one the page opens in', async () => {
		const onSelect = await showStates({ current: 'panel' });
		await chooseState('Filtered');
		expect(onSelect).toHaveBeenLastCalledWith('filtered');
		await unmountAll(current!.root);
		const again = await showStates({ current: 'filtered' });
		await chooseState('Default');
		expect(again).toHaveBeenLastCalledWith(null);
	});

	it('do nothing when the one you are on is chosen again', async () => {
		const onSelect = await showStates({ current: 'panel' });
		await chooseState('Panel');
		expect(onSelect).not.toHaveBeenCalled();
		expect(shownState()).toBe('Panel');
	});

	it('show the first for a state the prototype no longer has, as the page then does', async () => {
		await showStates({ current: 'gone' });
		expect(shownState()).toBe('Default');
	});

	it('are the normal size of the bar, as the version beside them is', async () => {
		await showStates();
		expect(stateMenu()?.getAttribute('data-size')).toBe('default');
	});

	it('are not there for a prototype with one state, or none: there is nothing to switch to', async () => {
		await showStates({ states: ['default'] });
		expect(stateMenu()).toBeNull();
		await unmountAll(current!.root);
		await showStates({ states: [] });
		expect(stateMenu()).toBeNull();
	});
});
