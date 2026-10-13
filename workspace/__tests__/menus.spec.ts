// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceMenu } from '../src/renderer/ChoiceMenu';
import { MenuLink } from '../src/renderer/Links';
import { MoreMenu } from '../src/renderer/MoreMenu';
import { DropdownMenuItem } from '../src/renderer/ui/dropdown-menu';
import { button, openMenu, press, render, unmountAll } from './reviewHarness';
import { windowSources } from './windowSources';

/**
 * Menus, one way each: the More menu (a ghost ellipsis, which can say it is working and come smaller), the menu of one
 * of a few choices (a button that says the one chosen, or an icon), and a link out as one of a menu's items.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the More menu', () => {
	it('says it is working with a spinner in place of its ellipsis, and comes in a smaller size', async () => {
		current = await render(createElement(MoreMenu, { busy: true, size: 'icon-sm', children: createElement(DropdownMenuItem, null, 'Resolve') }));
		const trigger = button('More');
		expect(trigger.getAttribute('data-size')).toBe('icon-sm');
		expect(trigger.querySelector('[role="status"], [data-slot="spinner"], .animate-spin')).not.toBeNull();
	});
});

describe('a choice of a few', () => {
	it('can be an icon, named by what it picks, and says nothing when the one chosen is chosen again', async () => {
		const onChange = vi.fn();
		current = await render(
			createElement(ChoiceMenu, {
				name: 'Iteration',
				ariaLabel: 'Iteration I2: switch iteration',
				value: 'i2',
				choices: [
					{ value: 'i2', label: 'I2' },
					{ value: 'i1', label: 'I1' },
				],
				onChange,
				icon: createElement('svg'),
				align: 'end',
			}),
		);
		const trigger = button('Iteration I2: switch iteration');
		expect(trigger.getAttribute('data-size')).toBe('icon');
		await openMenu(trigger);
		const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(items.map((i) => [i.textContent, i.getAttribute('aria-checked')])).toEqual([
			['I2', 'true'],
			['I1', 'false'],
		]);
		await press(items[0]!);
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe('a link in a menu', () => {
	it('is a menu item that opens in the browser', async () => {
		current = await render(
			createElement(MoreMenu, { children: createElement(MenuLink, { href: 'https://example.test/x', icon: null, children: 'Built in code' }) }),
		);
		const items = await openMenu(button('More'));
		const link = items[0]!;
		expect([link.tagName, link.getAttribute('href'), link.getAttribute('target')]).toEqual(['A', 'https://example.test/x', '_blank']);
	});
});

describe('every menu', () => {
	it('is one of these: no screen builds its own ellipsis menu, radio menu, or link out', () => {
		const sources = windowSources('MoreMenu.tsx', 'ChoiceMenu.tsx', 'Links.tsx', 'DesignSystem.tsx');
		const ellipsis = sources.filter(({ text }) => /<EllipsisVerticalIcon/.test(text)).map((f) => f.path);
		const radios = sources.filter(({ text }) => /<DropdownMenuRadioGroup/.test(text)).map((f) => f.path);
		const anchors = sources.filter(({ text }) => /<a\b[^>]*target="_blank"/.test(text)).map((f) => f.path);
		expect({ ellipsis, radios, anchors }).toEqual({ ellipsis: [], radios: [], anchors: [] });
	});
});
