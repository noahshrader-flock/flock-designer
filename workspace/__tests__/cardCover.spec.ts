// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CardCover } from '../src/renderer/CardCover';
import { render, unmountAll } from './reviewHarness';

/**
 * The top of a card, in the ratio of a 1920 by 1080 screen. What a browser makes of the ratio was measured in a real
 * window against the app's built stylesheet (exactly 16:9 at every card width, level across a row); this pins it.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the card cover', () => {
	it('is the ratio of a 1920 by 1080 screen, the width of its card', async () => {
		current = await render(createElement(CardCover));
		const cover = document.body.querySelector('.aspect-\\[1920\\/1080\\]');
		expect(cover).not.toBeNull();
		expect(cover!.className.split(' ')).toContain('w-full');
	});

	it('is the card’s own colour, with its content spread top to bottom', async () => {
		current = await render(createElement(CardCover, null, createElement('span', null, 'top'), createElement('span', null, 'bottom')));
		const cover = document.body.querySelector('.aspect-\\[1920\\/1080\\]')!;
		expect(cover.textContent).toBe('topbottom');
		const classes = cover.className.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['flex', 'flex-col', 'justify-between']));
		// No colour of its own: the card's shows through.
		expect(classes.filter((c) => /^(bg|text)-/.test(c))).toEqual([]);
		// Its left edge is where a footer's icons start: the footer's 8px and a button's 10px, 18px.
		expect(classes).toContain('pl-4.5');
	});
});
