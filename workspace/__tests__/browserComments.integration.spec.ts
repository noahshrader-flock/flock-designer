import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Frame, Page } from 'puppeteer-core';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReviewThreads } from '../src/codeHost/reviewThreads';
import { PrototypeServer } from '../src/core/services/prototypes/prototypeServer';
import { readRelayAsk } from '../src/shared/reviewRelay';
import { buildSite } from '../src/site/buildSite';
import { tokenApi } from '../src/viewer/browserAdapter';
import { fakeGitHub } from './pageHarness';
import { NO_CHROME, inChrome } from './realChrome';

/**
 * A review opened in the browser from DSNR, in the real browser (BROWSER_COMMENTS_PLAN 2): the real viewer, built as the
 * extension carries it, on this machine's server as VS Code serves it (the page on its own address), opened with a key.
 * It asks DSNR, standing in here as the extension answers (the core's comment calls over a GitHub that answers as its
 * API does), through the server, shows the comments, and posts one; and keeps its key when the page loads again.
 * A hostile prototype in such a review can neither learn the key nor ask without it (BROWSER_COMMENTS_PLAN 4.1). The server
 * will not serve a prototype on the bar's address, so the failing case is a mutation: with that refusal taken out and the
 * page framed from there, the same page reads the key (checked 2026-10-15).
 */

const KEY = 'AbC-_x9yZAbC-_x9yZAbCd';
const OTHER_KEY = 'ZzY-_k3wXZzY-_k3wXZzYw';
const GUESSED = 'GuE-_s5sSGuE-_s5sSGuEs';
/**
 * A prototype that tries to learn the bar's key (its storage, its address, the referrer) and to ask DSNR without it: with
 * no key, with a guessed one (which makes the browser ask the server first), and with a request it cannot read the answer of.
 */
const HOSTILE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hostile</title></head><body><main><h1>Alerts</h1></main><script>
const tried = {};
const attempt = async (name, f) => { try { tried[name] = 'allowed: ' + String(await f()); } catch { tried[name] = 'blocked'; } };
const ask = (headers, more) => fetch(location.ancestorOrigins[0] + '/_dsnr/ask', { method: 'POST', headers, body: JSON.stringify({ dsnr: 'ask', id: 7, name: 'address', args: [{ thread: 1, id: 1 }, 'prototype/hostile/v1'] }), ...more });
(async () => {
	await attempt('read the key', () => parent.sessionStorage.getItem('dsnr.review-key'));
	await attempt('read the bar address', () => parent.location.href);
	tried.referrer = document.referrer;
	await attempt('ask with no key', async () => (await ask({ 'content-type': 'application/json' })).status);
	await attempt('ask with a guessed key', async () => (await ask({ 'content-type': 'application/json', 'x-dsnr-key': '${GUESSED}' })).status);
	await attempt('ask unread', async () => (await ask({ 'content-type': 'text/plain' }, { mode: 'no-cors' })).type);
	console.log('HOSTILE ' + JSON.stringify(tried));
})();
</script></body></html>`;
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Alert history</title></head>
<body><main><h1>Alert history</h1><button data-e2e-ref="clear-filter-button">Clear Filter</button></main></body></html>`;

let root: string;
let server: PrototypeServer;
let base: string;
let gh: ReturnType<typeof fakeGitHub>;
const asked: string[] = [];
/** Every key an ask reached DSNR with. */
const keys: string[] = [];
const addressed: unknown[][] = [];

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-browser-'));
	// The viewer, built as the extension's is.
	const viewer = join(root, 'viewer');
	await build({ configFile: resolve(__dirname, '../viewer.vite.config.ts'), build: { outDir: viewer, emptyOutDir: true }, logLevel: 'silent' });
	const design = join(root, 'flock-designer');
	mkdirSync(join(design, 'projects', 'demo', 'prototypes'), { recursive: true });
	writeFileSync(join(design, 'projects', 'demo', 'brief.md'), '# Demo\n');
	writeFileSync(
		join(design, 'projects', 'demo', 'work.json'),
		JSON.stringify(
			['v1', 'v2'].map((name, i) => ({
				projectId: 'demo',
				name,
				branch: `prototype/demo/${name}`,
				commit: null,
				note: '',
				createdAt: `2026-10-0${i + 1}T10:00:00Z`,
			})),
		),
	);
	writeFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1.html'), PAGE);
	writeFileSync(join(design, 'projects', 'demo', 'prototypes', 'v2.html'), PAGE.replace('Alert history</h1>', 'Alert history, addressed</h1>'));
	mkdirSync(join(design, 'projects', 'hostile', 'prototypes'), { recursive: true });
	writeFileSync(join(design, 'projects', 'hostile', 'brief.md'), '# Hostile\n');
	writeFileSync(
		join(design, 'projects', 'hostile', 'work.json'),
		JSON.stringify([{ projectId: 'hostile', name: 'v1', branch: 'prototype/hostile/v1', commit: null, note: '', createdAt: '2026-10-01T10:00:00Z' }]),
	);
	writeFileSync(join(design, 'projects', 'hostile', 'prototypes', 'v1.html'), HOSTILE);
	server = new PrototypeServer();
	const out = join(root, 'site');
	buildSite({
		designRoot: design,
		outDir: out,
		viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } },
		pagesAt: `${await server.pagesOrigin()}/review/`,
	});
	base = await server.serveFolder('review', out);
	// DSNR, standing in: the asks a key may make, answered as the extension answers them.
	gh = fakeGitHub();
	const threads = new ReviewThreads(tokenApi('good-token', gh.fetch), { owner: 'acme', repo: 'design' });
	server.answerAsks(async (key, raw) => {
		keys.push(key);
		const ask = readRelayAsk(raw);
		if (![KEY, OTHER_KEY].includes(key) || ask === null) return null;
		asked.push(ask.name);
		const [a, b, c, d] = ask.args as [never, never, never, never];
		const answers: Record<string, () => Promise<unknown> | unknown> = {
			signInState: () => ({ state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } }),
			readComments: () => threads.readComments(b),
			postComment: () => threads.postComment(a, b, c, d, null),
			// Address, as the extension answers it: the change made in a new version, which it names.
			address: () => (addressed.push(ask.args), 'v2'),
		};
		const value = await (answers[ask.name] ?? (() => null))();
		return { dsnr: 'answer', id: ask.id, result: { ok: true, value } };
	});
}, 120_000);
afterAll(() => {
	server.close();
	rmSync(root, { recursive: true, force: true });
});

/** Presses what is named `label` (an icon's button, a menu's item) in `at`, once there is one. */
const pressNamed = async (at: Page, label: string) => {
	const found = await at.waitForFunction(
		(l) =>
			[...document.querySelectorAll<HTMLElement>('[aria-label], [role="menuitem"]')].find((e) =>
				(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().startsWith(l),
			),
		{},
		label,
	);
	await (found.asElement() as Awaited<ReturnType<Page['$']>>)?.click();
};

/** Presses the button that says `text` in `at`, once there is one. */
const press = async (at: Page | Frame, text: string) => {
	const found = await at.waitForFunction((t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t), {}, text);
	await (found.asElement() as Awaited<ReturnType<Page['$']>>)?.click();
};

describe.skipIf(NO_CHROME)('a review opened in the browser from DSNR, in the real browser', () => {
	it('comments through DSNR with its key, no token of its own, and keeps the key when the page loads again', async () => {
		await inChrome(async (browser) => {
			const tab = await browser.newPage();
			await tab.goto(`${base}demo/v1/#dsnr-key-${KEY}`, { waitUntil: 'load' });
			// Signed in as DSNR in VS Code is: the bar offers Comment, and the key is out of the address, kept for this tab.
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			expect(tab.url()).toBe(`${base}demo/v1/`);
			expect(await tab.evaluate(() => sessionStorage.getItem('dsnr.review-key'))).toBe(KEY);
			expect(await tab.evaluate(() => Object.keys(localStorage))).toEqual([]);

			// A comment, made as a reviewer makes one: Comment, a click on the prototype, the words, Save.
			await press(tab, 'Comment');
			const page = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await page.waitForSelector('style[data-fd="pick"]');
			await page.click('h1');
			await tab.waitForSelector('.comment-box textarea');
			await tab.type('.comment-box textarea', 'Bigger, please');
			await press(tab, 'Save');
			const until = Date.now() + 20_000;
			while (!gh.issues[0]?.comments.length && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
			expect(gh.issues[0]?.comments.map((c) => c.body).join('\n')).toContain('Bigger, please');
			expect(asked).toContain('postComment');

			// Address, from the browser: asked of this page's own version, then the page goes to the one that has the change.
			await pressNamed(tab, 'Show all comments');
			// The box for a comment on the whole page, at the panel's foot, and its Send button: one height, as measured.
			const sizes = await tab.evaluate(() => {
				const high = (el: Element | null) => Math.round(el?.getBoundingClientRect().height ?? -1);
				return { box: high(document.querySelector('#general-comment')), send: high(document.querySelector('button[aria-label="Send"]')) };
			});
			expect(sizes.box).toBeGreaterThan(0);
			expect(sizes.send).toBe(sizes.box);
			expect(await tab.evaluate(() => (document.querySelector('#general-comment') as HTMLTextAreaElement).placeholder)).toBe('Post a comment…');
			await pressNamed(tab, 'Comment actions');
			await pressNamed(tab, 'Address');
			await tab.waitForFunction(() => location.pathname.endsWith('/v2/'));
			expect(addressed[0]?.[1]).toBe('prototype/demo/v1');
			const moved = await tab.waitForFrame((f) => f.url().endsWith('/v2/page.html'));
			await moved.waitForFunction(() => document.querySelector('h1')?.textContent === 'Alert history, addressed');
			// Still DSNR's there: the key kept for the tab, not in its address.
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			expect(tab.url()).not.toContain('dsnr-key');

			// Loaded again, with no key in its address (as moving to another version is): still DSNR's, the comment there.
			await tab.goto(`${base}demo/v1/`, { waitUntil: 'load' });
			const again = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await again.waitForFunction(() => document.querySelector('[data-fd-layer="pins"]')?.textContent === 'P');
		});
	}, 120_000);

	/** The hostile prototype's review, opened with its key: what the page managed, once it has tried it all. */
	const hostile = () =>
		inChrome(async (browser) => {
			const tab = await browser.newPage();
			let tried: Record<string, string> | null = null;
			tab.on('console', (m) => {
				if (m.text().startsWith('HOSTILE ')) tried = JSON.parse(m.text().slice('HOSTILE '.length));
			});
			// A second tab, opened with its own key, beside it.
			const other = await browser.newPage();
			await other.goto(`${base}demo/v1/#dsnr-key-${OTHER_KEY}`, { waitUntil: 'load' });
			await tab.goto(`${base}hostile/v1/#dsnr-key-${KEY}`, { waitUntil: 'load' });
			const until = Date.now() + 20_000;
			while (tried === null && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
			// The bar beside it still asks DSNR with its key, and is answered.
			for (const t of [tab, other])
				await t.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			const kept = await Promise.all([tab, other].map((t) => t.evaluate(() => sessionStorage.getItem('dsnr.review-key'))));
			return { tried: tried as Record<string, string> | null, kept };
		});

	it('a hostile prototype in it cannot learn the key or ask without it, and the bar and a second tab still ask with their own', async () => {
		const before = { keys: keys.length, addressed: addressed.length };
		const r = await hostile();
		expect(r.tried).toMatchObject({
			'read the key': 'blocked',
			'read the bar address': 'blocked',
			'ask with no key': 'blocked',
			'ask with a guessed key': 'blocked',
			// Sent, but nothing of the answer can be read, and DSNR is not asked (below).
			'ask unread': 'allowed: opaque',
		});
		expect(r.tried?.referrer).not.toContain(KEY);
		// Each tab keeps its own key, and only those two keys reached DSNR: none the page made, and no Address.
		expect(r.kept).toEqual([KEY, OTHER_KEY]);
		const reached = keys.slice(before.keys);
		expect(reached).toContain(KEY);
		expect(reached).toContain(OTHER_KEY);
		expect(reached.filter((k) => k !== KEY && k !== OTHER_KEY)).toEqual([]);
		expect(addressed.length).toBe(before.addressed);
	}, 120_000);
});
