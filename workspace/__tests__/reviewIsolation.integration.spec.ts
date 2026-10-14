import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import PAGE_AGENT from '../src/page/agentMain?page';
import { reviewPage } from '../extension/src/review';
import { findChrome } from '../src/main/services/chromeHeadless';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { buildSite } from '../src/site/buildSite';
import { serveSite } from '../src/site/serveSite';

/**
 * A hostile prototype in a review, in the real browser (REVIEW_ISOLATION_PLAN 2.4), nested as VS Code nests it: DSNR's
 * review tab (its own page, with a stand-in for VS Code's API), the review bar's page built by the site builder and served
 * by this machine's server, and the prototype's page in it. The prototype tries to read and rewrite the bar, read its
 * storage, ask the extension to Address a comment, answer the bar as if it were VS Code, and take the whole window away.
 * On the pages' own address, none of it works and the prototype still works as itself; on one address (as before
 * Phase 2) it does, which is what shows the test can fail.
 */

const HOSTILE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hostile</title></head><body><main><h1>Alerts</h1></main><script>
const tried = {};
const attempt = (name, f) => { try { tried[name] = 'allowed: ' + String(f()); } catch { tried[name] = 'blocked'; } };
attempt('read the bar', () => parent.document.title);
attempt('rewrite the bar', () => ((parent.document.body.dataset.owned = 'yes'), 'rewrote'));
attempt('read the bar storage', () => parent.localStorage.length);
attempt('its own cookie', () => ((document.cookie = 'mine=1'), document.cookie));
attempt('its own storage', () => (localStorage.setItem('k', 'v'), localStorage.getItem('k')));
// As the bar asks the extension, and as VS Code answers the bar.
top.postMessage({ dsnr: 'ask', id: 99, name: 'address', args: [{ thread: 1, id: 1 }] }, '*');
top.postMessage({ dsnr: 'answer', id: 99, result: { ok: true, value: 'forged' } }, '*');
console.log('HOSTILE ' + JSON.stringify(tried));
if (location.pathname.includes('/beta/')) setTimeout(() => { try { top.location.href = 'about:blank#hijacked'; } catch {} }, 100);
</script></body></html>`;

/** The bar's page, standing in: it notes what its parent (the review tab) passes it, which should be VS Code's alone. */
const VIEWER = `window.heard = []; addEventListener('message', (e) => { if (e.source === parent) heard.push(e.data); });`;

let root: string;
let server: PrototypeServer;
let tabs: Server;
let tabsAt: string;
const record = (id: string) => [
	{ projectId: id, name: 'v1-i1', branch: `prototype/${id}/v1-i1`, commit: null, note: '', createdAt: '2026-10-01T10:00:00Z' },
];

/** A design repository with two hostile prototypes, built as a review site, its pages on the pages' address or not. */
const site = async (separate: boolean): Promise<string> => {
	const design = join(root, separate ? 'apart' : 'together', 'flock-designer');
	const viewer = join(root, separate ? 'apart' : 'together', 'viewer');
	const out = join(root, separate ? 'apart' : 'together', 'site');
	for (const id of ['alpha', 'beta']) {
		mkdirSync(join(design, 'projects', id, 'prototypes'), { recursive: true });
		writeFileSync(join(design, 'projects', id, 'brief.md'), `# ${id}\n`);
		writeFileSync(join(design, 'projects', id, 'iterations.json'), JSON.stringify(record(id)));
		writeFileSync(join(design, 'projects', id, 'prototypes', 'v1-i1.html'), HOSTILE);
	}
	mkdirSync(viewer, { recursive: true });
	writeFileSync(join(viewer, 'viewer.js'), VIEWER);
	writeFileSync(join(viewer, 'viewer.css'), '');
	writeFileSync(join(viewer, 'page-agent.js'), PAGE_AGENT);
	buildSite({
		designRoot: design,
		outDir: out,
		viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } },
		...(separate ? { pagesAt: `${await server.pagesOrigin()}/review/` } : {}),
	});
	if (separate) return server.serveFolder('review', out);
	// As before Phase 2, and as the published site still is: the page beside its bar, on one address.
	const together = await serveSite(out);
	open.push(together.server);
	return together.url.endsWith('/') ? together.url : `${together.url}/`;
};
const open: Server[] = [];

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-isolation-'));
	server = new PrototypeServer();
	// The review tab's page, as VS Code would show it: served from an address of its own, framing the bar.
	tabs = createServer((req, res) => {
		const src = new URL(req.url ?? '/', 'http://x').searchParams.get('src') ?? '';
		res.writeHead(200, { 'content-type': 'text/html' }).end(reviewPage({ src, title: 'Review', nonce: 'n0nce' }));
	});
	await new Promise<void>((r) => tabs.listen(0, '127.0.0.1', r));
	tabsAt = `http://127.0.0.1:${(tabs.address() as AddressInfo).port}`;
});
afterAll(async () => {
	server.close();
	for (const s of open) s.close();
	await new Promise((r) => tabs.close(r));
	rmSync(root, { recursive: true, force: true });
});

/** A review tab open on `bar`: what the hostile page managed, what reached VS Code, what reached the bar, and where the tab ended. */
const review = async (bar: string) => {
	const { default: puppeteer } = await import('puppeteer-core');
	const browser = await puppeteer.launch({ executablePath: findChrome() as string, headless: true });
	try {
		const tab = await browser.newPage();
		let tried: Record<string, string> = {};
		tab.on('console', (m) => {
			if (m.text().startsWith('HOSTILE ')) tried = JSON.parse(m.text().slice('HOSTILE '.length));
		});
		// VS Code's API, standing in: what the tab passes up to the extension.
		await tab.evaluateOnNewDocument(() => {
			const w = window as unknown as { toExtension: unknown[]; acquireVsCodeApi: () => unknown };
			w.toExtension = [];
			w.acquireVsCodeApi = () => ({ postMessage: (m: unknown) => w.toExtension.push(m) });
		});
		await tab.goto(`${tabsAt}/?src=${encodeURIComponent(bar)}`, { waitUntil: 'load' });
		await new Promise((r) => setTimeout(r, 1500));
		const at = tab.url();
		const ended = at.includes('hijacked') ? null : await tab.evaluate(() => (window as unknown as { toExtension: unknown[] }).toExtension);
		const barFrame = tab.frames().find((f) => f.url().startsWith(bar));
		const heard = barFrame ? await barFrame.evaluate(() => (window as unknown as { heard: unknown[] }).heard) : null;
		const owned = barFrame ? await barFrame.evaluate(() => document.body.dataset.owned ?? null) : null;
		const pageAt =
			tab
				.frames()
				.find((f) => f.url().endsWith('page.html'))
				?.url() ?? null;
		return { tried, toExtension: ended, heard, owned, hijacked: at.includes('hijacked'), pageAt };
	} finally {
		await browser.close();
	}
};

describe.skipIf(findChrome() === null)('a hostile prototype in a review, in the real browser', () => {
	it('on the pages’ own address, reaches nothing of the bar, the tab or the extension, and still works as itself', async () => {
		const base = await site(true);
		const r = await review(`${base}alpha/v1/i1/`);
		expect(r.pageAt?.startsWith(await server.pagesOrigin())).toBe(true);
		expect(r.tried).toMatchObject({ 'read the bar': 'blocked', 'rewrite the bar': 'blocked', 'read the bar storage': 'blocked' });
		expect(r.tried['its own cookie']).toBe('allowed: mine=1');
		expect(r.tried['its own storage']).toBe('allowed: v');
		expect(r.owned).toBeNull();
		// Nothing it sent the tab went up to the extension, or down to the bar as if VS Code had said it.
		expect(r.toExtension).toEqual([]);
		expect(r.heard).toEqual([{ dsnr: 'hello' }]);
		// Nor can it take the whole window away.
		const beta = await review(`${base}beta/v1/i1/`);
		expect(beta.hijacked).toBe(false);
	}, 90_000);

	it('on one address, as before, reaches into the bar: the test can fail', async () => {
		const base = await site(false);
		const r = await review(`${base}alpha/v1/i1/`);
		expect(r.tried['read the bar']).toMatch(/^allowed/);
		expect(r.owned).toBe('yes');
	}, 90_000);
});
