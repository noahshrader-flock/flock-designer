import { describe, expect, it } from 'vitest';
import { forgetPosted, markersFor, mergeComments, numberComments, openComments, resolvedComments, sameComments } from '../src/shared/comments';
import type { CommentAnchor, ReviewComment } from '../src/shared/contract';
import { anAnchor, reviewComment } from './fixtures';

const c = (id: number, over: Partial<ReviewComment> = {}): ReviewComment =>
	reviewComment({ id, author: 'a', body: `c${id}`, createdAt: `2026-10-05T10:${String(id).padStart(2, '0')}:00Z`, ...over });

describe('mergeComments', () => {
	it('shows a comment just posted from this window until the read includes it', () => {
		expect(mergeComments([c(1)], [c(2)]).map((x) => x.id)).toEqual([1, 2]);
	});

	it('does not duplicate a comment that is in both', () => {
		expect(mergeComments([c(1), c(2)], [c(2)]).map((x) => x.id)).toEqual([1, 2]);
	});

	it('prefers what GitHub returned over an older local copy, so a newer resolve is not undone', () => {
		const merged = mergeComments([c(2, { resolved: true })], [c(2, { resolved: false })]);
		expect(merged).toHaveLength(1);
		expect(merged[0]?.resolved).toBe(true);
	});

	it('keeps comments in the order they were made, whatever order they arrive in', () => {
		expect(mergeComments([c(3), c(1)], [c(2)]).map((x) => x.id)).toEqual([1, 2, 3]);
	});

	it('picks up a comment someone else made since the last read', () => {
		const before = mergeComments([c(1)], []);
		const after = mergeComments([c(1), c(2, { author: 'pm' })], []);
		expect(after.map((x) => x.id)).toEqual([1, 2]);
		expect(before.map((x) => x.id)).toEqual([1]);
	});
});

describe('sameComments', () => {
	it('is true for the same comments, so a refresh that found nothing new changes nothing', () => {
		expect(sameComments([c(1), c(2)], [c(1), c(2)])).toBe(true);
	});

	it.each([
		['one more', [c(1), c(2), c(3)]],
		['one fewer', [c(1)]],
		['one resolved', [c(1), c(2, { resolved: true })]],
		['one edited', [c(1), c(2, { body: 'changed' })]],
		['a pin moved', [c(1), c(2, { anchor: anAnchor({ route: '/a', selector: 'x' }) })]],
		['a picture added', [c(1), c(2, { picture: 'data:image/jpeg;base64,AA' })]],
	])('is false when there is %s', (_label, next) => {
		expect(sameComments([c(1), c(2)], next)).toBe(false);
	});

	it('is false before anything has been read', () => {
		expect(sameComments(null, [])).toBe(false);
	});
});

describe('markersFor', () => {
	const at = (route = '/users'): CommentAnchor => anAnchor({ route });
	const pinned = (id: number, over: Partial<ReviewComment> = {}) => c(id, { anchor: at(), ...over });
	const numbers = (list: ReviewComment[]) => numberComments(list);

	it('draws a pin for each open comment that points at the page', () => {
		const list = [pinned(1), pinned(2)];
		expect(markersFor(list, numbers(list), 'a', null).map((m) => m.id)).toEqual([1, 2]);
	});

	it('leaves out a resolved comment and one that points at nothing', () => {
		const list = [pinned(1, { resolved: true }), pinned(2), c(3)];
		expect(markersFor(list, numbers(list), 'a', null).map((m) => m.id)).toEqual([2]);
	});

	it("only the viewer's own pins can be dragged", () => {
		const list = [pinned(1, { author: 'me' }), pinned(2, { author: 'someone else' })];
		const [mine, theirs] = markersFor(list, numbers(list), 'me', null);
		expect(mine?.movable).toBe(true);
		expect(theirs?.movable).toBe(false);
	});

	it('draws the pin being placed while its comment is being written', () => {
		const list = [pinned(1)];
		const items = markersFor(list, numbers(list), 'a', { anchor: at(), composing: true });
		expect(items.map((m) => m.id)).toEqual([1, -1]);
		expect(items.at(-1)).toMatchObject({ number: 2, movable: true });
	});

	it('never leaves a pin behind when there is no box to type in', () => {
		// The bug this was written for: backing out between placing the pin and the box opening left an
		// amber pin on the page that could be neither finished nor dismissed, looking like a comment
		// that was not one. The pin and the box now hang off the same value.
		const list = [pinned(1)];
		expect(markersFor(list, numbers(list), 'a', { anchor: at(), composing: false }).map((m) => m.id)).toEqual([1]);
	});
});

describe('forgetPosted', () => {
	it('forgets a local copy once GitHub returns that comment', () => {
		const held = new Map([
			[1, c(1)],
			[2, c(2)],
		]);
		forgetPosted(held, [c(1)]);
		expect([...held.keys()]).toEqual([2]);
	});

	it('keeps one GitHub has not caught up with yet, which is what it is for', () => {
		const held = new Map([[9, c(9)]]);
		forgetPosted(held, []);
		expect([...held.keys()]).toEqual([9]);
	});

	it('lets a later change on GitHub through, instead of holding the copy as written', () => {
		// Resolved by someone else after it was written here: dropping the local copy is what lets
		// the newer version win.
		const held = new Map([[1, c(1)]]);
		const fromGitHub = [c(1, { resolved: true })];
		forgetPosted(held, fromGitHub);
		expect(mergeComments(fromGitHub, held.values())[0]?.resolved).toBe(true);
	});
});

describe('openComments / resolvedComments', () => {
	it('splits what is still to be dealt with from what is done', () => {
		const list = [c(1), c(2, { resolved: true }), c(3)];
		expect(openComments(list).map((x) => x.id)).toEqual([1, 3]);
		expect(resolvedComments(list).map((x) => x.id)).toEqual([2]);
	});

	it('is the same question the pins ask, so a pin and the count cannot disagree', () => {
		const withPin = (id: number, over = {}) => c(id, { anchor: anAnchor({ route: '/r' }), ...over });
		const list = [withPin(1), withPin(2, { resolved: true })];
		expect(markersFor(list, numberComments(list), 'a', null).map((m) => m.id)).toEqual(openComments(list).map((x) => x.id));
	});
});
