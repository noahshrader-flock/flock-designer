import { describe, expect, it } from 'vitest';
import { RESOLVED_MARK, assertPreviewUrl, composeBody, isResolved, parseAnchor, parsePicture, sanitizeAnchor, sanitizePicture, stripAnchor, withResolved } from '../src/shared/anchor';
import type { CommentAnchor } from '../src/shared/contract';

const anchor: CommentAnchor = {
	route: '/users#/list',
	selector: '[data-e2e-ref="users-invite"]',
	nearbyText: 'Invite users',
	viewport: { width: 1280, height: 800 },
	commit: 'abc123',
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
		const out = sanitizeAnchor({ route: '/' + 'a'.repeat(999), selector: 's'.repeat(999), nearbyText: 't'.repeat(999), viewport: { width: -5, height: 'x' }, commit: 'not hex!', offset: { x: 9, y: -3 } });
		expect(out?.route).toHaveLength(300);
		expect(out?.selector).toHaveLength(500);
		expect(out?.nearbyText).toHaveLength(120);
		expect(out?.viewport).toEqual({ width: 0, height: 0 });
		expect(out?.commit).toBe('');
		expect(out?.offset).toEqual({ x: 1, y: 0 });
	});
	it('refuses what is not an anchor', () => {
		expect(sanitizeAnchor(null)).toBeNull();
		expect(sanitizeAnchor({ route: 'users', selector: 'x' })).toBeNull();
		expect(sanitizeAnchor({ route: '/x', selector: '' })).toBeNull();
	});
});

describe('assertPreviewUrl', () => {
	it('accepts a local dev server and a shared https preview', () => {
		expect(assertPreviewUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
		expect(assertPreviewUrl('https://pr-12.preview.example.com/a')).toContain('https://');
	});
	it.each(['file:///etc/passwd', 'javascript:alert(1)', 'http://example.com', 'https://user:pw@example.com', 'nonsense'])(
		'refuses %s',
		(u) => expect(() => assertPreviewUrl(u)).toThrow(),
	);
});

describe('resolved marker', () => {
  it('sets and clears the marker without touching the comment or its anchor', () => {
    const body = composeBody('Make this primary', { route: '/a', selector: 'main', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' });
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
	const base = { route: '/a', selector: 'main', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' };

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
	const anchor = { route: '/a', selector: 'main', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' };
	const picture = `data:image/jpeg;base64,${Buffer.from('not really a jpeg but shaped like one').toString('base64')}`;

	it('is written into the comment, read back, and does not show up as part of the words', () => {
		const body = composeBody('Make this primary', anchor, picture);
		expect(parsePicture(body)).toBe(picture);
		expect(parseAnchor(body)).toMatchObject({ route: '/a' });
		expect(stripAnchor(body)).toBe('Make this primary');
	});

	it('is hidden: nothing of it is visible markup, so a person reading on GitHub sees only the words and the spot', () => {
		const visible = composeBody('hi', anchor, picture).replace(/<!--[\s\S]*?-->/g, '');
		expect(visible).not.toContain('base64');
	});

	it('leaves a comment without one exactly as it was', () => {
		expect(composeBody('hi', anchor)).toBe(composeBody('hi', anchor, null));
		expect(parsePicture(composeBody('hi', anchor))).toBeNull();
	});

	it('survives being resolved and reopened', () => {
		const resolved = withResolved(composeBody('hi', anchor, picture), true);
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
		expect(composeBody('hi', anchor, 'javascript:alert(1)')).not.toContain('fd-picture');
	});
});

describe('what kind of element, and where it sits', () => {
	const base = { route: '/a', selector: 'main', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '' };

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

	it('cuts a long container name rather than carrying a page\'s text into the record', () => {
		expect(sanitizeAnchor({ ...base, inside: ['x'.repeat(500)] })?.inside?.[0]?.length).toBe(60);
	});
});

