// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IterationSwitcher } from '../src/renderer/IterationSwitcher';
import { MoreMenu } from '../src/renderer/MoreMenu';
import { ProjectSort } from '../src/renderer/ProjectSort';
import { ShareControl } from '../src/renderer/ShareControl';
import { Dialog, DialogContent, DialogTitle } from '../src/renderer/ui/dialog';
import { DropdownMenuItem } from '../src/renderer/ui/dropdown-menu';
import { PROJECT, PROTOTYPE, fakeApp, openMenu, render, settle, unmountAll } from './reviewHarness';

/**
 * The controls in the top bar keep to their own words: a dropdown button says where you are, and says nothing more when the
 * pointer or the keyboard rests on it (too many small boxes hovering in the bar). And a dialog sits low enough on the screen
 * to read as its own place.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

/** Rests the pointer and then the keyboard on a control, as a person looks at it before choosing, and waits. */
const rest = async (el: Element) => {
	await act(async () => {
		el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
		(el as HTMLElement).focus();
	});
	await settle();
};
/** What a menu of choices offers: a radio menu's items are radios, not plain items. */
const choices = async (el: Element) => {
	await openMenu(el);
	return [...document.querySelectorAll('[role="menuitemradio"]')].map((i) => i.textContent);
};
const tooltips = () => document.querySelectorAll('[data-slot="tooltip-content"]');
const trigger = (label: string | RegExp) =>
	[...document.querySelectorAll<HTMLElement>('button')].find((b) =>
		typeof label === 'string' ? b.getAttribute('aria-label') === label : label.test(b.getAttribute('aria-label') ?? ''),
	)!;

const SIBLINGS = [
	{ name: 'v1-i1', branch: 'prototype/demo/v1-i1' },
	{ name: 'v1-i2', branch: 'prototype/demo/v1-i2' },
	{ name: 'v2-i1', branch: 'prototype/demo/v2-i1' },
];

describe('the version and iteration dropdowns', () => {
	const show = async () => {
		(window as unknown as { workspace: unknown }).workspace = fakeApp().api;
		current = await render(createElement(IterationSwitcher, { current: SIBLINGS[2]!, siblings: SIBLINGS, grouped: true, onSelect: vi.fn() }));
	};

	it('have no tooltip on the version, nor on the history', async () => {
		await show();
		await rest(trigger(/^Version/));
		await rest(trigger(/^Iteration/));
		expect(tooltips()).toHaveLength(0);
	});

	it('are named for assistive technology all the same, and still open their menus', async () => {
		await show();
		expect(trigger('Version V2: switch version')).toBeTruthy();
		expect(trigger('Iteration I1: switch iteration')).toBeTruthy();
		expect(await choices(trigger(/^Version/))).toEqual(['V2', 'V1']);
	});
});

describe('the More menus', () => {
	it('have no tooltip, in the one every screen shares', async () => {
		current = await render(createElement(MoreMenu, null, createElement(DropdownMenuItem, null, 'Item')));
		await rest(trigger('More'));
		expect(tooltips()).toHaveLength(0);
		expect((await openMenu(trigger('More'))).map((i) => i.textContent)).toEqual(['Item']);
	});

	it('have none on a prototype’s, which is the one that shows a spinner while sharing', async () => {
		(window as unknown as { workspace: unknown }).workspace = fakeApp().api;
		current = await render(
			createElement(ShareControl, {
				checkout: null,
				project: PROJECT,
				iteration: PROTOTYPE,
				canOpen: true,
				onOpenInBrowser: vi.fn(),
				prototype: true,
				onMoveToCode: vi.fn(),
				editor: {} as never,
			}),
		);
		await rest(trigger('More'));
		expect(tooltips()).toHaveLength(0);
		expect(trigger('More').disabled).toBe(false);
	});
});

describe('the sort on the Projects screen', () => {
	it('has no tooltip, and still names itself and opens its menu', async () => {
		const onChange = vi.fn();
		current = await render(createElement(ProjectSort, { order: 'updated', onChange }));
		await rest(trigger(/^Sort projects/));
		expect(tooltips()).toHaveLength(0);
		expect(trigger('Sort projects: Last updated').textContent).toBe('Last updated');
		expect(await choices(trigger(/^Sort projects/))).toEqual(['Last updated', 'Alphabetical']);
	});
});

describe('a dialog', () => {
	const classes = async () => {
		current = await render(createElement(Dialog, { open: true }, createElement(DialogContent, null, createElement(DialogTitle, null, 'A dialog'))));
		return document.querySelector('[data-slot="dialog-content"]')!.className.split(' ');
	};

	it('is 15% of the way down the window, the same for every dialog', async () => {
		const list = await classes();
		expect(list).toContain('top-[15%]');
		expect(list).not.toContain('top-[20%]');
	});

	it('is no taller than what is left below it, so a long one scrolls inside itself and never runs off the window', async () => {
		const list = await classes();
		// 15% down, and the rest of the window less a margin: 100% - 15% - 1rem.
		expect(list).toContain('max-h-[calc(85dvh-1rem)]');
		expect(list.some((c) => c === 'max-h-[85dvh]')).toBe(false);
	});
});
