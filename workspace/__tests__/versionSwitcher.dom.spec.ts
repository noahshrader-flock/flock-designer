import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionSwitcher, StateSwitcher } from '../src/viewer/VersionSwitcher';
import { choicesIn, choose, chooseState, render, shownIn, shownState, stateMenu, switchMenu, unmountAll } from './reviewHarness';

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

const versions = () => switchMenu('version');

describe('for prototypes', () => {
	it('is one dropdown, VS Code’s own, that says the version shown, with no second menu for versions', async () => {
		await show('v2');
		expect(versions()?.getAttribute('aria-label')).toBe('Version 2: switch version');
		expect(shownIn(versions())).toBe('Version 2');
		expect(document.querySelectorAll('select')).toHaveLength(1);
		expect(document.querySelector('[aria-label*="iteration"]')).toBeNull();
	});

	it('lists every version, the newest first, with this one chosen', async () => {
		await show('v2');
		expect(choicesIn(versions())).toEqual(['Version 4', 'Version 3', 'Version 2', 'Version 1']);
		expect(shownIn(versions())).toBe('Version 2');
	});

	it('lists them newest first, whatever order it was given them in, by number and not by spelling', async () => {
		await show('v2', { siblings: ['v1', 'v10', 'v2', 'v9'].map(at) });
		expect(choicesIn(versions())).toEqual(['Version 10', 'Version 9', 'Version 2', 'Version 1']);
	});

	it('goes to the version chosen', async () => {
		const onSelect = await show('v2');
		await choose(versions(), 'Version 4');
		expect(onSelect).toHaveBeenLastCalledWith(at('v4'));
	});

	it('does nothing when the one you are on is chosen again', async () => {
		const onSelect = await show('v2');
		await choose(versions(), 'Version 2');
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('says which version one was started from, beside its name', async () => {
		await show('v1', { siblings: [{ ...at('v3'), from: 'v1' }, at('v2'), at('v1')] });
		expect(choicesIn(versions())).toEqual(['Version 3 · based on Version 1', 'Version 2', 'Version 1']);
	});

	it('is there with one version, so where you are is always visible', async () => {
		await show('v1', { siblings: [at('v1')] });
		expect(choicesIn(versions())).toEqual(['Version 1']);
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
		expect(choicesIn(stateMenu())).toEqual(['Default', 'Filtered', 'Panel']);
	});

	it('say the one you are on, the first until another is chosen', async () => {
		await showStates({ current: 'panel' });
		expect(shownState()).toBe('Panel');
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

	it('are not there for a prototype with one state, or none: there is nothing to switch to', async () => {
		await showStates({ states: ['default'] });
		expect(stateMenu()).toBeNull();
		await unmountAll(current!.root);
		await showStates({ states: [] });
		expect(stateMenu()).toBeNull();
	});
});
