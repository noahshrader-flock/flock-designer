// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListRow, RowList } from '../src/renderer/ListRow';
import { RowsSkeleton } from '../src/renderer/Skeletons';
import { press, render, unmountAll } from './reviewHarness';

/**
 * A list of rows, the other way to see what a grid of cards shows: each row is its picture reduced at the left, a name with
 * a line under it, something at the right, and a mark that it opens. The same piece for components and for projects.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const row = (more: Record<string, unknown> = {}) =>
	createElement(RowList, null, createElement(ListRow, { data: { 'data-row': 'a' }, name: 'FSButton', picture: undefined, drawing: false, onOpen: vi.fn(), ...more }));
const button = () => document.querySelector<HTMLElement>('[data-row] button')!;

describe('RowList', () => {
	it('is one box with a line between its rows, the same box the list shows while it loads', async () => {
		current = await render(row());
		const list = document.querySelector('ul')!;
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['bg-card', 'divide-y', 'rounded-lg', 'border']));
		await unmountAll(current.root);
		current = await render(createElement(RowsSkeleton));
		expect(document.querySelector('ul')!.className).toBe(list.className);
	});
});

describe('ListRow', () => {
	it('is an item of its list, carrying the attributes that say what it is, with the button inside', async () => {
		current = await render(row());
		const item = document.querySelector('ul > li')!;
		expect(item.getAttribute('data-row')).toBe('a');
		expect(item.children).toHaveLength(1);
		expect(item.firstElementChild!.tagName).toBe('BUTTON');
	});

	it('is one button for the whole row, named by what it holds, with the name, and a line under it when there is one', async () => {
		current = await render(row({ detail: createElement('span', null, 'Buttons allow users to act') }));
		expect(button().textContent).toBe('FSButtonButtons allow users to act');
		expect(button().className.split(' ')).toEqual(expect.arrayContaining(['flex', 'w-full', 'items-center', 'gap-4', 'px-4', 'py-3', 'text-left']));
		const [name, detail] = [...button().querySelectorAll('span.flex-col > *')];
		expect(name!.className.split(' ')).toEqual(expect.arrayContaining(['text-sm', 'font-medium']));
		expect(detail!.textContent).toBe('Buttons allow users to act');
	});

	it('has no line under the name when there is none', async () => {
		current = await render(row());
		expect(button().querySelectorAll('span.flex-col > *')).toHaveLength(1);
	});

	it('has the picture reduced at its left, the cover’s shape, 40 pixels high, with the placeholder or the picture in it', async () => {
		current = await render(row({ picture: 'http://127.0.0.1:1/p.jpg' }));
		const thumb = button().firstElementChild!;
		expect(thumb.hasAttribute('data-thumbnail')).toBe(true);
		expect(thumb.className.split(' ')).toEqual(expect.arrayContaining(['h-10', 'shrink-0', 'overflow-hidden', 'rounded-md', 'border', 'aspect-[1920/960]']));
		expect(thumb.querySelector('img')!.getAttribute('src')).toBe('http://127.0.0.1:1/p.jpg');
		await unmountAll(current.root);
		current = await render(row({ drawing: true }));
		expect(document.querySelector('[data-thumbnail] [data-picture-waiting]')).not.toBeNull();
	});

	it('has what it is given at the right of the text, before the mark that it opens', async () => {
		current = await render(row({ aside: createElement('span', { 'data-aside': '' }, '2 versions') }));
		const kind = (k: Element) => (k.hasAttribute('data-thumbnail') ? 'thumbnail' : k.hasAttribute('data-aside') ? 'aside' : k.tagName.toLowerCase());
		const kids = [...button().children];
		expect(kids.map(kind)).toEqual(['thumbnail', 'span', 'aside', 'svg']);
		expect(kids.at(-1)!.getAttribute('class')).toContain('lucide-chevron-right');
	});

	it('marks that it leaves the app with the external-link icon, where it would otherwise be a chevron', async () => {
		current = await render(row({ external: true }));
		expect(button().querySelector('.lucide-external-link')).not.toBeNull();
		expect(button().querySelector('.lucide-chevron-right')).toBeNull();
	});

	it('opens when pressed', async () => {
		const onOpen = vi.fn();
		current = await render(row({ onOpen }));
		await press(button());
		expect(onOpen).toHaveBeenCalledOnce();
	});

	it('is a way to nothing when there is nothing to open: the button is off, and says so with no chevron', async () => {
		const onOpen = vi.fn();
		current = await render(row({ onOpen: null }));
		expect(button().hasAttribute('disabled')).toBe(true);
		expect(button().querySelector('.lucide-chevron-right')).toBeNull();
		await press(button());
		expect(onOpen).not.toHaveBeenCalled();
	});

	it('names what it opens for a screen reader when it is given a label, as a card does', async () => {
		current = await render(row({ label: 'Open Admin usage' }));
		expect(button().getAttribute('aria-label')).toBe('Open Admin usage');
	});
});

describe('RowsSkeleton', () => {
	it('is, with thumbnails, a row of the same size as a real one: the picture’s shape at the left, then two lines', async () => {
		current = await render(createElement(RowsSkeleton, { thumbnails: true, count: 2 }));
		const rows = document.querySelectorAll('ul > li');
		expect(rows).toHaveLength(2);
		const thumb = rows[0]!.querySelector('[data-thumbnail-skeleton]')!;
		expect(thumb.className.split(' ')).toEqual(expect.arrayContaining(['h-10', 'shrink-0', 'aspect-[1920/960]']));
		// The layout of a real row, so the two are the same height.
		expect(rows[0]!.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center', 'gap-4', 'px-4', 'py-3']));
		await unmountAll(current.root);
		current = await render(row());
		expect(button().className.split(' ')).toEqual(expect.arrayContaining(rows[0]!.className.split(' ')));
	});

	it('is, without them, as it was for the lists that have no picture', async () => {
		current = await render(createElement(RowsSkeleton, { count: 2 }));
		expect(document.querySelector('[data-thumbnail-skeleton]')).toBeNull();
	});
});
