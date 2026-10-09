// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Projects } from '../src/renderer/Projects';
import { Review } from '../src/renderer/Review';
import { Viewer } from '../src/viewer/Viewer';
import type { Project } from '../src/shared/contract';
import { PAGE_CONFIG, sitePage } from './pageHarness';
import { fakeApp, ok, render, reviewProps, settle, unmountAll } from './reviewHarness';

/**
 * The top bar's controls are all one size: the search field is the normal height, so the buttons and dropdowns beside it
 * are too, on the Projects screen, on a prototype's review screen, and on its published page. A control made small is
 * what makes a row look uneven.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

/** The controls in the top bar: its buttons, links and dropdowns (each says its size, even under a tooltip) and its search. */
const controls = (): HTMLElement[] =>
	[...document.querySelectorAll<HTMLElement>('[class*="h-(--toolbar-height)"] :is(button, a)[data-size], [class*="h-(--toolbar-height)"] [data-slot="input-group"]')];
const size = (el: HTMLElement) => (el.getAttribute('data-slot') === 'input-group' ? 'normal' : el.getAttribute('data-size'));

describe('the top bar', () => {
	it('has controls of one size on the Projects screen', async () => {
		const project = { id: 'alpha', title: 'Alpha', records: [], iterations: [], people: [], openComments: 0 } as unknown as Project;
		const app = fakeApp({ listProjects: async () => ok([project]), lastCheckout: async () => ok(null), suggestCheckout: async () => ok(null), publishStatus: async () => ok({ state: 'unavailable' }) });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(Projects, { hidden: false }));
		await settle();
		// The search, the sort, Sync and New.
		expect(controls().length).toBeGreaterThanOrEqual(4);
		expect(controls().map(size)).toEqual(controls().map(() => expect.stringMatching(/^(normal|default)$/)));
	});

	it('has controls of one size on a prototype’s review screen', async () => {
		const app = fakeApp({ publishedPage: async () => ok({ state: 'published', url: 'https://x.test/' }) });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(Review, reviewProps() as never));
		// Open page, the iteration switcher, Comment and its count, and More.
		expect(controls().length).toBeGreaterThanOrEqual(5);
		expect(controls().map(size)).toEqual(controls().map(() => expect.stringMatching(/^(default|icon)$/)));
	});

	it('has controls of one size on a published page, beside the switcher', async () => {
		const page = sitePage();
		current = await render(createElement(Viewer, { config: PAGE_CONFIG, slots: page.slots }));
		// The way back, the switcher, and Sign in to comment.
		expect(controls().length).toBeGreaterThanOrEqual(3);
		expect(controls().map(size)).toEqual(controls().map(() => expect.stringMatching(/^(default|icon)$/)));
	});
});
