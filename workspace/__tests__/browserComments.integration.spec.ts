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
import { BOX_OFFSET } from '../src/viewer/comments/CommentBox';
import { fakeGitHubFetch } from './pageHarness';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';

/**
 * The server will not serve a prototype on the bar's address, so the hostile case's failing case is a mutation: with that
 * refusal taken out and the page framed from there, the same page reads the key.
 */

const KEY = 'AbC-_x9yZAbC-_x9yZAbCd';
const OTHER_KEY = 'ZzY-_k3wXZzY-_k3wXZzYw';
const GUESSED = 'GuE-_s5sSGuE-_s5sSGuEs';
/** A guessed key makes the browser ask the server first; a `no-cors` request is sent, but its answer cannot be read. */
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

/** Taller than the window, so a pin can be put low on it, and on it scrolled. */
const LONG = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Long</title></head><body style="margin:0"><main>${Array.from(
	{ length: 24 },
	(_, i) =>
		`<section id="s${i + 1}" style="border-bottom:1px solid #ccc"><h2>Section ${i + 1}</h2><p>${'Words that wrap differently as the page narrows. '.repeat(8)}</p></section>`,
).join('')}</main></body></html>`;

let root: string;
let server: PrototypeServer;
let base: string;
let gh: ReturnType<typeof fakeGitHubFetch>;
const asked: string[] = [];
const keys: string[] = [];
const addressed: unknown[][] = [];

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-browser-'));
	const viewer = join(root, 'viewer');
	await build({ configFile: resolve(__dirname, '../viewer.vite.config.ts'), build: { outDir: viewer, emptyOutDir: true }, logLevel: 'silent' });
	const design = join(root, 'flock-designer');
	mkdirSync(join(design, 'projects', 'demo', 'prototypes'), { recursive: true });
	writeFileSync(join(design, 'projects', 'demo', 'brief.md'), '# Demo\n');
	writeFileSync(
		join(design, 'projects', 'demo', 'work.json'),
		JSON.stringify(
			['v1'].map((name, i) => ({
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
	mkdirSync(join(design, 'projects', 'hostile', 'prototypes'), { recursive: true });
	writeFileSync(join(design, 'projects', 'hostile', 'brief.md'), '# Hostile\n');
	writeFileSync(
		join(design, 'projects', 'hostile', 'work.json'),
		JSON.stringify([{ projectId: 'hostile', name: 'v1', branch: 'prototype/hostile/v1', commit: null, note: '', createdAt: '2026-10-01T10:00:00Z' }]),
	);
	writeFileSync(join(design, 'projects', 'hostile', 'prototypes', 'v1.html'), HOSTILE);
	mkdirSync(join(design, 'projects', 'long', 'prototypes'), { recursive: true });
	writeFileSync(join(design, 'projects', 'long', 'brief.md'), '# Long\n');
	writeFileSync(
		join(design, 'projects', 'long', 'work.json'),
		JSON.stringify([{ projectId: 'long', name: 'v1', branch: 'prototype/long/v1', commit: null, note: '', createdAt: '2026-10-01T10:00:00Z' }]),
	);
	writeFileSync(join(design, 'projects', 'long', 'prototypes', 'v1.html'), LONG);
	server = new PrototypeServer();
	const out = join(root, 'site');
	buildSite({
		designRoot: design,
		outDir: out,
		viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } },
		pagesAt: `${await server.pagesOrigin()}/review/`,
	});
	base = await server.serveFolder('review', out);
	gh = fakeGitHubFetch();
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
			address: () => void addressed.push(ask.args),
		};
		const value = await (answers[ask.name] ?? (() => null))();
		return { dsnr: 'answer', id: ask.id, result: { ok: true, value } };
	});
}, 120_000);
afterAll(() => {
	server.close();
	rmSync(root, { recursive: true, force: true });
});

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

const press = async (at: Page | Frame, text: string) => {
	const found = await at.waitForFunction((t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t), {}, text);
	await (found.asElement() as Awaited<ReturnType<Page['$']>>)?.click();
};

/**
 * The comment box's corner against the new pin's tip, in the window, once it has come to rest beside it (`BOX_OFFSET`). The
 * page places its pins on its next frames, after a scroll; only then is the box waited for, which follows by message.
 */
const besidePin = async (tab: Page, page: Frame) => {
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	const apart = async () => {
		const tip = await page.evaluate(() => {
			const last = [...document.querySelectorAll<HTMLElement>('[data-fd-layer="pins"] > div')].at(-1)!;
			return { x: parseFloat(last.style.left), y: parseFloat(last.style.top) };
		});
		return tab.evaluate((at) => {
			const frame = document.querySelector('iframe')!.getBoundingClientRect();
			const box = document.querySelector('.comment-box')!.getBoundingClientRect();
			return { x: Math.round(box.left - (frame.left + at.x)), y: Math.round(box.top - (frame.top + at.y)) };
		}, tip);
	};
	const until = Date.now() + 5_000;
	let at = await apart();
	while ((at.x !== BOX_OFFSET.x || at.y !== BOX_OFFSET.y) && Date.now() < until) {
		await new Promise((r) => setTimeout(r, 50));
		at = await apart();
	}
	return at;
};

describe.skipIf(NO_CHROME)('a review opened in the browser from DSNR, in the real browser', () => {
	it('comments through DSNR with its key, no token of its own, and keeps the key when the page loads again', async () => {
		await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.goto(`${base}demo/v1/#dsnr-key-${KEY}`, { waitUntil: 'load' });
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			expect(tab.url()).toBe(`${base}demo/v1/`);
			expect(await tab.evaluate(() => sessionStorage.getItem('dsnr.review-key'))).toBe(KEY);
			expect(await tab.evaluate(() => Object.keys(localStorage))).toEqual([]);

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

			await pressNamed(tab, 'Show all comments');
			const sizes = await tab.evaluate(() => {
				const high = (el: Element | null) => Math.round(el?.getBoundingClientRect().height ?? -1);
				return { box: high(document.querySelector('#general-comment')), send: high(document.querySelector('button[aria-label="Send"]')) };
			});
			expect(sizes.box).toBeGreaterThan(0);
			expect(sizes.send).toBe(sizes.box);
			expect(await tab.evaluate(() => (document.querySelector('#general-comment') as HTMLTextAreaElement).placeholder)).toBe('Post a comment…');
			await pressNamed(tab, 'Comment actions');
			// Address hands the comment to the agent's window, on this page's version; the page stays where it is.
			await pressNamed(tab, 'Address');
			const handed = Date.now() + 20_000;
			while (!addressed.length && Date.now() < handed) await new Promise((r) => setTimeout(r, 50));
			expect(addressed[0]?.[1]).toBe('prototype/demo/v1');
			expect(tab.url()).toBe(`${base}demo/v1/`);

			await tab.goto(`${base}demo/v1/`, { waitUntil: 'load' });
			const again = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await again.waitForFunction(() => document.querySelector('[data-fd-layer="pins"]')?.textContent === 'P');
		});
	}, 120_000);

	it('moves the comment box by its handle, however fast, and opens the next at its pin', async () => {
		await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 1280, height: 800 });
			await tab.goto(`${base}demo/v1/#dsnr-key-${KEY}`, { waitUntil: 'load' });
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			await press(tab, 'Comment');
			const page = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await page.waitForSelector('style[data-fd="pick"]');
			const box = () =>
				tab.evaluate(() => {
					const r = document.querySelector('.comment-box')!.getBoundingClientRect();
					return { left: r.left, top: r.top, width: r.width, height: r.height };
				});
			await page.click('h1');
			await tab.waitForSelector('.comment-box textarea');
			expect(await besidePin(tab, page)).toEqual(BOX_OFFSET);
			const opened = await box();

			// One jump, far off the handle: it is the handle's hold on the pointer that carries the box there.
			const grip = (await (await tab.$('.comment-grip'))!.boundingBox())!;
			await tab.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
			await tab.mouse.down();
			await tab.mouse.move(grip.x + grip.width / 2 + 120, grip.y + grip.height / 2 + 60);
			await tab.mouse.up();
			const moved = await box();
			expect(Math.round(moved.left - opened.left)).toBe(120);
			expect(Math.round(moved.top - opened.top)).toBe(60);
			// It stays a box of the same size, and what is in it is untouched by the move.
			expect(Math.round(moved.width)).toBe(Math.round(opened.width));
			expect(await tab.evaluate(() => document.querySelector('.comment-box textarea') !== null)).toBe(true);

			// Out past the window's edge it is stopped, with its handle in reach.
			await tab.mouse.move(grip.x + grip.width / 2 + 120, grip.y + grip.height / 2 + 60);
			await tab.mouse.down();
			await tab.mouse.move(5000, 5000, { steps: 4 });
			await tab.mouse.up();
			const edge = await box();
			const size = await tab.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
			expect(Math.round(edge.left + edge.width)).toBeLessThanOrEqual(size.w);
			expect(Math.round(edge.top)).toBeLessThan(size.h);

			// Cancelled (Escape: the box's own buttons are past the edge now) and clicked again, the next opens where the first did.
			await tab.keyboard.press('Escape');
			await page.click('h1');
			await tab.waitForSelector('.comment-box textarea');
			expect(await besidePin(tab, page)).toEqual(BOX_OFFSET);
		});
	}, 120_000);

	it('keeps the comment box beside its pin wherever on the page it is put, and as the page moves under it', async () => {
		await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 1280, height: 800 });
			await tab.goto(`${base}long/v1/#dsnr-key-${KEY}`, { waitUntil: 'load' });
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'));
			await press(tab, 'Comment');
			const page = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await page.waitForSelector('style[data-fd="pick"]');
			const put = async (selector: string) => {
				await page.click(selector);
				await tab.waitForSelector('.comment-box textarea');
				const said = await besidePin(tab, page);
				await tab.keyboard.press('Escape');
				await tab.waitForFunction(() => !document.querySelector('.comment-box'));
				return said;
			};
			const tall = await page.evaluate(() => [window.innerHeight, document.documentElement.scrollHeight]);
			expect(tall[1]).toBeGreaterThan(tall[0]! * 1.5);
			expect(await put('#s1 h2')).toEqual(BOX_OFFSET);
			expect(await put('#s5 h2')).toEqual(BOX_OFFSET);
			await page.evaluate(() => window.scrollTo(0, 900));
			expect(await put('#s12 h2')).toEqual(BOX_OFFSET);

			// The page moving under an open box (here scrolled; in VS Code it has moved on its own): the box goes with the pin.
			await page.click('#s14 h2');
			await tab.waitForSelector('.comment-box textarea');
			// Up, which a page scrolled this far can always go, and checked: a page that did not move would prove nothing.
			const moved = await page.evaluate(() => {
				const was = scrollY;
				window.scrollBy(0, -150);
				return was - scrollY;
			});
			expect(moved).toBe(150);
			expect(await besidePin(tab, page)).toEqual(BOX_OFFSET);
		});
	}, 120_000);

	const hostile = () =>
		inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			let tried: Record<string, string> | null = null;
			tab.on('console', (m) => {
				if (m.text().startsWith('HOSTILE ')) tried = JSON.parse(m.text().slice('HOSTILE '.length));
			});
			const other = await browser.newPage(OWN_WINDOW);
			await other.goto(`${base}demo/v1/#dsnr-key-${OTHER_KEY}`, { waitUntil: 'load' });
			await tab.goto(`${base}hostile/v1/#dsnr-key-${KEY}`, { waitUntil: 'load' });
			const until = Date.now() + 20_000;
			while (tried === null && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
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
		expect(r.kept).toEqual([KEY, OTHER_KEY]);
		const reached = keys.slice(before.keys);
		expect(reached).toContain(KEY);
		expect(reached).toContain(OTHER_KEY);
		expect(reached.filter((k) => k !== KEY && k !== OTHER_KEY)).toEqual([]);
		expect(addressed.length).toBe(before.addressed);
	}, 120_000);
});
