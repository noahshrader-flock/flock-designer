// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PanelTabs, PanelTabsContent, PanelTabsList, PanelTabsTrigger } from '../src/renderer/PanelTabs';
import { render, unmountAll } from './reviewHarness';

/**
 * Tabs in a side panel: a strip that runs edge to edge on a bottom border, with the padding on what is under it (which
 * scrolls on its own, so the strip stays at the top). One piece, so any panel with tabs has them the same.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const show = async () => {
	current = await render(
		createElement(
			PanelTabs,
			{ defaultValue: 'a' },
			createElement(PanelTabsList, null, createElement(PanelTabsTrigger, { value: 'a' }, 'One'), createElement(PanelTabsTrigger, { value: 'b' }, 'Two')),
			createElement(PanelTabsContent, { value: 'a' }, 'First'),
		),
	);
};

describe('the panel’s tabs', () => {
	it('are shadcn’s line tabs, full width, on a bottom border, with no padding around the strip', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		expect(list.getAttribute('data-variant')).toBe('line');
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['w-full', 'border-b']));
		expect(list.closest('[data-slot="panel-tabs"]')?.className).not.toMatch(/(^|\s)p[xtblr]?-\d/);
	});

	it('fill the panel from top to bottom, the strip first and what is under it scrolling', async () => {
		await show();
		const root = document.querySelector('[data-slot="panel-tabs"]') as HTMLElement;
		expect(root.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'min-h-0', 'flex-1']));
		// A column: the strip on top, the content filling what is left.
		expect(root.getAttribute('data-orientation')).toBe('horizontal');
		const content = document.querySelector('[data-slot="tabs-content"]') as HTMLElement;
		expect(content.className.split(' ')).toEqual(expect.arrayContaining(['min-h-0', 'flex-1', 'overflow-y-auto', 'p-4']));
		expect(content.textContent).toBe('First');
	});
});
