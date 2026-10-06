import { describe, expect, it } from 'vitest';
import { RESOLVED_MARK, assertPreviewUrl, composeBody, isResolved, parseAnchor, sanitizeAnchor, stripAnchor, withResolved } from '../src/shared/anchor';
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

