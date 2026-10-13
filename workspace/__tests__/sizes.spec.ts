// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentLog } from '../src/renderer/Loading';
import { render, unmountAll } from './reviewHarness';
import { windowSources } from './windowSources';

/**
 * Sizes from the scale: text and widths from Tailwind's own and the theme's named ones, never a number of pixels written
 * in a class, so the same size is the same everywhere. What the agent said is one log, in three heights.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('the agent’s log', () => {
	it('comes in three heights, in the theme’s smallest text', async () => {
		const heights: string[] = [];
		for (const size of ['sm', 'md', 'lg'] as const) {
			current = await render(createElement(AgentLog, { lines: ['one', 'two'], size }));
			const log = current.host.querySelector('[aria-live]')!;
			expect(log.className).toContain('text-2xs');
			heights.push(log.className.match(/max-h-\d+/)?.[0] ?? '');
			await unmountAll(current.root);
			current = null;
		}
		expect(new Set(heights).size).toBe(3);
	});
});

describe('every screen', () => {
	it('sizes text, widths and the room for the window’s buttons from the scale or index.css, and stacks by named layers', () => {
		const own = windowSources().flatMap(({ path, text }) =>
			[
				...text.matchAll(/\b(?:text|max-w|min-w|w|max-h|min-h|h|p[lrtbxy]?)-\[\d+px\]|\bz-\[\d+\]|\bz-40\b|100dvh-var\(--nav-height\)|\bbg-white\b/g),
			].map((m) => `${path}: ${m[0]}`),
		);
		expect(own).toEqual([]);
	});

	it('writes what the agent said in one log, not a pre of its own', () => {
		const own = windowSources('Loading.tsx').filter(({ text }) => /<pre\b[^>]*whitespace-pre-wrap/.test(text) && /addressLog|log\.slice/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});
