import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Frame, HTTPRequest, Page } from 'puppeteer-core';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSite } from '../src/site/buildSite';
import { serveSite } from '../src/site/serveSite';
import { fakeGitHub } from './pageHarness';
import { NO_CHROME, inChrome } from './realChrome';

/**
 * Signing in to comment on the published site, in the real browser (PUBLISHED_COMMENTS_PLAN, Phase 3): the real viewer on
 * the real site build, the prototype sandboxed with no origin of its own. GitHub's sign-in page, the sign-in function and
 * GitHub's API are stand-ins: the sign-in page sends the person back with a one-time code, the function trades it only for
 * the verifier whose hash the page sent, and the API answers as GitHub's does. A person signs in, comments, signs out; one
 * GitHub will not show the repository is told so.
 */

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Alert history</title></head>
<body><main><h1>Alert history</h1><button data-e2e-ref="clear-filter-button">Clear Filter</button></main></body></html>`;

let root: string;
let site: Server;
let base: string;
let fake: Server;
let fakeAt: string;
let gh: ReturnType<typeof fakeGitHub>;
/** Who the stand-in sign-in page signs the next person in as: a token GitHub knows, or one it will show nothing to. */
let next: 'good-token' | 'outsider-token' = 'good-token';
const challenges = new Map<string, string>();
const exchanged: unknown[] = [];

const htmlFiles = (dir: string): string[] =>
	readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? htmlFiles(join(dir, n)) : n.endsWith('.html') ? [join(dir, n)] : []));
const base64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'dsnr-sign-in-'));
	const viewer = join(root, 'viewer');
	await build({ configFile: resolve(__dirname, '../viewer.vite.config.ts'), build: { outDir: viewer, emptyOutDir: true }, logLevel: 'silent' });
	const design = join(root, 'flock-designer');
	mkdirSync(join(design, 'projects', 'demo', 'prototypes'), { recursive: true });
	writeFileSync(join(design, 'projects', 'demo', 'brief.md'), '# Demo\n');
	writeFileSync(
		join(design, 'projects', 'demo', 'work.json'),
		JSON.stringify([{ projectId: 'demo', name: 'v1', branch: 'prototype/demo/v1', commit: null, note: '', createdAt: '2026-10-01T10:00:00Z' }]),
	);
	writeFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1.html'), PAGE);

	// GitHub's sign-in page and the sign-in function, standing in.
	fake = createServer((req, res) => {
		const at = new URL(req.url ?? '/', 'http://x');
		if (at.pathname === '/authorize') {
			const code = `code-${challenges.size + 1}`;
			challenges.set(code, at.searchParams.get('code_challenge') ?? '');
			const back = new URL(at.searchParams.get('redirect_uri') ?? '');
			back.searchParams.set('code', code);
			back.searchParams.set('state', at.searchParams.get('state') ?? '');
			return void res.writeHead(302, { location: back.toString() }).end();
		}
		const cors = { 'access-control-allow-origin': base.replace(/\/$/, ''), 'access-control-allow-headers': 'content-type' };
		if (at.pathname === '/exchange' && req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
		if (at.pathname === '/exchange' && req.method === 'POST') {
			let body = '';
			req.on('data', (c) => (body += c));
			req.on('end', () => {
				const { code, verifier } = JSON.parse(body) as { code: string; verifier: string };
				exchanged.push(Object.keys(JSON.parse(body)).sort());
				// Only the verifier whose hash the page sent GitHub turns the code into a token.
				const ok = challenges.get(code) === base64url(createHash('sha256').update(verifier).digest());
				res
					.writeHead(ok ? 200 : 400, { ...cors, 'content-type': 'application/json' })
					.end(JSON.stringify(ok ? { access_token: next } : { error: 'refused' }));
			});
			return;
		}
		res.writeHead(404).end();
	});
	await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
	fakeAt = `http://auth.test:${(fake.address() as AddressInfo).port}`;

	const out = join(root, 'site');
	buildSite({
		designRoot: design,
		outDir: out,
		viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } },
		signIn: { clientId: 'Iv-test', exchange: `${fakeAt}/exchange` },
	});
	const served = await serveSite(out);
	site = served.server;
	// Not on this machine's own name: a page served from this machine is one DSNR opened, which signs in through DSNR.
	base = served.url.replace('127.0.0.1', 'site.test');
	// The site is served here, not at acme.github.io: its own address, and GitHub's sign-in page standing in.
	for (const file of htmlFiles(out))
		writeFileSync(
			file,
			readFileSync(file, 'utf8')
				.replace('https://acme.github.io/design/', base)
				.replace('https://github.com/login/oauth/authorize', `${fakeAt}/authorize`),
		);
	gh = fakeGitHub();
}, 120_000);
afterAll(async () => {
	await new Promise((r) => site.close(r));
	await new Promise((r) => fake.close(r));
	rmSync(root, { recursive: true, force: true });
});

/** GitHub's API, as the page calls it, answered by the stand-in; a person it will show nothing has a name and no repository. */
const answerGitHub = async (tab: Page) => {
	await tab.setRequestInterception(true);
	tab.on('request', (req: HTTPRequest) => {
		if (!req.url().startsWith('https://api.github.com')) return void req.continue();
		// As GitHub answers a browser: anyone may ask, with whatever headers it asks to send.
		const cors = {
			'access-control-allow-origin': '*',
			'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*',
			'access-control-allow-methods': 'GET, POST, PATCH, DELETE',
			'access-control-expose-headers': 'etag, link, x-ratelimit-remaining, x-ratelimit-reset',
		};
		if (req.method() === 'OPTIONS') return void req.respond({ status: 204, headers: cors });
		const auth = req.headers().authorization ?? '';
		if (auth.endsWith('outsider-token')) {
			const user = req.url().split('?')[0]?.endsWith('/user');
			return void req.respond({
				status: user ? 200 : 404,
				headers: cors,
				contentType: 'application/json',
				body: JSON.stringify(user ? { login: 'outsider' } : { message: 'Not Found' }),
			});
		}
		void gh
			.fetch(req.url(), { method: req.method(), headers: { Authorization: auth }, body: req.postData() })
			.then(async (r) => req.respond({ status: r.status, headers: cors, contentType: 'application/json', body: await r.text() }));
	});
};

/** Chrome, told the stand-ins' names are this machine, and that they are secure, as GitHub Pages and GitHub are (Web Crypto needs it). */
const chrome = () => [
	'--host-resolver-rules=MAP site.test 127.0.0.1, MAP auth.test 127.0.0.1',
	`--unsafely-treat-insecure-origin-as-secure=${base.replace(/\/$/, '')},${fakeAt}`,
];

const press = async (at: Page | Frame, text: string) => {
	const found = await at.waitForFunction((t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t), {}, text);
	await (found.asElement() as Awaited<ReturnType<Page['$']>>)?.click();
};
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

describe.skipIf(NO_CHROME)('signing in to comment on the published site, in the real browser', () => {
	it('signs a person in with GitHub, comments as them, and signs them out', async () => {
		next = 'good-token';
		await inChrome(async (browser) => {
			const tab = await browser.newPage();
			await answerGitHub(tab);
			const page = `${base}demo/v1/`;
			await tab.goto(page, { waitUntil: 'load' });
			await press(tab, 'Sign in to comment');
			// Through GitHub's sign-in page and the site's front page, and back to the page it started on, signed in.
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Comment'), { timeout: 20_000 });
			expect(tab.url()).toBe(page);
			expect(await tab.evaluate(() => localStorage.getItem('dsnr.github-token'))).toBe('good-token');
			expect(await tab.evaluate(() => sessionStorage.getItem('dsnr.sign-in'))).toBeNull();
			// The function was sent the code and the verifier, and nothing else.
			expect(exchanged.at(-1)).toEqual(['code', 'verifier']);

			// A comment, as a reviewer makes one.
			await press(tab, 'Comment');
			const frame = tab.frames().find((f) => f.url().endsWith('page.html')) as Frame;
			await frame.waitForSelector('style[data-fd="pick"]');
			await frame.click('h1');
			await tab.waitForSelector('#comment-draft');
			await tab.type('#comment-draft', 'Bigger, please');
			await press(tab, 'Save');
			const until = Date.now() + 20_000;
			while (!gh.issues[0]?.comments.length && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
			expect(gh.issues[0]?.comments[0]).toMatchObject({ user: { login: 'pat' } });
			expect(gh.issues[0]?.comments[0]?.body).toContain('Bigger, please');

			// Who, as their picture at the end of the bar; and Sign out in its menu, which forgets the token.
			await pressNamed(tab, 'Signed in as pat');
			await tab.waitForFunction(() => document.querySelector('[data-signed-in-as]')?.textContent === 'Pat Brennanpat');
			await pressNamed(tab, 'Sign out');
			await tab.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Sign in to comment'));
			expect(await tab.evaluate(() => localStorage.getItem('dsnr.github-token'))).toBeNull();
		}, chrome());
	}, 120_000);

	it('tells a person GitHub will not show the repository who they are signed in as', async () => {
		next = 'outsider-token';
		await inChrome(async (browser) => {
			const tab = await browser.newPage();
			await answerGitHub(tab);
			await tab.goto(`${base}demo/v1/`, { waitUntil: 'load' });
			await press(tab, 'Sign in to comment');
			await tab.waitForFunction(() => document.body.textContent?.includes('Signed in as outsider, who has no access to acme/design'), {
				timeout: 20_000,
			});
		}, chrome());
	}, 120_000);
});
