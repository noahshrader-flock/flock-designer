// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CardGrid } from '../src/renderer/CardGrid';
import { render, unmountAll } from './reviewHarness';

/**
 * The responsive card grid: columns by the width of the space it has. What a browser makes of these classes was
 * measured in a real window against the app's built stylesheet (1, 2, 3, 4 and 5 columns); this pins the contract.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the card grid', () => {
	it('holds its cards in one grid, in order, inside a container it measures itself against', async () => {
		current = await render(createElement(CardGrid, null, createElement('p', null, 'one'), createElement('p', null, 'two')));
		const grid = document.querySelector('p')!.parentElement!;
		expect([...grid.children].map((c) => c.textContent)).toEqual(['one', 'two']);
		expect(grid.parentElement!.className).toBe('@container');
	});

	it('is one column, then two, three, four and five as the space grows', async () => {
		current = await render(createElement(CardGrid, null, createElement('p', null, 'one')));
		const classes = document.querySelector('p')!.parentElement!.className.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['grid', 'grid-cols-1', '@3xl:grid-cols-2', '@5xl:grid-cols-3', '@min-[84rem]:grid-cols-4', '@min-[104rem]:grid-cols-5']));
	});

	it('keeps 1.5 rem between cards, the same in the Projects grid and the Design System’s, since both are this', async () => {
		current = await render(createElement(CardGrid, null, createElement('p', null, 'one')));
		const classes = document.querySelector('p')!.parentElement!.className.split(' ');
		expect(classes).toContain('gap-6');
		expect(classes).not.toContain('gap-4');
	});
});
