import { describe, expect, it } from 'vitest';
import { firstInHead } from '../src/shared/html';

/** Markup put first in a page's head, before anything of the page's own: how DSNR's own scripts go into a prototype's page. */
describe('firstInHead', () => {
	it('goes right after the head’s opening tag, whatever its attributes', () => {
		expect(firstInHead('<html><head><title>x</title></head></html>', '<script></script>')).toBe(
			'<html><head><script></script><title>x</title></head></html>',
		);
		expect(firstInHead('<HEAD lang="en"><meta>', '<s>')).toBe('<HEAD lang="en"><s><meta>');
	});

	it('goes first in a page with no head, and only once in a page with a header element', () => {
		expect(firstInHead('<h1>Demo</h1>', '<s>')).toBe('<s><h1>Demo</h1>');
		expect(firstInHead('<header></header><head></head>', '<s>')).toBe('<header></header><head><s></head>');
	});
});

describe('themeLabel', () => {
	it('is the theme’s name as the bar and a card say it', async () => {
		const { themeLabel } = await import('../src/shared/prototypeTheme');
		expect([themeLabel('light'), themeLabel('dark')]).toEqual(['Light', 'Dark']);
	});
});
