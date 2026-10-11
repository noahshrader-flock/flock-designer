// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CardCover } from '../src/renderer/CardCover';
import { render, unmountAll } from './reviewHarness';

/**
 * The top of a card, where its picture goes: twice as wide as it is tall (1920 by 960; it was 16:9 until 2026-10-09, when it
 * was shortened a little), the same on every card, a component's and a project's. What a browser makes of a ratio was
 * measured in a real window against the app's built stylesheet (exact at every card width, level across a row); this pins it.
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

	it('is edge to edge, with no padding and no layout of its own: what is in it fills it, as a picture does', async () => {
		current = await render(createElement(CardCover, null, createElement('span', null, 'a picture')));
		const cover = document.body.querySelector('[data-slot="card-cover"]')!;
		expect(cover.textContent).toBe('a picture');
		const classes = cover.className.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['relative', 'overflow-hidden']));
		expect(classes.filter((c) => /^(p[xytblr]?-|flex|justify-|items-|bg-|text-)/.test(c))).toEqual([]);
		// It runs through the card's gap to the footer.
		expect(classes).toContain('mb-[calc(var(--card-spacing)*-1)]');
	});
});
