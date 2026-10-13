// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeading } from '../src/renderer/PageHeading';
import { render, unmountAll } from './reviewHarness';
import { windowSources } from './windowSources';

/**
 * A view's heading, the same on Components, Primitives and Voice and Tone: its title, a line under it that says what it is
 * for, and, at the right, what can be done to the whole page. What it says is general: what a design system's view is, not
 * whose.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('a heading', () => {
	it('is the title as a section heading, the line under it muted, and no action unless there is one', async () => {
		current = await render(createElement(PageHeading, { title: 'Primitives', children: 'What it is for.' }));
		const heading = document.querySelector('[data-page-heading]') as HTMLElement;
		expect(heading.querySelector('h2')?.className.split(' ')).toEqual(expect.arrayContaining(['text-base', 'font-semibold']));
		expect(heading.querySelector('p')?.className).toContain('text-muted-foreground');
		expect(heading.querySelector('[data-page-heading-action]')).toBeNull();
	});

	it('has its action at the right, apart from the words', async () => {
		current = await render(createElement(PageHeading, { title: 'T', action: createElement('button', null, 'Refresh'), children: 'Line.' }));
		const action = document.querySelector('[data-page-heading-action]') as HTMLElement;
		expect(action.textContent).toBe('Refresh');
		expect(action.previousElementSibling?.querySelector('h2')?.textContent).toBe('T');
	});
});

describe('what the window says', () => {
	it('names no company: it is for any design system, so what it says is not about one', () => {
		// Code, not comments: a comment may say whose design system it was first made against.
		const said = windowSources().flatMap(({ path, text }) =>
			text
				.split('\n')
				.filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && /Flock/.test(line))
				.map((line) => `${path}: ${line.trim().slice(0, 80)}`),
		);
		expect(said).toEqual([]);
	});

	it('is one heading, for every view that has one: none builds its own title and line', () => {
		const own = windowSources('PageHeading.tsx').filter(({ text }) =>
			/<h2 className="text-base font-semibold">(Components|Primitives|Voice and Tone)</.test(text),
		);
		expect(own.map((f) => f.path)).toEqual([]);
	});
});
