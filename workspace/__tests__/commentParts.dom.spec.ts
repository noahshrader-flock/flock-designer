import { createElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentBox } from '../src/viewer/comments/CommentBox';
import { CommentControl } from '../src/viewer/comments/CommentControl';
import { CommentList } from '../src/viewer/comments/CommentList';
import { GeneralComment } from '../src/viewer/comments/GeneralComment';
import type { CommentStore, PageSurface } from '../src/viewer/comments/surfaces';
import { useComments } from '../src/viewer/comments/useComments';
import type { CommentAnchor, MarkerRequest, PinEvent, ReviewComment } from '../src/shared/contract';
import { cards, comment, ok } from './reviewHarness';
import { anAnchor } from './fixtures';
import { button, fieldNamed, key, menuItem, openMenu, press, render, settle, type, unmountAll } from './ui';

/** Through a store and a page that are not the app's; nothing here goes near `window.workspace`, which is not there. */

const card = (text: string) => cards().find((c) => c.textContent?.includes(text)) as HTMLElement;

const fakes = (initial: ReviewComment[]) => {
	let saved = [...initial];
	const drawn: MarkerRequest[][] = [];
	const focused: number[] = [];
	let pinListener: ((e: PinEvent) => void) | null = null;
	let clicked: ((v: Awaited<ReturnType<PageSurface['pick']>>) => void) | null = null;
	const store: CommentStore = {
		read: async () => ok(saved),
		post: async (body, anchor) => {
			const made = { ...comment(50 + saved.length, body, { author: 'reviewer', createdAt: '2026-10-09T00:00:00Z' }), anchor };
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
		page: 'abc123def456',
	};
	const page: PageSurface = {
		pick: () => new Promise((r) => (clicked = r)),
		cancelPick: async () => undefined,
		showMarkers: async (items) => {
			drawn.push(items);
			return ok(items.map((i) => ({ id: i.id, state: 'found' as const })));
		},
		focusMarker: async (id) => void focused.push(id),
		onPinEvent: (l) => {
			pinListener = l;
			return () => void (pinListener = null);
		},
	};
	return {
		store,
		page,
		drawn,
		focused,
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
		listOpen && createElement(GeneralComment, { comments }),
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
		await type(fieldNamed('Comment'), 'Bigger');
		await press(button('Save'));
		await settle();
		const made = cards().map((c) => c.textContent);
		expect(made).toEqual([expect.stringContaining('Bigger')]);
		const saved = (await f.store.read()) as { value: ReviewComment[] };
		expect(saved.value[0]?.anchor).toMatchObject({ selector: '#cta', page: 'abc123def456' });
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
		expect(card('Second').hasAttribute('data-selected')).toBe(true);
		expect(card('First').hasAttribute('data-selected')).toBe(false);
	});

	it('is chosen by pressing anywhere on its card, which shows its pin; but not by its menu', async () => {
		const f = fakes([comment(1, 'First', { author: 'noah' }), comment(2, 'Second', { author: 'pat' })]);
		await mount(f);
		await press(card('Second').querySelector('.comment-author') as HTMLElement);
		expect(card('Second').hasAttribute('data-selected')).toBe(true);
		expect(f.focused).toEqual([2]);
		await press(button('Comment actions', card('First')));
		expect(f.focused).toEqual([2]);
		expect(card('First').hasAttribute('data-selected')).toBe(false);
		// The stylesheet tints this on hover.
		expect(card('First').hasAttribute('data-choosable')).toBe(true);
	});

	it('cannot be chosen once it is resolved, has no pin on the page, or the page has no place for it', async () => {
		const f = fakes([comment(1, 'Done', { resolved: true }), comment(2, 'Page-wide', { anchor: null })]);
		await mount(f);
		for (const each of cards()) {
			expect(each.hasAttribute('data-choosable')).toBe(false);
			expect(each.querySelector('button.comment-body')).toBeNull();
			await press(each.querySelector('.comment-author') as HTMLElement);
		}
		expect(f.focused).toEqual([]);
		expect(cards().every((c) => !c.hasAttribute('data-selected'))).toBe(true);
	});

	it('lists the newest at the top, each keeping the number it was made with', async () => {
		const f = fakes([comment(1, 'Oldest'), comment(3, 'Newest'), comment(2, 'Middle')]);
		await mount(f);
		expect(cards().map((c) => c.textContent?.match(/Oldest|Middle|Newest/)?.[0])).toEqual(['Newest', 'Middle', 'Oldest']);
	});

	it('takes a comment on the whole page from the box at its foot: no pin, sent with Enter, at the top once it is in', async () => {
		const f = fakes([comment(1, 'On the button')]);
		await mount(f);
		const box = document.querySelector('#general-comment') as HTMLTextAreaElement;
		expect(button('Send').hasAttribute('disabled')).toBe(true);
		await type(box, 'The spacing feels tight overall');
		await key('Enter', { on: box, shiftKey: true });
		expect(((await f.store.read()) as { value: ReviewComment[] }).value).toHaveLength(1);
		await key('Enter', { on: box });
		await settle();
		const saved = ((await f.store.read()) as { value: ReviewComment[] }).value;
		expect(saved.at(-1)).toMatchObject({ body: 'The spacing feels tight overall', anchor: null });
		expect(cards()[0]?.textContent).toContain('The spacing feels tight overall');
		expect(box.value).toBe('');
		expect(f.drawn.at(-1)?.map((p) => p.id)).toEqual([1]);
	});

	it('keeps what was written when it could not be sent, and says why', async () => {
		const f = fakes([]);
		f.store.post = async () => ({ ok: false, error: 'GitHub could not be reached.' });
		await mount(f);
		const box = document.querySelector('#general-comment') as HTMLTextAreaElement;
		await type(box, 'Still here');
		await press(button('Send'));
		await settle();
		expect(box.value).toBe('Still here');
		expect(document.querySelector('[role="alert"]')?.textContent).toBe('GitHub could not be reached.');
	});

	it("offers no Address: that is the app's, and only when it adds it", async () => {
		const f = fakes([comment(1, 'First')]);
		await mount(f);
		expect((await openMenu(button('Comment actions'))).map((i) => i.textContent?.trim())).toEqual(['Resolve', 'Delete']);
	});
});
