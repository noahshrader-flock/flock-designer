import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromeHeadless, findChrome } from '../src/main/services/chromeHeadless';
import { COVER_BUDGET } from '../src/main/services/projectCovers';

/**
 * The headless port with the browser on this machine (4.4): a real picture and a real check of real pages, served from
 * this machine as prototypes are. Skipped where there is no Chrome, Edge or Chromium.
 */

const PAGES: Record<string, string> = {
	'/page.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A page</title></head>
<body style="margin:0;font:16px sans-serif"><main><h1 style="background:#123;color:#fff;padding:40px">Alert history</h1>
<p style="padding:40px">Every alert from the last day, by camera.</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`,
	'/blank.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Blank</title></head><body></body></html>',
};

let server: Server;
let base: string;
const headless = chromeHeadless();
beforeAll(async () => {
	server = createServer((req, res) => {
		const page = PAGES[(req.url ?? '').split('?')[0] as string];
		res.writeHead(page ? 200 : 404, { 'content-type': 'text/html' }).end(page ?? 'Not found');
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
	await headless.close();
	await new Promise((r) => server.close(r));
});

describe.skipIf(findChrome() === null)('with the browser on this machine', () => {
	it('draws a page as a JPEG within the cover’s budget, and gives a blank page none', async () => {
		const picture = await headless.draw(`${base}/page.html`);
		expect(picture?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
		expect(picture!.length).toBeLessThanOrEqual(COVER_BUDGET);
		expect(await headless.draw(`${base}/blank.html`)).toBeNull();
	}, 60_000);

	it('checks a page with axe, finding what is wrong with it', async () => {
		const [run] = await headless.scan(`${base}/page.html`, [], ['wcag2a']);
		expect(run?.state).toBe('default');
		expect(run?.violations.map((v) => v.id)).toContain('image-alt');
	}, 60_000);
});
