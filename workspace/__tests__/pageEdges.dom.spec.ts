import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Page } from '../src/renderer/Page';
import { Toolbar } from '../src/renderer/Toolbar';
import { render, unmountAll } from './reviewHarness';

/**
 * A screen's content and its toolbar's content sit the same distance from the window's edges, because both read one
 * distance, `--page-padding`, so the toolbar's name and buttons line up with the cards under it.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the edges of a screen', () => {
	it('is one distance, defined once', () => {
		const css = readFileSync(join(__dirname, '..', 'src', 'renderer', 'index.css'), 'utf8');
		expect(css.match(/--page-padding:/g)).toHaveLength(1);
	});

	it('is the page’s padding on every side, wide or not', async () => {
		current = await render(createElement(Page, { wide: true, children: createElement('p', null, 'x') }));
		expect(document.querySelector('p')!.parentElement!.className.split(' ')).toContain('p-(--page-padding)');
		await unmountAll(current.root);
		current = await render(createElement(Page, null, createElement('p', null, 'x')));
		expect(document.querySelector('p')!.parentElement!.className.split(' ')).toContain('p-(--page-padding)');
	});

	it('is the toolbar’s padding at its left and right, the same distance', async () => {
		current = await render(createElement(Toolbar, null, createElement('p', null, 'x')));
		const classes = document.querySelector('p')!.parentElement!.className.split(' ');
		expect(classes).toContain('px-(--page-padding)');
		expect(classes.some((c) => /^p[xlr]-(4|6)$/.test(c))).toBe(false);
	});

	it('is not capped on a wide page, and is on a page of text', async () => {
		current = await render(createElement(Page, { wide: true, children: createElement('p', null, 'x') }));
		expect(document.querySelector('p')!.parentElement!.className).not.toContain('max-w');
		await unmountAll(current.root);
		current = await render(createElement(Page, null, createElement('p', null, 'x')));
		expect(document.querySelector('p')!.parentElement!.className).toContain('max-w-page');
	});
});

describe('the room an alert keeps for its action', () => {
	it('fits a normal-size "Try again" with a clear gap: 112px, not the 72px that fits a word like "Enable"', () => {
		const alert = readFileSync(join(__dirname, '..', 'src', 'renderer', 'ui', 'alert.tsx'), 'utf8');
		expect(alert).toContain('has-data-[slot=alert-action]:pr-28');
		expect(alert).not.toContain('has-data-[slot=alert-action]:pr-18');
	});
});
