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
		local: 'http://127.0.0.1:4321',
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
		expect(directive('img-src')).toBe('img-src vscode-resource: data: http://127.0.0.1:4321');
	});

	it('frames, and shows pictures from, this machine’s own server alone: the design system’s stories and its components’ pictures', () => {
		expect(directive('frame-src')).toBe('frame-src http://127.0.0.1:4321');
		expect(page()).not.toMatch(/frame-src[^;]*https?:\/\/(?!127\.0\.0\.1:4321)/);
	});

	it('says which DSNR page it is, read by the page as text', () => {
		const tab = panelHtml({
			cspSource: 'c',
			nonce: 'n',
			script: 's',
			style: 'y',
			codicons: 'i',
			local: 'http://127.0.0.1:1',
			tab: { kind: 'component', id: 'src/"<b>".stories.tsx', name: 'B' },
		});
		const said = /<body data-tab="([^"]*)">/.exec(tab)?.[1] ?? '';
		expect(said).not.toMatch(/[<>"]/);
		expect(
			JSON.parse(
				said
					.replace(/&quot;/g, '"')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&amp;/g, '&'),
			),
		).toEqual({
			kind: 'component',
			id: 'src/"<b>".stories.tsx',
			name: 'B',
		});
		expect(page()).toContain('<body>');
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
