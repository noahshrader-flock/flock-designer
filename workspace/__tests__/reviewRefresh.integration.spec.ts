import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGE_AGENT } from '../src/site/buildSite';
import { watchPages } from '../extension/src/pageWatch';
import { Reviews, buildReviewSite } from '../extension/src/review';

/** The tab, the watch on the pages and the site's build, as they are together, on files in a real design repository. */
const roots: string[] = [];
afterEach(() => {
	for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const world = () => {
	const root = mkdtempSync(join(tmpdir(), 'dsnr-refresh-'));
	roots.push(root);
	const design = join(root, 'design');
	const pages = join(design, 'projects', 'demo', 'prototypes');
	mkdirSync(pages, { recursive: true });
	writeFileSync(join(design, 'projects', 'demo', 'brief.md'), '# Demo\n');
	writeFileSync(
		join(design, 'projects', 'demo', 'work.json'),
		JSON.stringify([{ projectId: 'demo', name: 'v1', branch: 'prototype/demo/v1', commit: null, note: '', createdAt: '2026-10-01T10:00:00Z' }]),
	);
	writeFileSync(
		join(pages, 'v1.html'),
		'<!doctype html><html><head><title>Demo</title></head><body><h1>Device Alerts and Updates</h1></body></html>',
	);
	// The viewer's files, as the build requires them to be there; nothing here reads what is in them.
	const viewer = join(root, 'viewer');
	mkdirSync(viewer);
	for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', PAGE_AGENT]) writeFileSync(join(viewer, f), '');
	const site = join(root, 'site');
	const posted: unknown[] = [];
	let disposed = (): void => undefined;
	const vscode = {
		ViewColumn: { Active: -1 },
		window: {
			createWebviewPanel: () => ({
				title: '',
				active: true,
				visible: true,
				reveal: () => undefined,
				dispose: () => disposed(),
				onDidChangeViewState: () => ({ dispose: () => undefined }),
				onDidDispose: (l: () => void) => ((disposed = l), { dispose: () => undefined }),
				webview: {
					html: '',
					onDidReceiveMessage: () => ({ dispose: () => undefined }),
					postMessage: async (m: unknown) => (posted.push(m), true),
				},
			}),
		},
	};
	const build = buildReviewSite(site, viewer, () => ({ owner: 'acme', repo: 'design' }));
	const reviews = new Reviews({
		vscode: vscode as never,
		build: (records) => build(records, 'http://127.0.0.1:1/review/'),
		serve: async () => 'http://127.0.0.1:5000/review/',
		answer: async () => ({ ok: true, value: null }),
		// The real watch, with its settle time made short.
		watch: (dir, onPage) => watchPages(dir, onPage, 60),
	});
	const shown = () => readFileSync(join(site, 'demo', 'v1', 'page.html'), 'utf8');
	return { design, pages, reviews, posted, shown, close: () => disposed() };
};

describe('an open review of a prototype, as an agent saves a new page of it', () => {
	it('has the new page built into its site, and its page told, without the tab being closed and opened again', async () => {
		const w = world();
		await w.reviews.open({ records: join(w.design, 'projects'), projectId: 'demo', name: 'v1', title: 'Demo · Version 1' });
		expect(w.shown()).toContain('Device Alerts and Updates');
		expect(w.posted).toEqual([]);

		// Written by another process, as `dsnr save-prototype` writes it.
		writeFileSync(join(w.pages, 'v1.html'), readFileSync(join(w.pages, 'v1.html'), 'utf8').replace('Device Alerts and Updates', 'Device Alerts'));
		await vi.waitFor(() => expect(w.posted).toEqual([{ dsnr: 'page', name: 'v1' }]), { timeout: 5000 });
		expect(w.shown()).toContain('<h1>Device Alerts</h1>');
		expect(w.shown()).not.toContain('Device Alerts and Updates');

		// And again for the next save; and once the tab is closed, no more.
		writeFileSync(join(w.pages, 'v1.html'), readFileSync(join(w.pages, 'v1.html'), 'utf8').replace('Device Alerts', 'Alerts'));
		await vi.waitFor(() => expect(w.posted).toHaveLength(2), { timeout: 5000 });
		w.close();
		writeFileSync(join(w.pages, 'v1.html'), '<!doctype html><html><body><h1>Closed</h1></body></html>');
		await new Promise((r) => setTimeout(r, 600));
		expect(w.posted).toHaveLength(2);
		expect(w.shown()).toContain('<h1>Alerts</h1>');
	});
});
