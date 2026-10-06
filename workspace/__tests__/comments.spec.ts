import { describe, expect, it } from 'vitest';
import { mergeComments, sameComments } from '../src/shared/comments';
import type { ReviewComment } from '../src/shared/contract';

const c = (id: number, over: Partial<ReviewComment> = {}): ReviewComment => ({
	id,
	author: 'a',
	authorAvatarUrl: null,
	body: `c${id}`,
	createdAt: `2026-10-05T10:${String(id).padStart(2, '0')}:00Z`,
	resolved: false,
	anchor: null,
	picture: null,
	...over,
});

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
		['a pin moved', [c(1), c(2, { anchor: { route: '/a', selector: 'x', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' } })]],
		['a picture added', [c(1), c(2, { picture: 'data:image/jpeg;base64,AA' })]],
	])('is false when there is %s', (_label, next) => {
		expect(sameComments([c(1), c(2)], next)).toBe(false);
	});

	it('is false before anything has been read', () => {
		expect(sameComments(null, [])).toBe(false);
	});
});
