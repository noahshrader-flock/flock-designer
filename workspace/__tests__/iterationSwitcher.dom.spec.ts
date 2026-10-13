import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IterationSwitcher, StateSwitcher } from '../src/renderer/IterationSwitcher';
import { button, press, render, settle, shownState, state, stateButtons, stateGroup, unmountAll } from './reviewHarness';

/**
 * Switching between a project's work: for prototypes, a dropdown of its versions and, beside it, a dropdown of the
 * iterations in the version you are on; for codebase work, one list. Against the component on its own.
 */

const at = (name: string) => ({ name, branch: `prototype/demo/${name}` });
// Newest first, as the screens hold them.
const PROTOTYPES = ['v2-i1', 'v1-i3', 'v1-i2', 'v1-i1'].map(at);

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (name: string, more: Record<string, unknown> = {}) => {
	const onSelect = vi.fn();
	current = await render(createElement(IterationSwitcher, { current: at(name), siblings: PROTOTYPES, grouped: true, onSelect, ...more } as never));
	return onSelect;
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

/** Opens a dropdown as a pointer does, and returns its radio items. */
const choices = async (trigger: Element): Promise<HTMLElement[]> => {
	await press(trigger);
	trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
	await settle(2);
	return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
};
const names = (items: HTMLElement[]) => items.map((i) => i.textContent?.trim());

describe('for prototypes', () => {
	it('has a dropdown for the version, saying which, and a history button for the iteration', async () => {
		await show('v1-i2');
		expect(button('Version V1: switch version').textContent).toBe('V1');
		// The iteration is a history icon, not words: its name is for assistive technology and its menu says which.
		const history = button('Iteration I2: switch iteration');
		expect(history.textContent).toBe('');
		expect(history.querySelector('.lucide-history')).not.toBeNull();
		expect(history.getAttribute('data-size')).toBe('icon');
	});

	it('scrolls its history when there are many iterations', async () => {
		await show('v1-i2');
		await choices(button('Iteration I2: switch iteration'));
		expect(document.querySelector('[data-slot="dropdown-menu-content"]')?.className.split(' ')).toContain('max-h-72');
	});

	it('lists every version in the version dropdown, with this one chosen, and nothing of iterations', async () => {
		await show('v1-i2');
		const items = await choices(button('Version V1: switch version'));
		expect(names(items)).toEqual(['V2', 'V1']);
		expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true']);
	});

	it('lists only this version’s iterations in the iteration dropdown, newest first', async () => {
		await show('v1-i2');
		const items = await choices(button('Iteration I2: switch iteration'));
		expect(names(items)).toEqual(['I3', 'I2', 'I1']);
		expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
	});

	it('lists them newest first, whatever order it was given them in', async () => {
		await show('v1-i2', { siblings: ['v1-i1', 'v1-i3', 'v2-i1', 'v1-i2'].map(at) });
		expect(names(await choices(button('Version V1: switch version')))).toEqual(['V2', 'V1']);
		await unmountAll(current!.root);
		await show('v1-i2', { siblings: ['v1-i1', 'v1-i3', 'v2-i1', 'v1-i2'].map(at) });
		expect(names(await choices(button('Iteration I2: switch iteration')))).toEqual(['I3', 'I2', 'I1']);
	});

	it('goes to the newest iteration of a version chosen, and to the iteration chosen', async () => {
		const onSelect = await show('v1-i2');
		await press((await choices(button('Version V1: switch version')))[0]!);
		expect(onSelect).toHaveBeenLastCalledWith(at('v2-i1'));
		await unmountAll(current!.root);
		const second = await show('v1-i2');
		await press((await choices(button('Iteration I2: switch iteration')))[2]!);
		expect(second).toHaveBeenLastCalledWith(at('v1-i1'));
	});

	it('does nothing when the one you are on is chosen again', async () => {
		const onSelect = await show('v1-i2');
		await press((await choices(button('Version V1: switch version')))[1]!);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('follows the version you are on: its iterations are the ones listed', async () => {
		await show('v2-i1');
		expect(button('Version V2: switch version')).toBeTruthy();
		expect(names(await choices(button('Iteration I1: switch iteration')))).toEqual(['I1']);
	});

	it('is there with one version and one iteration, so where you are is always visible', async () => {
		await show('v1-i1', { siblings: [at('v1-i1')] });
		expect(button('Version V1: switch version')).toBeTruthy();
		expect(button('Iteration I1: switch iteration')).toBeTruthy();
	});

	it('says something after an iteration’s name in the iteration dropdown, when asked to', async () => {
		await show('v1-i2', { note: (i: { name: string }) => (i.name === 'v1-i3' ? ' · only on this machine' : '') });
		expect(names(await choices(button('Iteration I2: switch iteration')))).toEqual(['I3 · only on this machine', 'I2', 'I1']);
	});

	it('treats an older prototype named i1 as version 1', async () => {
		await show('i1', { siblings: [at('i1')], current: at('i1') });
		expect(button('Version V1: switch version')).toBeTruthy();
		expect(button('Iteration I1: switch iteration')).toBeTruthy();
	});
});

describe('for codebase work', () => {
	it('is one list, as it was', async () => {
		const codebase = { name: 'codebase', branch: 'feature/demo' };
		await show('codebase', { current: codebase, siblings: [codebase], grouped: false });
		expect(document.querySelector('[aria-label^="Version"]')).toBeNull();
		expect(button('Iteration I1: switch iteration').querySelector('.lucide-history')).not.toBeNull();
	});
});

describe('a prototype’s states', () => {
	const STATES = ['default', 'filtered', 'panel'];
	const showStates = async (more: Record<string, unknown> = {}) => {
		const onSelect = vi.fn();
		current = await render(createElement(StateSwitcher, { states: STATES, current: null, onSelect, ...more } as never));
		return onSelect;
	};

	it('are a group of buttons, one each, in the prototype’s own order', async () => {
		await showStates();
		expect(stateGroup()).not.toBeNull();
		expect(stateButtons().map((b) => b.textContent)).toEqual(['Default', 'Filtered', 'Panel']);
	});

	it('press the one you are on, the first until another is chosen', async () => {
		await showStates();
		expect(shownState()).toBe('Default');
		expect(stateButtons().map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
		await unmountAll(current!.root);
		await showStates({ current: 'panel' });
		expect(shownState()).toBe('Panel');
	});

	it('go to the state chosen, and back to the first as the one the page opens in', async () => {
		const onSelect = await showStates({ current: 'panel' });
		await press(state('Filtered'));
		expect(onSelect).toHaveBeenLastCalledWith('filtered');
		await press(state('Default'));
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});

	it('do nothing when the one you are on is pressed again, rather than leaving none shown', async () => {
		const onSelect = await showStates({ current: 'panel' });
		await press(state('Panel'));
		expect(onSelect).not.toHaveBeenCalled();
		expect(shownState()).toBe('Panel');
	});

	it('show the first for a state the prototype no longer has, as the page then does', async () => {
		await showStates({ current: 'gone' });
		expect(shownState()).toBe('Default');
	});

	it('are the normal size of the bar, joined into one control, and are not words in a menu', async () => {
		await showStates();
		expect(stateButtons().map((b) => b.getAttribute('data-size'))).toEqual(['default', 'default', 'default']);
		expect(stateGroup()?.getAttribute('data-spacing')).toBe('0');
		expect(document.querySelector('[role="menu"]')).toBeNull();
	});

	it('are not there for a prototype with one state, or none: there is nothing to switch to', async () => {
		await showStates({ states: ['default'] });
		expect(stateGroup()).toBeNull();
		await unmountAll(current!.root);
		await showStates({ states: [] });
		expect(stateGroup()).toBeNull();
	});
});
