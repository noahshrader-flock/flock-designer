import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromeHeadless, composedPicture, findChrome, pictureOf } from '../src/main/services/chromeHeadless';
import { COVER_BUDGET } from '../src/main/services/projectCovers';
import { readDrawn } from '../src/main/services/storyDrawing';
import { inChrome } from './realChrome';

/**
 * The headless port with the browser on this machine (4.4): a real picture and a real check of real pages, served from
 * this machine as prototypes are. Skipped where there is no Chrome, Edge or Chromium.
 */

/**
 * A preview page as the builds' is (white, padded, the stories in `#root`, each with its name), drawing one story file of
 * each kind a picture has to get right: small at the top left (its picture's region starts off the page, so it is moved),
 * taller than what is captured (cut), wider than the window, with a dialog open outside the stories, and with something
 * fixed to the window that moving would move.
 */
const STORIES: Record<string, string> = {
	small: '<button style="width:100px;height:40px;background:#108062;color:#fff;border:0;border-radius:8px">Save</button>',
	tall: '<div style="width:300px;height:800px;background:linear-gradient(#123,#c84)"></div>',
	wide: '<div style="width:1190px;height:60px;background:#246;border-radius:12px"></div>',
	dialog: '<span style="color:#333">Open</span>',
	fixed:
		'<div><span style="display:inline-block;width:60px;height:30px;background:#a33"></span><b style="position:fixed;left:140px;top:60px;background:#3a3;width:40px;height:40px"></b></div>',
};
const PICTURE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title>
<style>body { margin: 0; padding: 16px; background: #fff; } .fd-name { margin: 0 0 8px; font: 12px sans-serif; color: #6b7280; }</style></head>
<body><div id="root"></div><script>
const stories = ${JSON.stringify(STORIES)};
window.__dsnrShow = async (file) => {
	document.querySelectorAll('.layer').forEach((e) => e.remove());
	document.getElementById('root').innerHTML = '<section data-story="Default"><h4 class="fd-name">Default</h4>' + stories[file] + '</section><section data-story="Other"><h4 class="fd-name">Other</h4><p>Another story</p></section>';
	if (file === 'dialog') document.body.insertAdjacentHTML('beforeend', '<div class="layer" style="position:fixed;left:200px;top:120px;width:300px;height:160px;background:#ddd;border:2px solid #333"></div>');
};
</script></body></html>`;

const PAGES: Record<string, string> = {
	'/pictures/': PICTURE_PAGE,
	'/page.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A page</title></head>
<body style="margin:0;font:16px sans-serif"><main><h1 style="background:#123;color:#fff;padding:40px">Alert history</h1>
<p style="padding:40px">Every alert from the last day, by camera.</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`,
	'/blank.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Blank</title></head><body></body></html>',
	// A preview build's page, as the Design System tab's are: it draws the story file it is told, in place of the last.
	'/previews/': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title></head>
<body style="margin:0;background:#fff"><div id="root"></div><script>
window.__dsnrShow = async (file) => {
	const dark = matchMedia('(prefers-color-scheme: dark)').matches;
	document.getElementById('root').innerHTML = '<section data-story><div class="fd-name">' + file + '</div>'
		+ '<button style="background:' + (dark ? '#654321' : '#123456') + ';color:#fff;border-radius:6px;padding:12px 20px;border:0">Save</button>'
		+ '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="8" height="8"></section>'
		+ '<section data-story><button style="background:#ff0000;padding:8px">Second</button></section>';
};
</script></body></html>`,
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

	it('draws stories as the Design System tab asks: what each draws, in its mode, its picture, and what axe finds', async () => {
		const [light, dark] = await headless.measure([
			{ base: `${base}/previews/`, mode: 'light', files: ['a.stories.tsx', 'b.stories.tsx'], pictures: true, accessibility: ['wcag2a'] },
			{ base: `${base}/previews/`, mode: 'dark', files: ['a.stories.tsx'] },
		]);
		expect(light).toHaveLength(2);
		expect(Object.keys(light?.[0]?.colors ?? {})).toContain('rgb(18, 52, 86)');
		expect(light?.[0]?.radii).toHaveProperty(['6px']);
		expect(Object.keys(dark?.[0]?.colors ?? {})).toContain('rgb(101, 67, 33)');
		expect(dark?.[0]?.picture).toBeUndefined();
		// The picture: a JPEG of the first story alone, on white, twice as wide as it is tall.
		const picture = light?.[0]?.picture;
		expect(picture?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
		expect(light?.[0]?.accessibility?.violations.map((v) => v.id)).toContain('image-alt');
	}, 60_000);

	it('pictures a story as the composition does, in one capture taken by the browser: moved into view, cut, wide, beside a dialog, fixed', async () => {
		await inChrome(async (browser) => {
			const page = await browser.newPage();
			await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
			await page.goto(`${base}/pictures/`, { waitUntil: 'load' });
			const compare = await browser.newPage();
			// Two JPEGs, as drawn: their sizes, and how far apart their pixels are, on average, out of 255.
			const apart = (a: Buffer, b: Buffer) =>
				compare.evaluate(
					async (x: string, y: string) => {
						const load = async (s: string) => createImageBitmap(await (await fetch(`data:image/jpeg;base64,${s}`)).blob());
						const [i, j] = [await load(x), await load(y)];
						const read = (m: ImageBitmap) => {
							const c = new OffscreenCanvas(i.width, i.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
							c.drawImage(m, 0, 0, i.width, i.height);
							return c.getImageData(0, 0, i.width, i.height).data;
						};
						const [p, q] = [read(i), read(j)];
						let sum = 0;
						for (let k = 0; k < p.length; k += 4)
							sum += (Math.abs(p[k]! - q[k]!) + Math.abs(p[k + 1]! - q[k + 1]!) + Math.abs(p[k + 2]! - q[k + 2]!)) / 3;
						return { sizes: [`${i.width}x${i.height}`, `${j.width}x${j.height}`], apart: sum / (p.length / 4) };
					},
					a.toString('base64'),
					b.toString('base64'),
				);
			const said: Record<string, { sizes: string[]; apart: number }> = {};
			for (const file of Object.keys(STORIES)) {
				await page.evaluate(readDrawn(file, true));
				const fast = (await pictureOf(page as never)) as Buffer;
				const composed = (await composedPicture(page as never)) as Buffer;
				said[file] = await apart(fast, composed);
			}
			// Drawn at the size it is kept: the same picture, pixel for pixel, moved into view, beside a dialog (which it leaves to
			// the composition) or with something fixed to the window (likewise).
			for (const file of ['small', 'dialog', 'fixed']) {
				expect(said[file]?.sizes[0], file).toBe(said[file]?.sizes[1]);
				expect(said[file]?.apart, file).toBe(0);
			}
			// Bigger than a picture is kept: framed to within a pixel, and drawn by the browser at the size kept rather than shrunk
			// from twice it, so its edges are smoothed a little differently (0.2 and 0.5 out of 255 here). The cut story shows
			// nothing past the cut, as the composition does; were what is past it shown, it would be 0.9.
			const [tall, wide] = [said.tall, said.wide] as [{ sizes: string[]; apart: number }, { sizes: string[]; apart: number }];
			for (const { sizes } of [tall, wide]) {
				const [[w1, h1], [w2, h2]] = sizes.map((x) => x.split('x').map(Number)) as [[number, number], [number, number]];
				expect(Math.abs(w1 - w2) + Math.abs(h1 - h2)).toBeLessThanOrEqual(2);
			}
			expect(tall.apart).toBeLessThan(0.5);
			expect(wide.apart).toBeLessThan(1);
		});
	}, 60_000);

	it('checks a page with axe, finding what is wrong with it', async () => {
		const [run] = await headless.scan(`${base}/page.html`, [], ['wcag2a']);
		expect(run?.state).toBe('default');
		expect(run?.violations.map((v) => v.id)).toContain('image-alt');
	}, 60_000);
});
