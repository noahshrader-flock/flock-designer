import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import PAGE_AGENT from '../src/page/agentMain?page';
import { reviewPage } from '../extension/src/review';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { PrototypeServer } from '../src/core/services/prototypes/prototypeServer';
import { buildSite } from '../src/site/buildSite';
import { serveSite } from '../src/site/serveSite';

/**
 * The README's Review isolation, nested as VS Code nests it: DSNR's review tab (with a stand-in for VS Code's API), the
 * review bar's page built by the site builder, and the hostile prototype's page in it.
 */

const HOSTILE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hostile</title></head><body><main><h1>Alerts</h1></main><script>
const done = (step) => console.log('DONE ' + step);
// Its own copy, opened on the bar's address in a frame of its own: from there it would be the bar's origin.
if (location.search.includes('copy')) {
	try { parent.parent.document.body.dataset.copied = 'yes'; } catch {}
	done('copy ran');
} else {
	const tried = {};
	const attempt = (name, f) => { try { tried[name] = 'allowed: ' + String(f()); } catch { tried[name] = 'blocked'; } };
	attempt('read the bar', () => parent.document.title);
	attempt('rewrite the bar', () => ((parent.document.body.dataset.owned = 'yes'), 'rewrote'));
	attempt('read the bar storage', () => parent.localStorage.length);
	attempt('its own cookie', () => ((document.cookie = 'mine=1'), document.cookie));
	attempt('its own storage', () => (localStorage.setItem('k', 'v'), localStorage.getItem('k')));
	// To the review tab (the bar's parent), as the bar asks the extension, and as VS Code answers the bar.
	parent.parent.postMessage({ dsnr: 'ask', id: 99, name: 'address', args: [{ thread: 1, id: 1 }] }, '*');
	parent.parent.postMessage({ dsnr: 'answer', id: 99, result: { ok: true, value: 'forged' } }, '*');
	console.log('HOSTILE ' + JSON.stringify(tried));
	// The same answer from ten frames down, deeper than anything that looks for it: up ten frames to the page, then the
	// bar, then the tab.
	const deep = (n) => n === 0
		? "<script>let w = window; for (let i = 0; i < 12; i++) w = w.parent; w.postMessage({ dsnr: 'answer', id: 98, result: { ok: true, value: 'deep' } }, '*'); console.log('DONE deep')<\\/script>"
		: '<iframe srcdoc="' + deep(n - 1).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>';
	document.body.insertAdjacentHTML('beforeend', deep(10));
	// Its copy on the bar's address, its name spelled as a Mac's disk does not care about.
	const copy = document.createElement('iframe');
	copy.onload = () => done('copy loaded');
	copy.src = location.ancestorOrigins[0] + location.pathname.replace('page.html', 'Page.html') + '?copy';
	document.body.append(copy);
	if (location.pathname.includes('/beta/')) {
		try { top.location.href = 'about:blank#hijacked'; } catch {}
		done('hijack');
	}
}
</script></body></html>`;

/** Notes what its parent (the review tab) passes it, which should be VS Code's alone. */
const VIEWER = `window.heard = []; addEventListener('message', (e) => { if (e.source === parent) heard.push(e.data); });`;

let root: string;
let server: PrototypeServer;
let tabs: Server;
let tabsAt: string;
const record = (id: string) => [
	{ projectId: id, name: 'v1', branch: `prototype/${id}/v1`, commit: null, note: '', createdAt: '2026-10-01T10:00:00Z' },
];

const site = async (separate: boolean): Promise<string> => {
	const design = join(root, separate ? 'apart' : 'together', 'flock-designer');
	const viewer = join(root, separate ? 'apart' : 'together', 'viewer');
	const out = join(root, separate ? 'apart' : 'together', 'site');
	for (const id of ['alpha', 'beta']) {
		mkdirSync(join(design, 'prototypes', id), { recursive: true });
		writeFileSync(join(design, 'prototypes', id, 'brief.md'), `# ${id}\n`);
		writeFileSync(join(design, 'prototypes', id, 'work.json'), JSON.stringify(record(id)));
		writeFileSync(join(design, 'prototypes', id, 'v1.html'), HOSTILE);
	}
	mkdirSync(viewer, { recursive: true });
	writeFileSync(join(viewer, 'viewer.js'), VIEWER);
	writeFileSync(join(viewer, 'viewer.css'), '');
	writeFileSync(join(viewer, 'viewer.ttf'), '');
	writeFileSync(join(viewer, 'page-agent.js'), PAGE_AGENT);
	buildSite({
		designRoot: design,
		outDir: out,
		viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } },
		...(separate ? { pagesAt: `${await server.pagesOrigin()}/review/` } : {}),
	});
	if (separate) return server.serveFolder('review', out);
	// As the published site is: the page beside its bar, on one address.
	const together = await serveSite(out);
	open.push(together.server);
	return together.url.endsWith('/') ? together.url : `${together.url}/`;
};
const open: Server[] = [];

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-isolation-'));
	server = new PrototypeServer();
	// As VS Code shows the tab: framed by a host frame on the same address (`/host`), which posts the extension's messages into it.
	tabs = createServer((req, res) => {
		const at = new URL(req.url ?? '/', 'http://x');
		if (at.pathname === '/favicon.ico') return void res.writeHead(404).end();
		const src = at.searchParams.get('src') ?? '';
		const html =
			at.pathname === '/host'
				? `<!doctype html><title>VS Code</title><iframe id="tab" src="/?src=${encodeURIComponent(src)}"></iframe>`
				: reviewPage({ src, title: 'Review', nonce: 'n0nce' });
		res.writeHead(200, { 'content-type': 'text/html' }).end(html);
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

const review = (bar: string, steps: string[]) =>
	inChrome(async (browser) => {
		const tab = await browser.newPage(OWN_WINDOW);
		let tried: Record<string, string> = {};
		const made = new Set<string>();
		tab.on('console', (m) => {
			if (m.text().startsWith('HOSTILE ')) tried = JSON.parse(m.text().slice('HOSTILE '.length));
			if (m.text().startsWith('DONE ')) made.add(m.text().slice('DONE '.length));
		});
		// As VS Code's own script does, the tab's `parent` and `top` are the tab itself.
		await tab.evaluateOnNewDocument((tabsOrigin: string) => {
			if (location.origin !== tabsOrigin || location.pathname !== '/') return;
			const w = window as unknown as { toExtension: unknown[]; acquireVsCodeApi: () => unknown; parent: unknown; top: unknown };
			w.toExtension = [];
			w.acquireVsCodeApi = () => ({ postMessage: (m: unknown) => w.toExtension.push(m) });
			w.parent = window;
			w.top = window;
		}, tabsAt);
		await tab.goto(`${tabsAt}/host?src=${encodeURIComponent(bar)}`, { waitUntil: 'load' });
		const until = Date.now() + 20_000;
		while (!steps.every((s) => made.has(s))) {
			if (Date.now() > until) throw new Error(`the hostile page made only ${[...made].join(', ') || 'nothing'} of ${steps.join(', ')}`);
			await new Promise((r) => setTimeout(r, 50));
		}
		await tab.evaluate(() =>
			(document.getElementById('tab') as HTMLIFrameElement).contentWindow?.postMessage(
				{ dsnr: 'answer', id: 1, result: { ok: true, value: 'from VS Code' } },
				location.origin,
			),
		);
		// What was posted is delivered after it is: a round trip through the tab's own queue lets each arrive first.
		await tab.evaluate(() => new Promise((r) => setTimeout(r, 100)));
		const at = tab.url();
		const tabFrame = tab.frames().find((f) => f.url().startsWith(`${tabsAt}/?`));
		const ended =
			at.includes('hijacked') || !tabFrame ? null : await tabFrame.evaluate(() => (window as unknown as { toExtension: unknown[] }).toExtension);
		const barFrame = tab.frames().find((f) => f.url().startsWith(bar));
		const heard = barFrame ? await barFrame.evaluate(() => (window as unknown as { heard: unknown[] }).heard) : null;
		const [owned, copied] = barFrame
			? await barFrame.evaluate(() => [document.body.dataset.owned ?? null, document.body.dataset.copied ?? null])
			: [null, null];
		const pageAt =
			tab
				.frames()
				.find((f) => f.url().endsWith('page.html'))
				?.url() ?? null;
		return { tried, toExtension: ended, heard, owned, copied, made, hijacked: at.includes('hijacked'), pageAt };
	});

const STEPS = ['deep', 'copy loaded'];

describe.skipIf(NO_CHROME)('a hostile prototype in a review, in the real browser', () => {
	it('on the pages’ own address, reaches nothing of the bar, the tab or the extension, and still works as itself', async () => {
		const base = await site(true);
		const r = await review(`${base}prototype/alpha/v1/`, STEPS);
		expect(r.pageAt?.startsWith(await server.pagesOrigin())).toBe(true);
		expect(r.tried).toMatchObject({ 'read the bar': 'blocked', 'rewrite the bar': 'blocked', 'read the bar storage': 'blocked' });
		expect(r.tried['its own cookie']).toBe('allowed: mine=1');
		expect(r.tried['its own storage']).toBe('allowed: v');
		expect(r.owned).toBeNull();
		expect(r.toExtension).toEqual([]);
		// Only the tab's own messages: no theme colours are set outside VS Code.
		expect(r.heard).toEqual([
			{ dsnr: 'hello' },
			{ dsnr: 'scheme', theme: { kind: 'vscode-light', colors: {} } },
			{ dsnr: 'answer', id: 1, result: { ok: true, value: 'from VS Code' } },
		]);
		// Its copy on the bar's address is not served there, so never runs.
		expect(r.made.has('copy ran')).toBe(false);
		expect(r.copied).toBeNull();
		const beta = await review(`${base}prototype/beta/v1/`, [...STEPS, 'hijack']);
		expect(beta.hijacked).toBe(false);
	}, 90_000);
});

/** The bar keeps the person's token in its own storage; the hostile page beside it must reach none of it. */
const published = (bar: string, steps: string[]) =>
	inChrome(async (browser) => {
		const tab = await browser.newPage(OWN_WINDOW);
		let tried: Record<string, string> = {};
		const made = new Set<string>();
		tab.on('console', (m) => {
			if (m.text().startsWith('HOSTILE ')) tried = JSON.parse(m.text().slice('HOSTILE '.length));
			if (m.text().startsWith('DONE ')) made.add(m.text().slice('DONE '.length));
		});
		await tab.evaluateOnNewDocument(() => {
			if (window === top) localStorage.setItem('dsnr.github-token', 'the-token');
		});
		await tab.goto(bar, { waitUntil: 'load' });
		const until = Date.now() + 20_000;
		while (!steps.every((s) => made.has(s))) {
			if (Date.now() > until) throw new Error(`the hostile page made only ${[...made].join(', ') || 'nothing'} of ${steps.join(', ')}`);
			await new Promise((r) => setTimeout(r, 50));
		}
		await tab.evaluate(() => new Promise((r) => setTimeout(r, 100)));
		const at = tab.url();
		const [owned, copied] = at.includes('hijacked')
			? [null, null]
			: await tab.evaluate(() => [document.body.dataset.owned ?? null, document.body.dataset.copied ?? null]);
		return { tried, owned, copied, made, hijacked: at.includes('hijacked') };
	});

describe.skipIf(NO_CHROME)('a hostile prototype on the published site, in the real browser', () => {
	it('beside its bar with no origin of its own, reaches nothing of the bar or its token, and keeps its own storage and cookie', async () => {
		const base = await site(false);
		const r = await published(`${base}prototype/alpha/v1/`, STEPS);
		expect(r.tried).toMatchObject({ 'read the bar': 'blocked', 'rewrite the bar': 'blocked', 'read the bar storage': 'blocked' });
		// What it set is kept for it, in memory: the agent's stand-ins, since the browser refuses its own.
		expect(r.tried['its own cookie']).toBe('allowed: mine=1');
		expect(r.tried['its own storage']).toBe('allowed: v');
		expect(r.owned).toBeNull();
		// Its copy on the bar's address is framed by it, so it has no origin of its own either.
		expect(r.copied).toBeNull();
		const beta = await published(`${base}prototype/beta/v1/`, [...STEPS, 'hijack']);
		expect(beta.hijacked).toBe(false);
	}, 90_000);

	it('with the sandbox taken off, reaches into the bar: the test can fail', async () => {
		const base = await site(false);
		const index = join(root, 'together', 'site', 'prototype', 'alpha', 'v1', 'index.html');
		writeFileSync(index, readFileSync(index, 'utf8').replace(/ sandbox="[^"]*"/, ''));
		const r = await published(`${base}prototype/alpha/v1/`, STEPS);
		expect(r.tried['read the bar']).toMatch(/^allowed/);
		expect(r.tried['read the bar storage']).toMatch(/^allowed/);
		expect(r.owned).toBe('yes');
	}, 90_000);
});
