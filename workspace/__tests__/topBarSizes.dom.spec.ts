import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentControl } from '../src/renderer/comments/CommentControl';
import { Viewer } from '../src/viewer/Viewer';
import { PAGE_CONFIG, sitePage } from './pageHarness';
import { render, settle, stateMenu, unmountAll } from './reviewHarness';

/**
 * The controls in a prototype's page bar are all one size, the small one: it is a quiet bar over a prototype, so it takes
 * little room, and a control of another size is what makes a row look uneven.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

/** The controls in the top bar: its buttons, links and dropdowns (each says its size, even under a tooltip) and its search. */
const controls = (): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>(
		'[class*="h-(--toolbar-height)"] :is(button, a)[data-size], [class*="h-(--toolbar-height)"] [data-slot="input-group"]',
	),
];
const size = (el: HTMLElement) => (el.getAttribute('data-slot') === 'input-group' ? 'normal' : el.getAttribute('data-size'));

describe('the top bar', () => {
	it('has controls of one small size on a published page: it is a quiet bar over a prototype, so it takes little room', async () => {
		const page = sitePage();
		current = await render(createElement(Viewer, { config: { ...PAGE_CONFIG, states: ['default', 'panel'] }, slots: page.slots }));
		await settle();
		// The way back, the version, the states, the history, light and dark, and Sign in to comment.
		expect(controls().length).toBeGreaterThanOrEqual(7);
		expect(controls().map(size)).toEqual(controls().map(() => expect.stringMatching(/^(sm|icon-sm)$/)));
		expect(controls().includes(stateMenu() as HTMLElement)).toBe(true);
		expect([...document.querySelectorAll<HTMLElement>('[aria-label="Theme"] [data-slot="toggle-group-item"]')].map(size)).toEqual(['sm', 'sm']);
	});

	it('has a Comment control that takes the bar’s size, both halves, and the normal one without it', async () => {
		const comments = { commentMode: false, toggleCommentMode: () => undefined, total: 3 } as never;
		const onToggleList = () => undefined;
		current = await render(createElement(CommentControl, { comments, listOpen: false, onToggleList, disabled: false, size: 'sm' }));
		expect([...document.querySelectorAll('button')].map(size)).toEqual(['sm', 'sm']);
		await unmountAll(current.root);
		current = await render(createElement(CommentControl, { comments, listOpen: false, onToggleList, disabled: false }));
		expect([...document.querySelectorAll('button')].map(size)).toEqual(['default', 'default']);
	});
});
