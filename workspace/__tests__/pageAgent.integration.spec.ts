import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import PAGE_AGENT from '../src/page/agentMain?page';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { SANDBOX_APART, SANDBOX_BESIDE } from '../src/site/buildSite';

/** The README's Review isolation: the bar's driver (`framePage`) and the page's agent talk only by message. */

const PAGE = `<!doctype html><html lang="en"><head><script src="/agent.js"></script><meta charset="utf-8"><title>Alert history</title></head>
<body style="margin:0;font:16px sans-serif"><script>
// As a design system may, as it loads: its storage and a cookie. With no origin of its own these are the agent's stand-ins.
localStorage.setItem('seen', '1'); sessionStorage.setItem('tab', '2'); document.cookie = 'c=3';
document.body.dataset.kept = localStorage.getItem('seen') + sessionStorage.getItem('tab') + document.cookie;
</script><main><h1>Alert history</h1>
<button data-e2e-ref="clear-filter-button" style="margin:40px;padding:12px">Clear Filter</button></main></body></html>`;
/** With no `pagesAt`, the prototype is beside it with no origin of its own (the published site); with one, apart (VS Code). */
const BAR = (pagesAt = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bar</title></head>
<body style="margin:0"><iframe id="dsnr-frame" src="${pagesAt}/review/alpha/v1/page.html" sandbox="${pagesAt ? SANDBOX_APART : SANDBOX_BESIDE}" style="width:800px;height:600px;border:0"></iframe>
<script src="/bar.js"></script></body></html>`;

let server: Server;
let pages: Server;
let base: string;
let pagesAt: string;
let bar: string;
beforeAll(async () => {
	const built = await build({
		stdin: {
			contents: `import { framePage } from './src/viewer/browserAdapter'; window.framePage = framePage;`,
			resolveDir: join(__dirname, '..'),
			loader: 'ts',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		logLevel: 'silent',
	});
	bar = built.outputFiles[0]?.text ?? '';
	server = createServer((req, res) => {
		const path = (req.url ?? '/').split('?')[0] as string;
		const [type, body] =
			path === '/bar.html'
				? ['text/html', BAR()]
				: path === '/bar-apart.html'
					? ['text/html', BAR(pagesAt)]
					: path === '/review/alpha/v1/page.html'
						? ['text/html', PAGE]
						: path === '/agent.js'
							? ['text/javascript', PAGE_AGENT]
							: path === '/bar.js'
								? ['text/javascript', bar]
								: ['text/plain', ''];
		res.writeHead(body ? 200 : 404, { 'content-type': type }).end(body);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	// The same page and agent, on another origin than the bar.
	pages = createServer((req, res) => {
		const path = (req.url ?? '/').split('?')[0] as string;
		const [type, body] =
			path === '/review/alpha/v1/page.html' ? ['text/html', PAGE] : path === '/agent.js' ? ['text/javascript', PAGE_AGENT] : ['text/plain', ''];
		res.writeHead(body ? 200 : 404, { 'content-type': type }).end(body);
	});
	await new Promise<void>((r) => pages.listen(0, '127.0.0.1', r));
	pagesAt = `http://127.0.0.1:${(pages.address() as AddressInfo).port}`;
});
afterAll(async () => {
	await new Promise((r) => server.close(r));
	await new Promise((r) => pages.close(r));
});

describe.skipIf(NO_CHROME)('the bar and the page, by message, in the real browser', () => {
	it.each([
		['beside its bar with no origin of its own (the published site)', '/bar.html'],
		['on the pages’ own address, sandboxed (VS Code)', '/bar-apart.html'],
	])(
		'picks a spot, draws its pin, hears the pin clicked and the route move, the page %s',
		async (_where, at) => {
			await inChrome(async (browser) => {
				const tab = await browser.newPage(OWN_WINDOW);
				await tab.goto(`${base}${at}`, { waitUntil: 'load' });
				const route = await tab.evaluate(
					() =>
						new Promise<string>((resolve) => {
							const w = window as unknown as { framePage: (f: HTMLIFrameElement) => unknown; page: any; heard: unknown[] };
							w.heard = [];
							w.page = w.framePage(document.getElementById('dsnr-frame') as HTMLIFrameElement);
							w.page.onPinEvent((e: unknown) => w.heard.push(e));
							w.page.onRoute((r: string) => w.heard.push({ route: r }));
							w.page.onReady(resolve);
						}),
				);
				expect(route).toBe('/review/alpha/v1/page.html');
				const page = tab.frames().find((f) => f.url().endsWith('page.html'));
				expect(await page?.evaluate(() => document.body.dataset.kept)).toBe('12c=3');

				await tab.evaluate(() => void ((window as any).picking = (window as any).page.pick()));
				const frame = tab.frames().find((f) => f.url().endsWith('page.html'));
				if (!frame) throw new Error('the prototype’s frame is not on the tab');
				// Pick mode is on once the page has its crosshair.
				await frame.waitForSelector('style[data-fd="pick"]');
				await frame.click('button');
				const picked = await tab.evaluate(() => (window as any).picking);
				expect(picked.ok).toBe(true);
				expect(picked.value.anchor).toMatchObject({ route: '/', selector: '[data-e2e-ref="clear-filter-button"]', nearbyText: 'Clear Filter' });

				const drawn = await tab.evaluate(
					(anchor) => (window as any).page.showMarkers([{ id: 7, author: 'noah', avatarUrl: null, anchor, movable: false }]),
					picked.value.anchor,
				);
				expect(drawn).toEqual({ ok: true, value: [{ id: 7, state: 'found' }] });
				const pin = '[data-fd-layer="pins"] > div > div';
				expect(await frame.$eval(pin, (el) => el.textContent)).toBe('N');
				await frame.click(pin);
				await frame.evaluate(() => void (location.hash = '#/other'));
				await tab.waitForFunction(() => (window as any).heard.some((h: { route?: string }) => h.route?.endsWith('#/other')));
				const heard = await tab.evaluate(() => (window as any).heard);
				expect(heard).toContainEqual({ kind: 'click', id: 7 });
				expect(heard).toContainEqual({ route: '/review/alpha/v1/page.html#/other' });
			});
		},
		60_000,
	);
});
