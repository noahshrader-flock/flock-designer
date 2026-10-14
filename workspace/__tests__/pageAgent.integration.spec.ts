import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import PAGE_AGENT from '../src/page/agentMain?page';
import { findChrome } from '../src/main/services/chromeHeadless';

/**
 * The review bar and a prototype's page, talking by message in the real browser (REVIEW_ISOLATION_PLAN 1.4): the bar's
 * own driver (`framePage`) and the page's own agent, as the site builds them, served from this machine. A pick made by a
 * click, its pin drawn, the pin clicked, and the page's route moving, all without the bar reaching into the page.
 */

const PAGE = `<!doctype html><html lang="en"><head><script src="/agent.js"></script><meta charset="utf-8"><title>Alert history</title></head>
<body style="margin:0;font:16px sans-serif"><main><h1>Alert history</h1>
<button data-e2e-ref="clear-filter-button" style="margin:40px;padding:12px">Clear Filter</button></main></body></html>`;
const BAR = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bar</title></head>
<body style="margin:0"><iframe id="dsnr-frame" src="/review/alpha/v1/i1/page.html" style="width:800px;height:600px;border:0"></iframe>
<script src="/bar.js"></script></body></html>`;

let server: Server;
let base: string;
let bar: string;
beforeAll(async () => {
	// The bar's driver, as the viewer carries it.
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
				? ['text/html', BAR]
				: path === '/review/alpha/v1/i1/page.html'
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
});
afterAll(async () => new Promise((r) => server.close(r)));

describe.skipIf(findChrome() === null)('the bar and the page, by message, in the real browser', () => {
	it('picks a spot, draws its pin, hears the pin clicked and the route move, never reaching into the page', async () => {
		const { default: puppeteer } = await import('puppeteer-core');
		const browser = await puppeteer.launch({ executablePath: findChrome() as string, headless: true });
		try {
			const tab = await browser.newPage();
			await tab.goto(`${base}/bar.html`, { waitUntil: 'load' });
			// The bar's driver on its frame, and what it hears.
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
			expect(route).toBe('/review/alpha/v1/i1/page.html');

			// A pick, made by a click on the page.
			await tab.evaluate(() => void ((window as any).picking = (window as any).page.pick()));
			const frame = tab.frames().find((f) => f.url().endsWith('page.html'));
			await new Promise((r) => setTimeout(r, 200));
			await frame?.click('button');
			const picked = await tab.evaluate(() => (window as any).picking);
			expect(picked.ok).toBe(true);
			expect(picked.value.anchor).toMatchObject({ route: '/', selector: '[data-e2e-ref="clear-filter-button"]', nearbyText: 'Clear Filter' });

			// Its pin drawn on the page, where the click was, and heard when it is clicked.
			const drawn = await tab.evaluate(
				(anchor) => (window as any).page.showMarkers([{ id: 7, number: 1, anchor, draft: false, movable: false, resolved: false }]),
				picked.value.anchor,
			);
			expect(drawn).toEqual({ ok: true, value: [{ id: 7, state: 'found' }] });
			// The pin: a teardrop on its own layer, over the page (`pins.ts`), numbered as asked.
			const pin = '[data-fd-layer="pins"] > div > div';
			expect(await frame?.$eval(pin, (el) => el.textContent)).toBe('1');
			await frame?.click(pin);
			// The page's route moving within it.
			await frame?.evaluate(() => void (location.hash = '#/other'));
			await new Promise((r) => setTimeout(r, 300));
			const heard = await tab.evaluate(() => (window as any).heard);
			expect(heard).toContainEqual({ kind: 'click', id: 7 });
			expect(heard).toContainEqual({ route: '/review/alpha/v1/i1/page.html#/other' });
		} finally {
			await browser.close();
		}
	}, 60_000);
});
