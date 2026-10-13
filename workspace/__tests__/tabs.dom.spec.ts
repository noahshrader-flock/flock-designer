import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/renderer/ui/tabs';
import { render, tab, unmountAll } from './reviewHarness';

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

const show = async () => {
	current = await render(
		createElement(
			Tabs,
			{ variant: 'line', defaultValue: 'a' },
			createElement(TabsList, null, createElement(TabsTrigger, { value: 'a' }, 'One'), createElement(TabsTrigger, { value: 'b' }, 'Two')),
			createElement(TabsContent, { value: 'a' }, 'First'),
		),
	);
};

describe('line tabs', () => {
	it('are one strip, the same everywhere: edge to edge on its border, as tall as a toolbar, inset as the page is, on its own background', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		const classes = list.className.split(' ');
		expect(list.getAttribute('data-variant')).toBe('line');
		expect(classes).toEqual(
			expect.arrayContaining([
				'min-w-full',
				'border-b',
				'bg-card',
				'px-(--tabs-inset,var(--page-padding))',
				'group-data-horizontal/tabs:h-(--toolbar-height)',
			]),
		);
		// Not the size of a button, which a row of buttons beside plain tabs is.
		expect(classes).not.toContain('group-data-horizontal/tabs:h-8');
		// The padding is the content's, under it: none around the strip but its inset.
		expect(list.closest('[data-slot="tabs"][data-variant="line"]')?.className).not.toMatch(/(^|\s)p[xtblr]?-\d/);
	});

	it('size each tab to its label, at the left, not to a share of the strip: said by the tab itself, so nothing is set on the tabs here', async () => {
		await show();
		for (const t of document.querySelectorAll<HTMLElement>('[role="tab"]')) {
			expect(t.className.split(' ')).toContain('group-data-[variant=line]/tabs-list:flex-none');
		}
		expect(document.querySelector('[data-slot="tabs-list"]')?.className.split(' ')).toContain('justify-start');
	});

	it('scroll sideways, from the first tab, when there are more than fit: the strip is as wide as its tabs in a box that scrolls it', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		const box = list.parentElement as HTMLElement;
		// At least its box and as wide as its tabs: a strip that is the box's width would spill its tabs out of reach.
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['w-max', 'min-w-full']));
		expect(box.getAttribute('data-slot')).toBe('tabs-scroll');
		expect(box.className.split(' ')).toContain('overflow-x-auto');
		// Room below the strip for a tab's underline, which is drawn over its border, with the layout unmoved.
		expect(box.className.split(' ')).toEqual(expect.arrayContaining(['pb-px', '-mb-px']));
	});

	it('bring a tab into view when it is focused, by a click or a key, and still tell whoever asked', async () => {
		const scrolled: ScrollIntoViewOptions[] = [];
		const original = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => void scrolled.push(options as ScrollIntoViewOptions);
		let heard = 0;
		try {
			current = await render(
				createElement(
					Tabs,
					{ variant: 'line', defaultValue: 'a' },
					createElement(
						TabsList,
						null,
						createElement(TabsTrigger, { value: 'a' }, 'One'),
						createElement(TabsTrigger, { value: 'b', onFocus: () => void heard++ }, 'Two'),
					),
				),
			);
			await act(async () => void (tab('Two') as HTMLElement).focus());
			expect(scrolled).toEqual([{ inline: 'nearest', block: 'nearest' }]);
			expect(heard).toBe(1);
		} finally {
			Element.prototype.scrollIntoView = original;
		}
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

	it('show each tab’s label as it is given: how it is cased is said by whoever names the tab (uiDrift.spec)', async () => {
		current = await render(
			createElement(
				Tabs,
				{ variant: 'line', defaultValue: 'a' },
				createElement(
					TabsList,
					null,
					createElement(TabsTrigger, { value: 'a' }, 'Voice and Tone'),
					createElement(TabsTrigger, { value: 'b' }, 'gRPC'),
				),
			),
		);
		expect([...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Voice and Tone', 'gRPC']);
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
