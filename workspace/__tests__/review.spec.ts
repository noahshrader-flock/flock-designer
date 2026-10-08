// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Review } from '../src/renderer/Review';
import type { MarkerRequest, ReviewComment } from '../src/shared/contract';
import { button, cards, comment, fail, fakeApp, key, menuItem, ok, openMenu, press, render, reviewProps, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * What the review screen does with comments, pinned before its comments are taken out of it (M4 of the Pages plan), and
 * held after: read off the screen and the calls it makes, never off how it is built.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (app: ReturnType<typeof fakeApp>, more = {}) => {
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Review, reviewProps(more) as never));
	return current;
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

const sidebar = async () => {
	await press(button('Show all comments'));
	await settle();
};
/** The pins the screen last asked the page to draw. */
const pins = (app: ReturnType<typeof fakeApp>): MarkerRequest[] => (app.calls.pageShowMarkers?.at(-1)?.[0] as MarkerRequest[]) ?? [];
const cardFor = (text: string) => {
	const c = cards().find((el) => el.textContent?.includes(text));
	if (!c) throw new Error(`no card for ${text}`);
	return c;
};
const choose = async (text: string, item: string) => {
	const items = await openMenu(button('Comment actions', cardFor(text)));
	await press(menuItem(items, item));
	await settle();
};

describe('reading comments', () => {
	it('reads them on opening, numbers them in order, and pins the open ones, movable only for their author', async () => {
		const app = fakeApp({
			readComments: async () => ok([comment(1, 'First'), comment(2, 'Mine', { author: 'noah' }), comment(3, 'Done', { resolved: true })]),
		});
		await open(app);
		expect(app.calls.readComments?.[0]).toEqual(['demo', 'prototype/demo/v1-i1']);
		expect(pins(app).map((p) => [p.id, p.number, p.movable])).toEqual([
			[1, 1, false],
			[2, 2, true],
		]);
		// The count is of open comments; resolved ones stay listed, marked, and keep their number.
		expect(button('Show all comments').textContent).toBe('2');
		await sidebar();
		expect(document.body.textContent).toContain('Comments (2)');
		expect(cards()).toHaveLength(3);
		expect(cardFor('Done').textContent).toContain('Resolved');
		expect(cardFor('Done').textContent).toContain('3');
	});

	it('says so when there are none', async () => {
		await open(fakeApp());
		await sidebar();
		expect(document.body.textContent).toContain('No comments yet');
	});

});

describe('writing a comment', () => {
	it('drops a pin where the page is clicked, opens the box beside it, and saves what is written', async () => {
		const saved: ReviewComment[] = [];
		const app = fakeApp({
			// GitHub's listing trails a new comment: the reads straight after do not have it yet.
			readComments: async () => ok(saved),
			postComment: async (_p: string, _b: string, body: string) => ok(comment(9, body, { author: 'noah' })),
		});
		await open(app);
		await press(button('Comment'));
		await settle();
		expect(app.calls.pagePick).toHaveLength(1);
		await app.click({ selector: '#save' });
		await settle();
		// The pin being placed is drawn at once, before it is saved.
		expect(pins(app).map((p) => p.id)).toEqual([-1]);
		const box = document.querySelector<HTMLTextAreaElement>('#comment-draft');
		expect(box).not.toBeNull();
		expect(button('Save').disabled).toBe(true);
		await typeInto(box as HTMLTextAreaElement, 'Make this primary');
		await press(button('Save'));
		await settle();
		expect(app.calls.postComment?.[0]?.slice(0, 3)).toEqual(['demo', 'prototype/demo/v1-i1', 'Make this primary']);
		expect((app.calls.postComment?.[0]?.[3] as { selector: string }).selector).toBe('#save');
		expect(document.querySelector('#comment-draft')).toBeNull();
		// Kept and shown although the read has not caught up, and comment mode waits for the next click.
		expect(app.calls.pagePick).toHaveLength(2);
		await sidebar();
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Make this primary')]);
	});

	it('backs out of the comment with Escape, pin and all, and leaves comment mode with a second Escape', async () => {
		const app = fakeApp();
		await open(app);
		await key('c');
		await settle();
		await app.click();
		await settle();
		expect(document.querySelector('#comment-draft')).not.toBeNull();
		await key('Escape');
		await settle();
		expect(document.querySelector('#comment-draft')).toBeNull();
		expect(pins(app).map((p) => p.id)).toEqual([]);
		expect(button('Comment').getAttribute('aria-pressed')).toBe('true');
		await key('Escape');
		await settle();
		expect(button('Comment').getAttribute('aria-pressed')).toBe('false');
		expect(app.calls.pageCancelPick).toHaveLength(1);
	});

	it('keeps the box open and says why when saving fails', async () => {
		const app = fakeApp({ postComment: async () => fail('Not signed in') });
		await open(app);
		await press(button('Comment'));
		await settle();
		await app.click();
		await settle();
		await typeInto(document.querySelector('#comment-draft') as HTMLTextAreaElement, 'x');
		await press(button('Save'));
		await settle();
		expect(document.querySelector('#comment-draft')).not.toBeNull();
		expect(document.body.textContent).toContain('Not signed in');
	});
});

describe('resolving and deleting', () => {
	it('resolves a comment at once, taking its pin off the page, and reopens it', async () => {
		let c = comment(1, 'First');
		const app = fakeApp({
			readComments: async () => ok([c]),
			resolveComment: async (_id: number, resolved: boolean) => ok((c = { ...c, resolved })),
		});
		await open(app);
		await sidebar();
		await choose('First', 'Resolve');
		expect(app.calls.resolveComment?.[0]).toEqual([1, true]);
		expect(cardFor('First').textContent).toContain('Resolved');
		expect(pins(app)).toEqual([]);
		await choose('First', 'Reopen');
		expect(app.calls.resolveComment?.[1]).toEqual([1, false]);
		expect(cardFor('First').textContent).not.toContain('Resolved');
	});

	it('does not let a read begun before a change undo it when it lands', async () => {
		const before = comment(1, 'First');
		let c = before;
		let slowRead: ((v: unknown) => void) | null = null;
		let held = false;
		const app = fakeApp({
			// Once held, the first read waits to be answered and any after it never are: the stale one is the only one to land.
			readComments: () => (held ? new Promise((r) => (slowRead ??= r)) : Promise.resolve(ok([c]))),
			resolveComment: async () => ok((c = { ...c, resolved: true })),
		});
		await open(app);
		await sidebar();
		// A read is in flight, from before the change.
		held = true;
		window.dispatchEvent(new Event('focus'));
		await settle(2);
		await choose('First', 'Resolve');
		// It answers as things stood when it began.
		(slowRead as ((v: unknown) => void) | null)?.(ok([before]));
		await settle();
		expect(cardFor('First').textContent).toContain('Resolved');
	});

	it('asks before deleting, and deletes only when told to', async () => {
		let all = [comment(1, 'First'), comment(2, 'Second')];
		const app = fakeApp({
			readComments: async () => ok(all),
			deleteComment: async (id: number) => ok((all = all.filter((c) => c.id !== id)) && null),
		});
		await open(app);
		await sidebar();
		await choose('First', 'Delete');
		expect(document.body.textContent).toContain('Delete this comment for good?');
		await press(button('Keep'));
		await settle();
		expect(app.calls.deleteComment).toBeUndefined();
		await choose('First', 'Delete');
		await press(button('Delete', cardFor('First')));
		await settle();
		expect(app.calls.deleteComment?.[0]).toEqual([1]);
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Second')]);
	});

	it('says why when resolving fails, and leaves the comment as it was', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'First')]), resolveComment: async () => fail('Only its author can') });
		await open(app);
		await sidebar();
		await choose('First', 'Resolve');
		expect(document.body.textContent).toContain('Only its author can');
		expect(cardFor('First').textContent).not.toContain('Resolved');
	});
});

describe('pins and cards', () => {
	it('opens the sidebar on the comment whose pin was clicked', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'First'), comment(2, 'Second')]) });
		await open(app);
		await app.pin({ kind: 'click', id: 2 });
		await settle();
		expect(cards()).toHaveLength(2);
		expect(cardFor('Second').className).toContain('border-primary');
		expect(cardFor('First').className).not.toContain('border-primary');
	});

	it('saves where a pin was dragged to, and draws it from what was saved', async () => {
		let c = comment(2, 'Mine', { author: 'noah' });
		const moved = { ...(c.anchor as NonNullable<ReviewComment['anchor']>), selector: '#elsewhere' };
		const app = fakeApp({ readComments: async () => ok([c]), moveComment: async () => ok((c = { ...c, anchor: moved })) });
		await open(app);
		await app.pin({ kind: 'move', id: 2, anchor: moved });
		await settle();
		expect(app.calls.moveComment?.[0]).toEqual([2, moved]);
		expect(pins(app)[0]?.anchor.selector).toBe('#elsewhere');
	});

	it('focuses the pin of a card that is clicked', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'First')]) });
		await open(app);
		await sidebar();
		await press(cardFor('First'));
		expect(app.calls.pageFocusMarker?.[0]).toEqual([1]);
		expect(cardFor('First').className).toContain('border-primary');
	});

	it('says, on the card, when its element is gone or it was made in another state', async () => {
		const app = fakeApp({
			readComments: async () => ok([comment(1, 'Gone'), comment(2, 'Other')]),
			pageShowMarkers: async () => ok([{ id: 1, state: 'missing' }, { id: 2, state: 'otherState' }]),
		});
		await open(app);
		await sidebar();
		expect(cardFor('Gone').textContent).toContain('no longer on the page');
		expect(cardFor('Other').textContent).toContain('different state');
	});
});

describe('Address', () => {
	it('runs on one comment, and shows it resolved with where the change went', async () => {
		let c = comment(1, 'Remove this');
		const app = fakeApp({
			readComments: async () => ok([c]),
			addressPrototype: async () => ok({ state: 'running', startedAt: 'now' }),
			agentStatus: async () => ok({ state: 'finished', exitCode: 0 }),
			finishPrototypeAddress: async () =>
				ok({ changed: true, iteration: 'v1-i2', made: null, comment: (c = { ...c, resolved: true, addressedAt: 'abc1234def56', addressedIn: 'v1-i2' }) }),
		});
		await open(app);
		await sidebar();
		await choose('Remove this', 'Address');
		// The agent is asked how it is getting on once a second.
		await new Promise((r) => setTimeout(r, 1100));
		await settle();
		expect(app.calls.addressPrototype?.[0]).toEqual(['demo', 'v1-i1', 1]);
		expect(app.calls.finishPrototypeAddress?.[0]).toEqual([1]);
		expect(cardFor('Remove this').textContent).toContain('Resolved');
		expect(cardFor('Remove this').textContent).toContain('The agent addressed this in V1 · I2');
		expect(document.body.textContent).toContain('The change is in V1 · I2');
		expect(pins(app)).toEqual([]);
	});

	it('is not offered without the product repository', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(1, 'Open')]) });
		await open(app, { checkout: null });
		await sidebar();
		expect((await openMenu(button('Comment actions', cardFor('Open')))).map((i) => i.textContent?.trim())).not.toContain('Address');
	});

	it('is not offered on a resolved comment', async () => {
		const app = fakeApp({ readComments: async () => ok([comment(2, 'Done', { resolved: true })]) });
		await open(app);
		await sidebar();
		expect((await openMenu(button('Comment actions', cardFor('Done')))).map((i) => i.textContent?.trim())).toEqual(['Reopen', 'Delete']);
	});
});
