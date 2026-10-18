import { describe, expect, it } from 'vitest';
import {
	RESOLVED_MARK,
	addressedAt,
	addressedIn,
	composeBody,
	isResolved,
	parseAnchor,
	parsePicture,
	sanitizeAnchor,
	sanitizePicture,
	stripAnchor,
	withAddressed,
	withResolved,
} from '../src/shared/anchor';
import type { CommentAnchor } from '../src/shared/contract';
import { anAnchor } from './fixtures';

const anchor: CommentAnchor = {
	route: '/users#/list',
	selector: '[data-e2e-ref="users-invite"]',
	nearbyText: 'Invite users',
	viewport: { width: 1280, height: 800 },
	commit: 'abc1234',
	offset: { x: 0.25, y: 0.5 },
};

describe('comment anchors', () => {
	it('round-trips through the comment body', () => {
		expect(parseAnchor(composeBody('Make this primary', anchor))).toEqual(anchor);
	});

	it('shows people the comment, and where it is, but not the machinery', () => {
		const body = composeBody('Make this primary', anchor);
		expect(stripAnchor(body)).toBe('Make this primary');
		expect(body).toContain('On `/users#/list`');
	});

	it('cannot be broken out of by text in the anchor', () => {
		const evil = { ...anchor, nearbyText: '--> <script>alert(1)</script> <!--', selector: 'a`b' };
		const body = composeBody('hi', evil);
		expect(body.match(/-->/g)).toHaveLength(1);
		expect(parseAnchor(body)?.nearbyText).toContain('<script>');
		expect(stripAnchor(body)).toBe('hi');
	});

	it('leaves an ordinary comment untouched', () => {
		expect(composeBody('plain', null)).toBe('plain');
		expect(parseAnchor('plain')).toBeNull();
		expect(stripAnchor('plain')).toBe('plain');
	});

	it('ignores a damaged anchor rather than failing the thread', () => {
		expect(parseAnchor('hi\n<!-- fd-anchor: {not json} -->')).toBeNull();
	});
});

describe('sanitizeAnchor', () => {
	it('caps lengths and forces shapes', () => {
		const out = sanitizeAnchor({
			route: '/' + 'a'.repeat(999),
			selector: 's'.repeat(999),
			nearbyText: 't'.repeat(999),
			viewport: { width: -5, height: 'x' },
			commit: 'not hex!',
			offset: { x: 9, y: -3 },
		});
		expect(out?.route).toHaveLength(300);
		expect(out?.selector).toHaveLength(500);
		expect(out?.nearbyText).toHaveLength(120);
		expect(out?.viewport).toEqual({ width: 0, height: 0 });
		expect(out?.commit).toBe('');
		expect(out?.offset).toEqual({ x: 1, y: 0 });
	});
	it('keeps the fingerprint of the page it was placed on, and only one: twelve hex digits', () => {
		const base = { route: '/x', selector: 'p' };
		expect(sanitizeAnchor({ ...base, page: '0123456789ab' })?.page).toBe('0123456789ab');
		for (const page of ['0123456789AB', '0123456789a', '0123456789abc', '<script>', 12, null])
			expect(sanitizeAnchor({ ...base, page }), String(page)).not.toHaveProperty('page');
		// Comments made before it was recorded have none, and say nothing of it.
		expect(sanitizeAnchor(base)).not.toHaveProperty('page');
	});
	it('refuses what is not an anchor', () => {
		expect(sanitizeAnchor(null)).toBeNull();
		expect(sanitizeAnchor({ route: 'users', selector: 'x' })).toBeNull();
		expect(sanitizeAnchor({ route: '/x', selector: '' })).toBeNull();
	});
});

describe('addressed marker', () => {
	const anchored = () => composeBody('Remove this text', anAnchor({ route: '/a' }));

	it('records the commit the agent made, without touching the comment or its anchor', () => {
		const body = anchored();
		const done = withAddressed(body, '7f90de2c54a5fad511237ef1b8d0821a6b95bc79');
		expect(addressedAt(done)).toBe('7f90de2c54a5fad511237ef1b8d0821a6b95bc79');
		expect(done.startsWith(body)).toBe(true);
		expect(parseAnchor(done)).toMatchObject({ route: '/a' });
		// It is not resolution: that is the person's to give.
		expect(isResolved(done)).toBe(false);
	});

	it('clears the mark, so a later run that changed nothing leaves none behind', () => {
		const body = anchored();
		expect(withAddressed(withAddressed(body, 'abc1234'), null)).toBe(body);
		expect(addressedAt(body)).toBeNull();
	});

	it('replaces the old commit rather than keeping both', () => {
		const twice = withAddressed(withAddressed('x', 'abc1234'), 'def5678');
		expect(addressedAt(twice)).toBe('def5678');
		expect(twice.match(/fd-addressed/g)).toHaveLength(1);
	});

	it('writes only something that is a commit', () => {
		for (const bad of ['', 'not-a-sha', '../etc', 'abc', '<!-- fd-addressed: deadbeef -->']) {
			expect(addressedAt(withAddressed('x', bad))).toBeNull();
		}
	});

	it('never shows in the comment as a person reads it', () => {
		const marked = withAddressed(anchored(), 'abc1234');
		expect(stripAnchor(marked)).toBe('Remove this text');
		// And on a comment with no anchor at all.
		expect(stripAnchor(withAddressed('Just a note', 'abc1234'))).toBe('Just a note');
	});

	it("on a prototype, says which version the change is in, and only ever a prototype's name", () => {
		const marked = withAddressed(anchored(), 'abc1234def56', 'v2');
		expect(addressedAt(marked)).toBe('abc1234def56');
		expect(addressedIn(marked)).toBe('v2');
		expect(stripAnchor(marked)).toBe('Remove this text');
		expect(addressedIn(withAddressed('x', 'abc1234'))).toBeNull();
		expect(addressedIn(withAddressed('x', 'abc1234', 'codebase'))).toBeNull();
		expect(withAddressed('x', 'abc1234', '--> <script>')).toBe(withAddressed('x', 'abc1234'));
		// Moved on again: the mark is replaced, never doubled.
		const again = withAddressed(marked, 'fedcba987654', 'v3');
		expect(addressedIn(again)).toBe('v3');
		expect(again.match(/fd-addressed/g)).toHaveLength(1);
	});

	it('sits alongside the resolved marker without disturbing it', () => {
		const both = withResolved(withAddressed(anchored(), 'abc1234'), true);
		expect(addressedAt(both)).toBe('abc1234');
		expect(isResolved(both)).toBe(true);
		expect(stripAnchor(both.replace(RESOLVED_MARK, '').trim())).toBe('Remove this text');
	});
});

describe('resolved marker', () => {
	it('sets and clears the marker without touching the comment or its anchor', () => {
		const body = composeBody('Make this primary', anAnchor({ route: '/a' }));
		const done = withResolved(body, true);
		expect(isResolved(done)).toBe(true);
		expect(done.startsWith(body)).toBe(true);
		expect(withResolved(done, false)).toBe(body);
		expect(parseAnchor(done)).toMatchObject({ route: '/a' });
	});

	it('is idempotent: resolving twice leaves one marker', () => {
		const once = withResolved('x', true);
		expect(withResolved(once, true).split(RESOLVED_MARK).length).toBe(2);
	});
});

describe('page state in an anchor', () => {
	const base = anAnchor({ route: '/a' });

	it('keeps a query string, and keeps an empty one, which means the default state', () => {
		expect(sanitizeAnchor({ ...base, state: '?state=error' })?.state).toBe('?state=error');
		expect(sanitizeAnchor({ ...base, state: '' })?.state).toBe('');
	});

	it('leaves it absent on a comment made before it was recorded', () => {
		expect(sanitizeAnchor(base)).not.toHaveProperty('state');
	});

	it.each(['state=error', '?a b', '?<script>', '?x"y', `?${'a'.repeat(250)}`, 5])('drops a value that is not a query string: %j', (bad) => {
		expect(sanitizeAnchor({ ...base, state: bad })).not.toHaveProperty('state');
	});

	it('survives being written into a comment and read back, and shows on the visible line', () => {
		const body = composeBody('hi', { ...base, state: '?state=error' });
		expect(parseAnchor(body)?.state).toBe('?state=error');
		expect(body).toContain('`/a?state=error`');
		expect(stripAnchor(body)).toBe('hi');
	});
});

describe('a picture in a comment', () => {
	const sample = anAnchor({ route: '/a' });
	const picture = `data:image/jpeg;base64,${Buffer.from('not really a jpeg but shaped like one').toString('base64')}`;

	it('is written into the comment, read back, and does not show up as part of the words', () => {
		const body = composeBody('Make this primary', sample, picture);
		expect(parsePicture(body)).toBe(picture);
		expect(parseAnchor(body)).toMatchObject({ route: '/a' });
		expect(stripAnchor(body)).toBe('Make this primary');
	});

	it('is hidden: nothing of it is visible markup, so a person reading on GitHub sees only the words and the spot', () => {
		const visible = composeBody('hi', sample, picture).replace(/<!--[\s\S]*?-->/g, '');
		expect(visible).not.toContain('base64');
	});

	it('leaves a comment without one exactly as it was', () => {
		expect(composeBody('hi', sample)).toBe(composeBody('hi', sample, null));
		expect(parsePicture(composeBody('hi', sample))).toBeNull();
	});

	it('survives being resolved and reopened', () => {
		const resolved = withResolved(composeBody('hi', sample, picture), true);
		expect(parsePicture(resolved)).toBe(picture);
		expect(parsePicture(withResolved(resolved, false))).toBe(picture);
	});

	it.each([
		['a script', 'javascript:alert(1)'],
		['an address', 'https://example.test/x.jpg'],
		['another type', 'data:image/svg+xml;base64,PHN2Zz4='],
		['markup', 'data:image/jpeg;base64,AAAA<script>'],
		['something that would close the comment', 'data:image/jpeg;base64,AAAA-->'],
		['nothing', ''],
		['not a string', 5],
	])('refuses %s', (_label, bad) => {
		expect(sanitizePicture(bad)).toBeNull();
		expect(parsePicture(`x <!-- fd-picture: ${String(bad)} -->`)).toBeNull();
	});

	it('refuses one far larger than a picture this app makes, so a hand-written comment cannot carry a payload', () => {
		expect(sanitizePicture(`data:image/jpeg;base64,${'A'.repeat(30_000)}`)).toBeNull();
	});

	it('is dropped, not written, if it is not a picture', () => {
		expect(composeBody('hi', sample, 'javascript:alert(1)')).not.toContain('fd-picture');
	});
});

describe('what kind of element, and where it sits', () => {
	const base = anAnchor({ route: '/a' });

	it('keeps the kind of element and the containers it is inside, and they survive a comment round trip', () => {
		const a = sanitizeAnchor({ ...base, tag: 'p', inside: ['Notification Preferences', 'Hotlist Hits'] });
		expect(a).toMatchObject({ tag: 'p', inside: ['Notification Preferences', 'Hotlist Hits'] });
		expect(parseAnchor(composeBody('hi', a as CommentAnchor))).toMatchObject({ tag: 'p', inside: ['Notification Preferences', 'Hotlist Hits'] });
	});

	it('leaves them off a comment from before they were recorded', () => {
		const a = sanitizeAnchor(base);
		expect(a).not.toHaveProperty('tag');
		expect(a).not.toHaveProperty('inside');
	});

	it.each(['P', '<script>', 'a b', '', 'x'.repeat(40), 5, null])('drops a kind of element that is not a tag name: %j', (bad) => {
		expect(sanitizeAnchor({ ...base, tag: bad })).not.toHaveProperty('tag');
	});

	it('keeps at most three containers, cleans each, and ignores what is not a list', () => {
		const a = sanitizeAnchor({ ...base, inside: ['A', 'B<script>', 'C\nD', 'E', 'F'] });
		expect(a?.inside).toEqual(['A', 'B script', 'C D']);
		expect(sanitizeAnchor({ ...base, inside: 'nope' })).not.toHaveProperty('inside');
		expect(sanitizeAnchor({ ...base, inside: ['', '   ', 7] })).not.toHaveProperty('inside');
	});

	it("cuts a long container name rather than carrying a page's text into the record", () => {
		expect(sanitizeAnchor({ ...base, inside: ['x'.repeat(500)] })?.inside?.[0]?.length).toBe(60);
	});
});

describe('the theme a comment was made in', () => {
	it('is kept when it is light or dark, and dropped when it is anything else', () => {
		const base = { route: '/demo/v1/', selector: 'main', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' };
		expect(sanitizeAnchor({ ...base, theme: 'dark' })?.theme).toBe('dark');
		expect(sanitizeAnchor({ ...base, theme: 'light' })?.theme).toBe('light');
		for (const bad of ['system', '<script>', 3, null]) expect(sanitizeAnchor({ ...base, theme: bad })).not.toHaveProperty('theme');
	});
});
