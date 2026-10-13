// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentBox } from '../src/renderer/comments/CommentBox';
import { CommentControl } from '../src/renderer/comments/CommentControl';
import { CommentList } from '../src/renderer/comments/CommentList';
import type { CommentStore, PageSurface } from '../src/renderer/comments/surfaces';
import { useComments } from '../src/renderer/comments/useComments';
import type { CommentAnchor, MarkerRequest, PinEvent, ReviewComment } from '../src/shared/contract';
import { button, cards, comment, menuItem, ok, openMenu, press, render, settle, typeInto, unmountAll } from './reviewHarness';
import { anAnchor } from './fixtures';

/**
 * The comments experience on its own, through a store and a page that are not the app's: what a prototype's own page
 * will give it. Nothing here goes near `window.workspace`, which is not there.
 */

const fakes = (initial: ReviewComment[]) => {
	let saved = [...initial];
	const drawn: MarkerRequest[][] = [];
	let pinListener: ((e: PinEvent) => void) | null = null;
	let clicked: ((v: Awaited<ReturnType<PageSurface['pick']>>) => void) | null = null;
	const store: CommentStore = {
		read: async () => ok(saved),
		post: async (body, anchor) => {
			const made = { ...comment(50 + saved.length, body, { author: 'reviewer' }), anchor };
			saved = [...saved, made];
			return ok(made);
		},
		resolve: async ({ id }, resolved) => {
			saved = saved.map((c) => (c.id === id ? { ...c, resolved } : c));
			return ok(saved.find((c) => c.id === id) as ReviewComment);
		},
		remove: async ({ id }) => {
			saved = saved.filter((c) => c.id !== id);
			return ok(null);
		},
		move: async ({ id }, anchor) => ok({ ...(saved.find((c) => c.id === id) as ReviewComment), anchor }),
		viewer: async () => 'reviewer',
		version: async () => 'abc1234',
	};
	const page: PageSurface = {
		pick: () => new Promise((r) => (clicked = r)),
		cancelPick: async () => undefined,
		showMarkers: async (items) => {
			drawn.push(items);
			return ok(items.map((i) => ({ id: i.id, state: 'found' as const })));
		},
		focusMarker: async () => undefined,
		onPinEvent: (l) => {
			pinListener = l;
			return () => void (pinListener = null);
		},
	};
	return {
		store,
		page,
		drawn,
		pin: (e: PinEvent) => pinListener?.(e),
		click: (anchor: Partial<CommentAnchor> = {}) =>
			clicked?.(
				ok({
					anchor: anAnchor({ selector: '#hero', nearbyText: 'Hero', ...anchor }),
					at: { x: 5, y: 5 },
					box: null,
					picture: null,
				}),
			),
	};
};

/** The smallest host there is: a page, the parts, and nothing of the app. */
const Host = ({ store, page }: { store: CommentStore; page: PageSurface }) => {
	const [error, setError] = useState<string | null>(null);
	const [listOpen, setListOpen] = useState(true);
	const comments = useComments({ store, page, opened: true, route: '/', setError });
	return createElement(
		'div',
		null,
		createElement(CommentControl, { comments, listOpen, onToggleList: () => setListOpen((o) => !o), disabled: false }),
		error && createElement('p', { role: 'alert' }, error),
		listOpen && createElement(CommentList, { comments }),
		comments.composing && createElement(CommentBox, { comments, origin: { top: 0, left: 0 }, error }),
	);
};

let current: Awaited<ReturnType<typeof render>> | null = null;
const mount = async (f: ReturnType<typeof fakes>) => {
	(window as unknown as { workspace: unknown }).workspace = undefined;
	current = await render(createElement(Host, { store: f.store, page: f.page }));
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('the comments experience, through another store and page', () => {
	it('lists what the store has, and pins the open ones on the page', async () => {
		const f = fakes([comment(1, 'First'), comment(2, 'Done', { resolved: true })]);
		await mount(f);
		expect(cards()).toHaveLength(2);
		expect(f.drawn.at(-1)?.map((p) => p.id)).toEqual([1]);
	});

	it('leaves a comment where the page was clicked, stamped with what the work is at', async () => {
		const f = fakes([]);
		await mount(f);
		await press(button('Comment'));
		await settle();
		f.click({ selector: '#cta' });
		await settle();
		await typeInto(document.querySelector('#comment-draft') as HTMLTextAreaElement, 'Bigger');
		await press(button('Save'));
		await settle();
		const made = cards().map((c) => c.textContent);
		expect(made).toEqual([expect.stringContaining('Bigger')]);
		const saved = (await f.store.read()) as { value: ReviewComment[] };
		expect(saved.value[0]?.anchor).toMatchObject({ selector: '#cta', commit: 'abc1234' });
	});

	it('resolves through the store, and takes the pin off the page', async () => {
		const f = fakes([comment(1, 'First')]);
		await mount(f);
		await press(menuItem(await openMenu(button('Comment actions')), 'Resolve'));
		await settle();
		expect(cards()[0]?.textContent).toContain('Resolved');
		expect(f.drawn.at(-1)).toEqual([]);
	});

	it('selects the comment whose pin was clicked', async () => {
		const f = fakes([comment(1, 'First'), comment(2, 'Second')]);
		await mount(f);
		f.pin({ kind: 'click', id: 2 });
		await settle();
		expect(cards()[1]?.className).toContain('border-primary');
	});

	it("offers no Address: that is the app's, and only when it adds it", async () => {
		const f = fakes([comment(1, 'First')]);
		await mount(f);
		expect((await openMenu(button('Comment actions'))).map((i) => i.textContent?.trim())).toEqual(['Resolve', 'Delete']);
	});
});
