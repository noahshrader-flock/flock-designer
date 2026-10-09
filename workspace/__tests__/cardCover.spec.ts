// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CardCover } from '../src/renderer/CardCover';
import { render, unmountAll } from './reviewHarness';

/**
 * The top of a card, twice as wide as it is tall (1920 by 960; it was 16:9 until 2026-10-09, when it was shortened a
 * little). What a browser makes of a ratio was measured in a real window against the app's built stylesheet (exact at
 * every card width, level across a row); this pins it.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the card cover', () => {
	it('is twice as wide as it is tall, the width of its card', async () => {
		current = await render(createElement(CardCover));
		const cover = document.body.querySelector('[data-slot="card-cover"]');
		expect(cover).not.toBeNull();
		expect(cover!.className.split(' ')).toContain('aspect-[1920/960]');
		expect(cover!.className.split(' ')).toContain('w-full');
	});

	it('is the card’s own colour, with its content spread top to bottom', async () => {
		current = await render(createElement(CardCover, null, createElement('span', null, 'top'), createElement('span', null, 'bottom')));
		const cover = document.body.querySelector('[data-slot="card-cover"]')!;
		expect(cover.textContent).toBe('topbottom');
		const classes = cover.className.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['flex', 'flex-col', 'justify-between']));
		// No colour of its own: the card's shows through.
		expect(classes.filter((c) => /^(bg|text)-/.test(c))).toEqual([]);
		// Its left edge is where the footer's content starts, 18px.
		expect(classes).toContain('pl-4.5');
	});
});
