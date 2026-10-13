import { describe, expect, it } from 'vitest';
import { newNonce, panelHtml } from '../extension/src/html';

/**
 * The page DSNR's panel loads (Phase 0.2), as tight as VS Code's webview guidance asks: nothing loads unless named, the
 * one script runs by its nonce, and what it may load comes from the extension's own build only.
 */

const page = () =>
	panelHtml({
		cspSource: 'vscode-resource:',
		nonce: 'abc123',
		script: 'vscode-resource:/dist/webview.js',
		style: 'vscode-resource:/dist/webview.css',
		codicons: 'vscode-resource:/dist/codicon.css',
	});
const policy = () => /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page())?.[1] ?? '';
const directive = (name: string) =>
	policy()
		.split(';')
		.map((d) => d.trim())
		.find((d) => d.startsWith(`${name} `));

describe('the panel’s page', () => {
	it('loads nothing by default, and its script only by its nonce', () => {
		expect(directive('default-src')).toBe("default-src 'none'");
		expect(directive('script-src')).toBe("script-src 'nonce-abc123'");
		expect(policy()).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
	});

	it('takes its styles, fonts and pictures from the extension’s own build, and nothing from outside', () => {
		expect(directive('style-src')).toBe('style-src vscode-resource:');
		expect(directive('font-src')).toBe('font-src vscode-resource:');
		expect(directive('img-src')).toBe('img-src vscode-resource: data:');
	});

	it('has the one script, carrying the nonce, and the two style sheets', () => {
		expect([...page().matchAll(/<script\b[^>]*>/g)].map((m) => m[0])).toEqual(['<script nonce="abc123" src="vscode-resource:/dist/webview.js">']);
		expect([...page().matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1])).toEqual([
			'vscode-resource:/dist/codicon.css',
			'vscode-resource:/dist/webview.css',
		]);
	});

	it('makes a new nonce each time, long and unguessable', () => {
		const a = newNonce();
		expect(a).toMatch(/^[A-Za-z0-9_-]{32,}$/);
		expect(newNonce()).not.toBe(a);
	});
});
