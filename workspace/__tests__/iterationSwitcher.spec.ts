// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IterationSwitcher, StateSwitcher } from '../src/renderer/IterationSwitcher';
import { button, press, render, settle, unmountAll } from './reviewHarness';

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
	it('has two dropdowns, one for the version and one for the iteration, each saying where you are', async () => {
		await show('v1-i2');
		expect(button('Version V1: switch version').textContent).toBe('V1');
		expect(button('Iteration I2: switch iteration').textContent).toBe('I2');
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
		expect(button('Iteration I1: switch iteration').textContent).toBe('I1');
	});
});

describe('a prototype’s states', () => {
	const STATES = ['default', 'no-match', 'panel'];
	const showStates = async (more: Record<string, unknown> = {}) => {
		const onSelect = vi.fn();
		current = await render(createElement(StateSwitcher, { states: STATES, current: null, onSelect, ...more } as never));
		return onSelect;
	};

	it('are a dropdown saying which one you are on, the first until another is chosen', async () => {
		await showStates();
		expect(button('State default: switch state').textContent).toBe('default');
		await unmountAll(current!.root);
		await showStates({ current: 'panel' });
		expect(button('State panel: switch state').textContent).toBe('panel');
	});

	it('lists every state, in the prototype’s own order, with this one chosen', async () => {
		await showStates({ current: 'no-match' });
		const items = await choices(button('State no-match: switch state'));
		expect(names(items)).toEqual(STATES);
		expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
	});

	it('goes to the state chosen, and back to the first as the one it opens in', async () => {
		const onSelect = await showStates({ current: 'panel' });
		await press((await choices(button('State panel: switch state')))[1]!);
		expect(onSelect).toHaveBeenLastCalledWith('no-match');
		await press((await choices(button('State panel: switch state')))[0]!);
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});

	it('says the first for a state the prototype no longer has, as the page then shows', async () => {
		await showStates({ current: 'gone' });
		expect(button('State default: switch state')).toBeTruthy();
	});

	it('is not there for a prototype with one state, or none: there is nothing to switch to', async () => {
		await showStates({ states: ['default'] });
		expect(document.querySelector('[aria-label^="State"]')).toBeNull();
		await unmountAll(current!.root);
		await showStates({ states: [] });
		expect(document.querySelector('[aria-label^="State"]')).toBeNull();
	});
});
