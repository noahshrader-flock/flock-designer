import { describe, expect, it } from 'vitest';
import { RELAY_CALLS, readRelayAsk, readRelayTell } from '../src/shared/reviewRelay';

/**
 * A prototype's review page, framed in DSNR's review tab in VS Code, comments through the extension rather than with a
 * token of its own (ELECTRON_MIGRATION_PLAN 2A, 4.2). What the page may ask the tab, and what the tab may tell the page,
 * are read in exactly their shapes on each side, so a page that went wrong can ask for nothing more.
 */

describe('what the page may ask', () => {
	it('is the comment calls, who is signed in, signing in, and Address: nothing else', () => {
		expect([...RELAY_CALLS]).toEqual([
			'signInState',
			'readComments',
			'postComment',
			'moveComment',
			'resolveComment',
			'deleteComment',
			'signIn',
			'address',
		]);
	});

	it.each([[{ dsnr: 'ask', id: 1, name: 'readComments', args: ['demo', 'prototype/demo/v1'] }], [{ dsnr: 'ask', id: 9, name: 'signIn', args: [] }]])(
		'%o is read',
		(m) => {
			expect(readRelayAsk(m)).toEqual(m);
		},
	);

	it.each([
		[null],
		[{ dsnr: 'ask', id: 1, name: 'listProjects', args: [] }],
		[{ dsnr: 'ask', id: 0, name: 'readComments', args: [] }],
		[{ dsnr: 'ask', id: 1.5, name: 'readComments', args: [] }],
		[{ dsnr: 'ask', id: 1, name: 'readComments', args: 'x' }],
		[{ dsnr: 'ask', id: 1, name: 'readComments', args: [], more: 1 }],
		[{ dsnr: 'answer', id: 1, result: { ok: true, value: 1 } }],
		[{ type: 'call', id: 1, name: 'readComments', args: [] }],
	])('%o is dropped', (m) => {
		expect(readRelayAsk(m)).toBeNull();
	});
});

describe('what the tab may tell the page', () => {
	it.each([
		[{ dsnr: 'hello' }],
		[{ dsnr: 'scheme', dark: true }],
		[{ dsnr: 'scheme', dark: false }],
		[{ dsnr: 'answer', id: 3, result: { ok: true, value: [] } }],
		[{ dsnr: 'answer', id: 3, result: { ok: false, error: 'No.' } }],
	])('%o is read', (m) => {
		expect(readRelayTell(m)).toEqual(m);
	});

	it.each([
		[{ dsnr: 'hello', more: 1 }],
		[{ dsnr: 'scheme' }],
		[{ dsnr: 'scheme', dark: 'yes' }],
		[{ dsnr: 'scheme', dark: true, more: 1 }],
		[{ dsnr: 'answer', id: 3 }],
		[{ dsnr: 'answer', id: 3, result: { ok: false } }],
		[{ dsnr: 'answer', id: -1, result: { ok: true, value: 1 } }],
		[{ dsnr: 'ask', id: 1, name: 'signIn', args: [] }],
	])('%o is dropped', (m) => {
		expect(readRelayTell(m)).toBeNull();
	});
});
