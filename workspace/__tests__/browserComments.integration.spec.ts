import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Frame, Page } from 'puppeteer-core';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReviewThreads } from '../src/host/reviewThreads';
import { PrototypeServer } from '../src/main/services/prototypeServer';
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
 */

const KEY = 'AbC-_x9yZAbC-_x9yZAbCd';
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Alert history</title></head>
<body><main><h1>Alert history</h1><button data-e2e-ref="clear-filter-button">Clear Filter</button></main></body></html>`;

let root: string;
let server: PrototypeServer;
let base: string;
let gh: ReturnType<typeof fakeGitHub>;
const asked: string[] = [];
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
		join(design, 'projects', 'demo', 'iterations.json'),
		JSON.stringify(
			['v1-i1', 'v1-i2'].map((name, i) => ({
				projectId: 'demo',
				name,
				branch: `prototype/demo/${name}`,
				commit: null,
				note: '',
				createdAt: `2026-10-0${i + 1}T10:00:00Z`,
			})),
		),
	);
	writeFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1-i1.html'), PAGE);
	writeFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1-i2.html'), PAGE.replace('Alert history</h1>', 'Alert history, addressed</h1>'));
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
		const ask = readRelayAsk(raw);
		if (key !== KEY || ask === null) return null;
		asked.push(ask.name);
		const [a, b, c, d] = ask.args as [never, never, never, never];
		const answers: Record<string, () => Promise<unknown> | unknown> = {
			signInState: () => ({ state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } }),
			readComments: () => threads.readComments(b),
			postComment: () => threads.postComment(a, b, c, d, null),
			// Address, as the extension answers it: the change made in the next iteration, which it names.
			address: () => (addressed.push(ask.args), 'v1-i2'),
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
			await tab.goto(`${base}demo/v1/i1/#dsnr-key-${KEY}`, { waitUntil: 'load' });
			// Signed in as DSNR in VS Code is: the bar offers Comment, and the key is out of the address, kept for this tab.
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			expect(tab.url()).toBe(`${base}demo/v1/i1/`);
			expect(await tab.evaluate(() => sessionStorage.getItem('dsnr.review-key'))).toBe(KEY);
			expect(await tab.evaluate(() => Object.keys(localStorage))).toEqual([]);

			// A comment, made as a reviewer makes one: Comment, a click on the prototype, the words, Save.
			await press(tab, 'Comment');
			const page = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await page.waitForSelector('style[data-fd="pick"]');
			await page.click('h1');
			await tab.waitForSelector('#comment-draft');
			await tab.type('#comment-draft', 'Bigger, please');
			await press(tab, 'Save');
			const until = Date.now() + 20_000;
			while (!gh.issues[0]?.comments.length && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
			expect(gh.issues[0]?.comments.map((c) => c.body).join('\n')).toContain('Bigger, please');
			expect(asked).toContain('postComment');

			// Address, from the browser: asked of this page's own iteration, then the page goes to the one that has the change.
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
			await tab.waitForFunction(() => location.pathname.endsWith('/v1/i2/'));
			expect(addressed[0]?.[1]).toBe('prototype/demo/v1-i1');
			const moved = await tab.waitForFrame((f) => f.url().endsWith('/v1/i2/page.html'));
			await moved.waitForFunction(() => document.querySelector('h1')?.textContent === 'Alert history, addressed');
			// Still DSNR's there: the key kept for the tab, not in its address.
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			expect(tab.url()).not.toContain('dsnr-key');

			// Loaded again, with no key in its address (as moving to another iteration is): still DSNR's, the comment there.
			await tab.goto(`${base}demo/v1/i1/`, { waitUntil: 'load' });
			const again = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await again.waitForFunction(() => document.querySelector('[data-fd-layer="pins"]')?.textContent === 'P');
		});
	}, 120_000);
});
