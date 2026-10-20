import { describe, expect, it } from 'vitest';
import { RELAY_CALLS, readRelayAsk, readRelayTell } from '../src/shared/reviewRelay';

/** Both directions are read in exactly their shapes, so a page that went wrong can ask for nothing more. */

describe('what the page may ask', () => {
	it('is the comment calls, who is signed in, signing in, Address, how far behind with Refresh, and what the design system is built from: nothing else', () => {
		expect([...RELAY_CALLS]).toEqual([
			'signInState',
			'readComments',
			'postComment',
			'moveComment',
			'resolveComment',
			'deleteComment',
			'signIn',
			'address',
			'baseBehind',
			'refresh',
			'designSystemBuild',
			'buildDesignSystemFrom',
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
		[{ dsnr: 'scheme', theme: { kind: 'vscode-dark', colors: { '--vscode-foreground': '#cccccc' } } }],
		[{ dsnr: 'scheme', theme: { kind: 'vscode-high-contrast-light', colors: {} } }],
		[{ dsnr: 'answer', id: 3, result: { ok: true, value: [] } }],
		[{ dsnr: 'answer', id: 3, result: { ok: false, error: 'No.' } }],
	])('%o is read', (m) => {
		expect(readRelayTell(m)).toEqual(m);
	});

	it.each([
		[{ dsnr: 'hello', more: 1 }],
		[{ dsnr: 'scheme' }],
		[{ dsnr: 'scheme', dark: true }],
		[{ dsnr: 'scheme', theme: { kind: 'vscode-sepia', colors: {} } }],
		[{ dsnr: 'scheme', theme: { kind: 'vscode-dark', colors: [] } }],
		// Only VS Code's variables, and only words: nothing that would set the page's own names or more than a value.
		[{ dsnr: 'scheme', theme: { kind: 'vscode-dark', colors: { '--dsnr-brand': 'red' } } }],
		[{ dsnr: 'scheme', theme: { kind: 'vscode-dark', colors: { '--vscode-foreground': 1 } } }],
		[{ dsnr: 'scheme', theme: { kind: 'vscode-dark', colors: { '--vscode-foreground': 'x'.repeat(401) } } }],
		[{ dsnr: 'scheme', theme: { kind: 'vscode-dark', colors: {}, more: 1 } }],
		[{ dsnr: 'scheme', theme: { kind: 'vscode-dark', colors: {} }, more: 1 }],
		[{ dsnr: 'answer', id: 3 }],
		[{ dsnr: 'answer', id: 3, result: { ok: false } }],
		[{ dsnr: 'answer', id: -1, result: { ok: true, value: 1 } }],
		[{ dsnr: 'ask', id: 1, name: 'signIn', args: [] }],
	])('%o is dropped', (m) => {
		expect(readRelayTell(m)).toBeNull();
	});
});
