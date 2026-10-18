import { describe, expect, it } from 'vitest';
import type { MarkerRequest } from '../src/shared/contract';
import { readMarkers, readPick, readPinMessage } from '../src/shared/pageReaders';
import { MESSAGE_PREFIX } from '../src/shared/pinMessage';
import { type PrototypeChange, whereTheChangeGoes } from '../src/main/services/prototypeWork';

/**
 * The gate for whatever a previewed page says (TEST-8). A page can say anything, so each reader is tried with what a page
 * could send that the app's own scripts never would: each is refused, or cut to the shape the scripts give.
 */

const anchor = { route: '/users', selector: '[data-e2e-ref="invite"]', viewport: { width: 1, height: 1 } };
const said = (m: unknown) => `${MESSAGE_PREFIX}${JSON.stringify(m)}`;

describe('a pin’s report', () => {
	it('counts a click and a move that carry the secret, in exactly their shape', () => {
		expect(readPinMessage(said({ n: 's', t: 'click', id: 3 }), 's')).toEqual({ kind: 'click', id: 3 });
		expect(readPinMessage(said({ n: 's', t: 'move', id: 3, anchor }), 's')).toMatchObject({ kind: 'move', id: 3, anchor: { route: '/users' } });
	});

	it.each([
		['a wrong secret', said({ n: 'other', t: 'click', id: 3 })],
		['no secret', said({ t: 'click', id: 3 })],
		['an id that is not a whole number', said({ n: 's', t: 'click', id: 1.5 })],
		['an id that is text', said({ n: 's', t: 'click', id: '3' })],
		['an unknown type', said({ n: 's', t: 'delete', id: 3 })],
		['a move with no anchor', said({ n: 's', t: 'move', id: 3 })],
		['a move whose anchor is not on a route', said({ n: 's', t: 'move', id: 3, anchor: { ...anchor, route: 'users' } })],
		['a move whose anchor has no selector', said({ n: 's', t: 'move', id: 3, anchor: { ...anchor, selector: '' } })],
		['text that is not JSON', `${MESSAGE_PREFIX}{not json`],
		['a message without the prefix', JSON.stringify({ n: 's', t: 'click', id: 3 })],
	])('refuses %s', (_, message) => {
		expect(readPinMessage(message, 's')).toBeNull();
	});

	it('cuts an oversized anchor to its caps, so a page cannot carry a payload in one', () => {
		const read = readPinMessage(
			said({ n: 's', t: 'move', id: 3, anchor: { ...anchor, selector: 'x'.repeat(10_000), nearbyText: 'y'.repeat(10_000) } }),
			's',
		);
		expect(read?.kind === 'move' && [read.anchor.selector.length, read.anchor.nearbyText.length]).toEqual([500, 120]);
	});
});

describe('how the pins were placed', () => {
	const items = [{ id: 1 }, { id: 2 }] as MarkerRequest[];

	it('keeps only a pin that was asked for, in a known state', () => {
		const raw = [
			{ id: 1, state: 'found' },
			{ id: 2, state: 'otherState' },
			{ id: 9, state: 'found' }, // not asked for
			{ id: 1.5, state: 'found' },
			{ id: '2', state: 'found' },
			{ id: 1, state: 'exploded' }, // not in MARKER_STATES
			{ id: 2 },
			null,
		];
		expect(readMarkers(raw, items)).toEqual([
			{ id: 1, state: 'found' },
			{ id: 2, state: 'otherState' },
		]);
	});

	it.each([null, undefined, 'found', { id: 1, state: 'found' }])('reads %s, which is not a list, as nothing placed', (raw) => {
		expect(readMarkers(raw, items)).toEqual([]);
	});
});

describe('where a pick landed', () => {
	it('is nothing when the pick was canceled', () => {
		expect(readPick(null)).toBeNull();
		expect(readPick(undefined)).toBeNull();
	});

	it('says aloud a spot that cannot be pinned, rather than dropping the click', () => {
		expect(() => readPick({ route: 'no-slash', selector: 'a' })).toThrow('could not be pinned');
	});

	it.each([
		['a box with NaN', { x: 0, y: 0, width: Number.NaN, height: 10 }],
		['a box with no size', { x: 0, y: 0, width: 0, height: 10 }],
		['a box missing a side', { x: 0, y: 0, width: 10 }],
		['a box of text', { x: '0', y: 0, width: 10, height: 10 }],
	])('drops %s, keeping the pin', (_, box) => {
		expect(readPick({ ...anchor, at: { x: 5, y: 5 }, box })).toMatchObject({ box: null, at: { x: 5, y: 5 } });
	});

	it('keeps a real box, and puts a nonsense point in the corner', () => {
		expect(readPick({ ...anchor, at: { x: Number.POSITIVE_INFINITY, y: -4 }, box: { x: 1, y: 2, width: 3, height: 4 } })).toMatchObject({
			at: { x: 0, y: 0 },
			box: { x: 1, y: 2, width: 3, height: 4 },
		});
	});
});

describe('where a change to a prototype goes', () => {
	const change = (over: Partial<PrototypeChange>): PrototypeChange => ({
		from: { name: 'v2' } as PrototypeChange['from'],
		target: 'v2',
		fresh: false,
		before: 'abc',
		others: 0,
		...over,
	});

	it('says nothing when it is made in place and no one else has commented', () => {
		expect(whereTheChangeGoes(change({}))).toBeNull();
	});

	it('says others have commented, and that the change is still made in place, for the person to be told', () => {
		expect(whereTheChangeGoes(change({ others: 3 }))).toBe(
			'3 comments from others are on v2. The change is made in it, in place, so their pins may land on the wrong element: say so when you report.',
		);
		expect(whereTheChangeGoes(change({ others: 1 }))).toMatch(/^1 comment from others is on v2\./);
	});

	it('says when who has commented could not be read, and still changes it in place', () => {
		expect(whereTheChangeGoes(change({ others: null }))).toBe('Who has commented on v2 could not be read. The change is made in it, in place.');
	});

	it('makes it in a new version only when one was asked for, whoever has commented', () => {
		for (const others of [3, null]) expect(whereTheChangeGoes(change({ fresh: true, target: 'v4', others }))).toMatch(/^A new version was asked for/);
		expect(whereTheChangeGoes(change({ fresh: true, target: 'v4', others: 0 }))).toMatch(
			/^A new version was asked for: the change is made in v4, a new version from v2, which starts as a copy of it\./,
		);
	});
});
