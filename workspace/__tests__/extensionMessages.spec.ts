import { describe, expect, it } from 'vitest';
import { readMessage, replyTo } from '../extension/src/messages';

/**
 * What the panel's page may ask of the extension (Phase 3): a call to the core by its name in the contract's table, or
 * one of the panel's own few requests, each in exactly its shape, as the app checks what its window sends. Anything else
 * is dropped.
 */

describe('a message from the panel', () => {
	it.each([
		[{ type: 'call', id: 1, name: 'listProjects', args: [] }],
		[{ type: 'call', id: 7, name: 'readCheckout', args: ['/a', 2] }],
		[{ type: 'ready' }],
		[{ type: 'locate-design-system' }],
		[{ type: 'new-prototype' }],
		[{ type: 'open-review', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' }],
	])('%o is read', (m) => {
		expect(readMessage(m)).toEqual(m);
	});

	it.each([
		[null],
		['ready'],
		[{}],
		[{ type: 'call', id: 1, name: 'runAnything', args: [] }],
		[{ type: 'call', id: 0, name: 'listProjects', args: [] }],
		[{ type: 'call', id: 1.5, name: 'listProjects', args: [] }],
		[{ type: 'call', id: '1', name: 'listProjects', args: [] }],
		[{ type: 'call', id: 1, name: 'listProjects', args: 'x' }],
		[{ type: 'call', id: 1, name: 'listProjects', args: [], extra: true }],
		[{ type: 'ready', as: 'someone' }],
		// Signing in is VS Code's own, from the title bar: the page cannot ask for it.
		[{ type: 'sign-in' }],
		[{ type: 'account' }],
		[{ type: 'open-review', projectId: 'a', name: 'v1-i1' }],
		[{ type: 'open-review', projectId: 1, name: 'v1-i1', title: 't' }],
		[{ type: 'open-review', projectId: 'a', name: 'v1-i1', title: 'x'.repeat(301) }],
		[{ type: 'run', command: 'rm -rf /' }],
	])('%o is dropped', (m) => {
		expect(readMessage(m)).toBeNull();
	});

	it('is answered, until what it asks for is built, by saying so', () => {
		expect(replyTo({ type: 'new-prototype' })).toBe('Starting a prototype from DSNR is not built yet.');
	});
});
