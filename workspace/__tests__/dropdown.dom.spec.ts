import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dropdown } from '../src/ui/Dropdown';
import { allByRole, button, key, named, press, render, unmountAll } from './ui';

const OPTIONS = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' },
	{ value: 'c', label: 'Gamma' },
];

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (value: string, options = OPTIONS) => {
	const onChange = vi.fn();
	current = await render(createElement(Dropdown, { label: 'Letter: switch letter', value, options, onChange }));
	return { onChange, trigger: button('Letter: switch letter') };
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a dropdown', () => {
	it('says what is chosen on its button, and lists nothing until it is opened', async () => {
		const { trigger } = await show('b');
		expect(trigger.textContent?.trim()).toBe('Beta');
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(allByRole('menuitem')).toHaveLength(0);
	});

	it('lists every choice as a radio of one group, the chosen one checked, and puts the focus on it', async () => {
		const { trigger } = await show('b');
		await press(trigger);
		const choices = allByRole('menuitem');
		expect(choices.map(named)).toEqual(['Alpha', 'Beta', 'Gamma']);
		expect(choices.map((c) => c.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio', 'menuitemradio']);
		expect(choices.map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
		expect(document.activeElement).toBe(choices[1]);
	});

	it('goes to the one chosen, closes, and gives the focus back to its button', async () => {
		const { trigger, onChange } = await show('a');
		await press(trigger);
		await press(allByRole('menuitem', 'Gamma')[0] as HTMLElement);
		expect(onChange).toHaveBeenCalledExactlyOnceWith('c');
		expect(allByRole('menuitem')).toHaveLength(0);
		expect(document.activeElement).toBe(trigger);
	});

	it('does nothing when the one already chosen is chosen again, but still closes', async () => {
		const { trigger, onChange } = await show('a');
		await press(trigger);
		await press(allByRole('menuitem', 'Alpha')[0] as HTMLElement);
		expect(onChange).not.toHaveBeenCalled();
		expect(allByRole('menuitem')).toHaveLength(0);
	});

	it('moves through the choices with the arrow keys, round the ends, and closes on Escape', async () => {
		const { trigger } = await show('c');
		await press(trigger);
		await key('ArrowDown');
		expect(named(document.activeElement as Element)).toBe('Alpha');
		await key('ArrowUp');
		expect(named(document.activeElement as Element)).toBe('Gamma');
		await key('Escape');
		expect(allByRole('menuitem')).toHaveLength(0);
		expect(document.activeElement).toBe(trigger);
	});

	it('is drawn with the classes its styles are written for: the button, its text, the list and its items', async () => {
		const { trigger } = await show('a');
		expect(trigger.classList.contains('menu-field')).toBe(true);
		expect(trigger.querySelector('.menu-field-text')?.textContent).toBe('Alpha');
		await press(trigger);
		expect(document.querySelectorAll('.menu-list > .menu-item')).toHaveLength(3);
	});

	it('lines its list up with the start of its button, where a menu of icons lines up with the end', async () => {
		const { trigger } = await show('a');
		expect(trigger.parentElement?.classList.contains('menu-start')).toBe(true);
	});

	it('says the first choice when what it is given is not among them, as the native dropdown it replaces did', async () => {
		const { trigger } = await show('gone');
		expect(trigger.textContent?.trim()).toBe('Alpha');
	});
});
