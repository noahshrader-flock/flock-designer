// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { LineTabs, LineTabsContent, LineTabsList, LineTabsTrigger } from '../src/renderer/LineTabs';
import { render, unmountAll } from './reviewHarness';

/**
 * Line tabs: a strip that runs edge to edge on a bottom border, with the padding on what is under it (which scrolls on its
 * own, so the strip stays at the top). One piece, so every row of tabs in a pane has them the same.
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
			LineTabs,
			{ defaultValue: 'a' },
			createElement(LineTabsList, null, createElement(LineTabsTrigger, { value: 'a' }, 'One'), createElement(LineTabsTrigger, { value: 'b' }, 'Two')),
			createElement(LineTabsContent, { value: 'a' }, 'First'),
		),
	);
};

describe('line tabs', () => {
	it('are shadcn’s line tabs, full width, on a bottom border, with no padding around the strip', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		expect(list.getAttribute('data-variant')).toBe('line');
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['w-full', 'border-b']));
		expect(list.closest('[data-slot="line-tabs"]')?.className).not.toMatch(/(^|\s)p[xtblr]?-\d/);
	});

	it('give each tab an equal share of the strip, so they stretch across its width with nothing set on the tabs themselves', async () => {
		await show();
		for (const tab of document.querySelectorAll<HTMLElement>('[role="tab"]')) {
			expect(tab.className.split(' ')).toContain('flex-1');
			// Nothing set on the tab at the call site: only what the component itself gives every tab.
			expect(tab.className).not.toMatch(/(^|\s)(h-full|p-0)(\s|$)/);
		}
	});

	it('write each tab’s label in title case, whatever it was written in, and leave a label that is not text as it is', async () => {
		current = await render(
			createElement(
				LineTabs,
				{ defaultValue: 'a' },
				createElement(
					LineTabsList,
					null,
					createElement(LineTabsTrigger, { value: 'a' }, 'voice and tone'),
					createElement(LineTabsTrigger, { value: 'b' }, 'Color'),
					createElement(LineTabsTrigger, { value: 'c' }, createElement('em', null, 'not text')),
				),
			),
		);
		expect([...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Voice and Tone', 'Color', 'not text']);
	});

	it('fill the panel from top to bottom, the strip first and what is under it scrolling', async () => {
		await show();
		const root = document.querySelector('[data-slot="line-tabs"]') as HTMLElement;
		expect(root.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'min-h-0', 'flex-1']));
		// A column: the strip on top, the content filling what is left.
		expect(root.getAttribute('data-orientation')).toBe('horizontal');
		const content = document.querySelector('[data-slot="tabs-content"]') as HTMLElement;
		expect(content.className.split(' ')).toEqual(expect.arrayContaining(['min-h-0', 'flex-1', 'overflow-y-auto', 'p-4']));
		expect(content.textContent).toBe('First');
	});
});
