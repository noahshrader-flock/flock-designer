// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/renderer/ui/tabs';
import { render, unmountAll } from './reviewHarness';

/**
 * Tabs, and their line variant: a strip that runs edge to edge on a bottom border, with the padding on what is under it
 * (which scrolls on its own, so the strip stays at the top). One piece, so every row of tabs in a pane has them the same.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const show = async (bar = false) => {
	current = await render(
		createElement(
			Tabs,
			{ variant: 'line', defaultValue: 'a' },
			createElement(
				TabsList,
				bar ? { bar: true } : null,
				createElement(TabsTrigger, { value: 'a' }, 'One'),
				createElement(TabsTrigger, { value: 'b' }, 'Two'),
			),
			createElement(TabsContent, { value: 'a' }, 'First'),
		),
	);
};

describe('line tabs', () => {
	it('are shadcn’s line tabs, full width, on a bottom border, with no padding around the strip', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		expect(list.getAttribute('data-variant')).toBe('line');
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['min-w-full', 'border-b']));
		expect(list.closest('[data-slot="tabs"][data-variant="line"]')?.className).not.toMatch(/(^|\s)p[xtblr]?-\d/);
	});

	it('scroll sideways, from the first tab at the left, when there are more than fit: the strip is as wide as its tabs in a box that scrolls it', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		const box = list.parentElement as HTMLElement;
		// The strip is at least its box and as wide as its tabs, and starts at the left: a centered row would spill off both ends.
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['w-max', 'min-w-full', 'justify-start']));
		expect(list.className.split(' ')).not.toContain('justify-center');
		expect(box.getAttribute('data-slot')).toBe('tabs-scroll');
		expect(box.className.split(' ')).toContain('overflow-x-auto');
		// Room below the strip for a tab's underline, which is drawn over its border, with the layout unmoved.
		expect(box.className.split(' ')).toEqual(expect.arrayContaining(['pb-px', '-mb-px']));
	});

	it('give each tab an equal share of the strip, so they stretch across its width with nothing set on the tabs themselves', async () => {
		await show();
		for (const tab of document.querySelectorAll<HTMLElement>('[role="tab"]')) {
			expect(tab.className.split(' ')).toContain('flex-1');
			// Nothing set on the tab at the call site: only what the component itself gives every tab.
			expect(tab.className).not.toMatch(/(^|\s)(h-full|p-0)(\s|$)/);
		}
	});

	it('are as wide as their labels, at the left, in a strip as tall as a toolbar, when it is a bar of tabs: an option of the component, set on nothing else', async () => {
		await show(true);
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		const classes = list.className.split(' ');
		expect(list.hasAttribute('data-bar')).toBe(true);
		// Still edge to edge on its border, but its tabs are not shares of it, and it is as tall as the bar under it.
		expect(classes).toEqual(
			expect.arrayContaining([
				'min-w-full',
				'border-b',
				'justify-start',
				'group-data-horizontal/tabs:h-(--toolbar-height)',
				'[&>[role=tab]]:flex-none',
			]),
		);
		// Aligned with what is under it, which is inset by the page's padding, and on the toolbar's own background.
		expect(classes).toEqual(expect.arrayContaining(['px-(--page-padding)', 'bg-card']));
		expect(classes).not.toContain('group-data-horizontal/tabs:h-8');
	});

	it('are, without the option, the panel’s: equal shares of the strip, and no bar’s height or inset', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		expect(list.hasAttribute('data-bar')).toBe(false);
		expect(list.className).not.toMatch(/toolbar-height|page-padding|flex-none/);
	});

	it('take the variant from the root, said once, and leave plain tabs as they were', async () => {
		await show();
		expect((document.querySelector('[data-slot="tabs-list"]') as HTMLElement).getAttribute('data-variant')).toBe('line');
		await unmountAll(current!.root);
		document.body.innerHTML = '';
		current = await render(
			createElement(
				Tabs,
				{ defaultValue: 'a' },
				createElement(TabsList, null, createElement(TabsTrigger, { value: 'a' }, 'One')),
				createElement(TabsContent, { value: 'a' }, 'First'),
			),
		);
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		expect(list.getAttribute('data-variant')).toBe('default');
		expect(list.className).not.toMatch(/border-b|min-w-full/);
		expect(document.querySelector('[data-slot="tabs-scroll"]')).toBeNull();
		expect((document.querySelector('[data-slot="tabs-content"]') as HTMLElement).className).not.toMatch(/overflow-y-auto|p-4/);
		expect(document.querySelector('[data-slot="tabs"]')?.className).not.toMatch(/min-h-0/);
	});

	it('write each tab’s label in title case, whatever it was written in, and leave a label that is not text as it is', async () => {
		current = await render(
			createElement(
				Tabs,
				{ variant: 'line', defaultValue: 'a' },
				createElement(
					TabsList,
					null,
					createElement(TabsTrigger, { value: 'a' }, 'voice and tone'),
					createElement(TabsTrigger, { value: 'b' }, 'Color'),
					createElement(TabsTrigger, { value: 'c' }, createElement('em', null, 'not text')),
				),
			),
		);
		expect([...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Voice and Tone', 'Color', 'not text']);
	});

	it('fill the panel from top to bottom, the strip first and what is under it scrolling', async () => {
		await show();
		const root = document.querySelector('[data-slot="tabs"][data-variant="line"]') as HTMLElement;
		expect(root.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'min-h-0', 'flex-1']));
		// A column: the strip on top, the content filling what is left.
		expect(root.getAttribute('data-orientation')).toBe('horizontal');
		const content = document.querySelector('[data-slot="tabs-content"]') as HTMLElement;
		expect(content.className.split(' ')).toEqual(expect.arrayContaining(['min-h-0', 'flex-1', 'overflow-y-auto', 'p-4']));
		expect(content.textContent).toBe('First');
	});
});
