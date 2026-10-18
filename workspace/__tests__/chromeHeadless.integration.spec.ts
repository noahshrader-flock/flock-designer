import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromeHeadless, composedPicture, findChrome, pictureOf } from '../src/core/services/browser/chromeHeadless';
import { COVER_BUDGET } from '../src/core/services/prototypes/projectCovers';
import { readDrawn } from '../src/core/services/designSystem/storyDrawing';
import { resultOf } from '../src/core/services/accessibility/accessibilityCheck';
import { countsOf } from '../src/shared/accessibility';
import { undeclared } from '../src/shared/wcag';
import { withPageTheme } from '../src/core/services/browser/pageTheme';
import { inChrome } from './realChrome';

/**
 * The headless port with the browser on this machine (4.4): a real picture and a real check of real pages, served from
 * this machine as prototypes are. Skipped where there is no Chrome, Edge or Chromium.
 */

/**
 * A preview page as the builds' is (white, padded, the stories in `#root`, each with its name), drawing one story file of
 * each kind a picture has to get right: small at the top left (its picture's region starts off the page, so it is moved),
 * taller than what is captured (cut), wider than the window, with a dialog open outside the stories, and with something
 * fixed to the window that moving would move; and a file that could not be drawn at all, which has no story in it, only the
 * page's word of why.
 */
const STORIES: Record<string, string> = {
	small: '<button style="width:100px;height:40px;background:#108062;color:#fff;border:0;border-radius:8px">Save</button>',
	tall: '<div style="width:300px;height:800px;background:linear-gradient(#123,#c84)"></div>',
	wide: '<div style="width:1190px;height:60px;background:#246;border-radius:12px"></div>',
	dialog: '<span style="color:#333">Open</span>',
	// A file that could not be drawn at all: no story, only the page's word of why in its place.
	unread: '',
	fixed:
		'<div><span style="display:inline-block;width:60px;height:30px;background:#a33"></span><b style="position:fixed;left:140px;top:60px;background:#3a3;width:40px;height:40px"></b></div>',
};
const PICTURE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title>
<style>body { margin: 0; padding: 16px; background: #fff; } .fd-name { margin: 0 0 8px; font: 12px sans-serif; color: #6b7280; }</style></head>
<body><div id="root"></div><script>
const stories = ${JSON.stringify(STORIES)};
window.__dsnrShow = async (file) => {
	document.querySelectorAll('.layer').forEach((e) => e.remove());
	document.getElementById('root').innerHTML = file === 'unread'
		? '<pre class="fd-error" style="color:#b91c1c">There is no such story file in this build.</pre>'
		: '<section data-story="Default"><h4 class="fd-name">Default</h4>' + stories[file] + '</section><section data-story="Other"><h4 class="fd-name">Other</h4><p>Another story</p></section>';
	if (file === 'dialog') document.body.insertAdjacentHTML('beforeend', '<div class="layer" style="position:fixed;left:200px;top:120px;width:300px;height:160px;background:#ddd;border:2px solid #333"></div>');
};
</script></body></html>`;

const PAGES: Record<string, string> = {
	'/pictures/': PICTURE_PAGE,
	'/page.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A page</title></head>
<body style="margin:0;font:16px sans-serif"><main><h1 style="background:#123;color:#fff;padding:40px">Alert history</h1>
<p style="padding:40px">Every alert from the last day, by camera.</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`,
	'/blank.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Blank</title></head><body></body></html>',
	// Planted: a heading that skips three levels, and one with nothing in it, which only axe's best-practice rules find.
	'/headings.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Headings</title></head>
<body><main><h1>Alerts</h1><h4 id="skipped">Today</h4><h2 id="empty"></h2><p>Every alert from the last day.</p></main></body></html>`,
	// A story that moves: one padding animating for ever (a spinner's way), one animating in over two seconds.
	'/moving/': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title>
<style>@keyframes pulse { from { padding-top: 4px } to { padding-top: 40px } } @keyframes enter { from { padding-left: 0 } to { padding-left: 24px } }</style></head>
<body style="margin:0;background:#fff"><div id="root"></div><script>
window.__dsnrShow = async () => {
	document.getElementById('root').innerHTML = '<section data-story>'
		+ '<i style="display:block;width:20px;height:20px;padding-top:3px;animation:pulse 0.7s linear infinite"></i>'
		+ '<b style="display:block;width:20px;height:20px;padding-left:24px;animation:enter 2s linear both"></b></section>';
};
</script></body></html>`,
	// A preview build's page, as the Design System tab's are: it draws the story file it is told, in place of the last.
	// Its styles put in by script when a story draws, into a sheet already on the page, as a CSS-in-JS library puts them
	// (Emotion, built for production): the page theme answers them as the story's elements go in.
	'/inserted/': withPageTheme(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title></head>
<body style="margin:0;background:#fff"><div id="root"></div><script>
const sheet = document.head.appendChild(document.createElement('style')).sheet;
window.__dsnrShow = async () => {
	// Into the sheet already there, when the story draws, as Emotion does.
	sheet.insertRule('.save { background: #123456 }', 0);
	sheet.insertRule('@media (prefers-color-scheme: dark) { .save { background: #654321 } }', 1);
	document.getElementById('root').innerHTML = '<section data-story><button class="save" style="color:#fff;padding:12px 20px;border:0">Save</button></section>';
};
</script></body></html>`),
	// With the page theme first in its head, as the build's page has it: its address says the mode.
	'/previews/': withPageTheme(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title></head>
<body style="margin:0;background:#fff"><div id="root"></div><script>
window.__dsnrShow = async (file) => {
	const dark = matchMedia('(prefers-color-scheme: dark)').matches;
	document.getElementById('root').innerHTML = '<section data-story><div class="fd-name">' + file + '</div>'
		+ '<button style="background:' + (dark ? '#654321' : '#123456') + ';color:#fff;border-radius:6px;padding:12px 20px;border:0">Save</button>'
		+ '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="8" height="8"></section>'
		+ '<section data-story><button style="background:#ff0000;padding:8px">Second</button></section>';
};
</script></body></html>`),
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

	it('holds what moves still, so a story reads the same whenever it is drawn: what turns for ever at rest, what animates in at its end', async () => {
		const drawn = async () => (await headless.measure([{ base: `${base}/moving/`, mode: 'light', files: ['moving.stories.tsx'] }]))[0]?.[0]?.spacing;
		const first = await drawn();
		await new Promise((r) => setTimeout(r, 350));
		expect(await drawn()).toEqual(first);
		// At rest, its padding as written, not a moment of its turn; and the one that animates in, as it ends.
		expect(first).toHaveProperty(['3px']);
		expect(first).toHaveProperty(['24px']);
	}, 60_000);

	it('draws stories as the Design System tab asks: what each draws, in its mode, its picture, and what axe finds', async () => {
		const [light, dark] = await headless.measure([
			{ base: `${base}/previews/`, mode: 'light', files: ['a.stories.tsx', 'b.stories.tsx'], pictures: true, accessibility: ['wcag2a'] },
			{ base: `${base}/previews/`, mode: 'dark', files: ['a.stories.tsx'] },
		]);
		expect(light).toHaveLength(2);
		expect(Object.keys(light?.[0]?.colors ?? {})).toContain('rgb(18, 52, 86)');
		expect(light?.[0]?.radii).toHaveProperty(['6px']);
		// The page's root font size, which a rem in the library is of.
		expect(light?.[0]?.rootPx).toBe(16);
		expect(Object.keys(dark?.[0]?.colors ?? {})).toContain('rgb(101, 67, 33)');
		expect(dark?.[0]?.picture).toBeUndefined();
		// The picture: a JPEG of the first story alone, on white, twice as wide as it is tall.
		const picture = light?.[0]?.picture;
		expect(picture?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
		expect(light?.[0]?.accessibility?.violations.map((v) => v.id)).toContain('image-alt');
	}, 60_000);

	it('draws a story in its mode by its address, the styles a script put in too, whatever the browser is set to', async () => {
		const [light, dark] = await headless.measure([
			{ base: `${base}/inserted/`, mode: 'light', files: ['a.stories.tsx'] },
			{ base: `${base}/inserted/`, mode: 'dark', files: ['a.stories.tsx'] },
		]);
		expect(Object.keys(light?.[0]?.colors ?? {})).toContain('rgb(18, 52, 86)');
		expect(Object.keys(light?.[0]?.colors ?? {})).not.toContain('rgb(101, 67, 33)');
		expect(Object.keys(dark?.[0]?.colors ?? {})).toContain('rgb(101, 67, 33)');
	}, 60_000);

	it('pictures a story as the composition does, in one capture taken by the browser: moved into view, cut, wide, beside a dialog, fixed', async () => {
		await inChrome(async (browser) => {
			const page = await browser.newPage();
			await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
			await page.goto(`${base}/pictures/`, { waitUntil: 'load' });
			const compare = await browser.newPage();
			/**
			 * A JPEG as a person sees it: its size, the box around what is painted (not near-white, so JPEG's own noise is not
			 * counted), and how far its pixels are from another's, on average, out of 255. What a picture must keep, said without
			 * depending on how one version of the browser smooths an edge.
			 */
			const seen = (a: Buffer, b: Buffer) =>
				compare.evaluate(
					async (x: string, y: string) => {
						const load = async (s: string) => createImageBitmap(await (await fetch(`data:image/jpeg;base64,${s}`)).blob());
						const read = (m: ImageBitmap) => {
							const c = new OffscreenCanvas(m.width, m.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
							c.drawImage(m, 0, 0);
							const d = c.getImageData(0, 0, m.width, m.height).data;
							let [l, t, r, bottom] = [m.width, m.height, -1, -1];
							for (let i = 0; i < d.length; i += 4) {
								if (d[i]! > 240 && d[i + 1]! > 240 && d[i + 2]! > 240) continue;
								const [px, py] = [(i / 4) % m.width, Math.floor(i / 4 / m.width)];
								[l, t, r, bottom] = [Math.min(l, px), Math.min(t, py), Math.max(r, px), Math.max(bottom, py)];
							}
							return { size: [m.width, m.height], painted: [l, t, r, bottom], data: d };
						};
						const [p, q] = [read(await load(x)), read(await load(y))];
						let apart = 0;
						if (p.size.join() === q.size.join())
							for (let k = 0; k < p.data.length; k += 4)
								apart +=
									(Math.abs(p.data[k]! - q.data[k]!) + Math.abs(p.data[k + 1]! - q.data[k + 1]!) + Math.abs(p.data[k + 2]! - q.data[k + 2]!)) / 3;
						return { fast: { size: p.size, painted: p.painted }, composed: { size: q.size, painted: q.painted }, apart: apart / (p.data.length / 4) };
					},
					a.toString('base64'),
					b.toString('base64'),
				);
			for (const file of Object.keys(STORIES)) {
				await page.evaluate(readDrawn(file, true));
				const { fast, composed, apart } = await seen((await pictureOf(page as never)) as Buffer, (await composedPicture(page as never)) as Buffer);
				// The same size, and what is painted in the same place, each to within the pixel or two the half-size capture finds
				// an edge to: a story moved into view, cut where the capture cuts it (nothing past the cut shows), wider than the
				// window, beside a dialog, or with something fixed to the window, all as the composition makes it.
				fast.size.forEach((n, i) => expect(Math.abs(n - (composed.size[i] as number)), `${file} size`).toBeLessThanOrEqual(2));
				fast.painted.forEach((n, i) => expect(Math.abs(n - (composed.painted[i] as number)), `${file} painted`).toBeLessThanOrEqual(2));
				// And the same to the eye where the two are one size: what differs is an edge smoothed another way.
				if (fast.size.join() === composed.size.join()) expect(apart, `${file} pixels`).toBeLessThan(3);
			}
		});
	}, 60_000);

	it('checks a page with axe, finding what is wrong with it, and on which element, with what to change', async () => {
		const [run] = await headless.scan(`${base}/page.html`, [], ['wcag2a']);
		expect(run?.state).toBe('default');
		const alt = run?.violations.find((v) => v.id === 'image-alt');
		expect(alt?.elements).toEqual([
			{ target: 'img', html: expect.stringMatching(/^<img src="data:image\/gif/), fix: expect.stringMatching(/^Fix any of the following:/) },
		]);
	}, 60_000);

	it('runs axe’s best-practice rules beside the target’s, and says what they find apart, never as WCAG', async () => {
		const target = undeclared('none here');
		const runs = await headless.scan(`${base}/headings.html`, [], target.tags);
		const result = resultOf(runs, target, new Date());
		expect(result.violations).toEqual([]);
		const found = Object.fromEntries(result.bestPractice.violations.map((v) => [v.rule, v.elements.map((e) => e.target)]));
		expect(found['heading-order']).toEqual(['#skipped']);
		expect(found['empty-heading']).toEqual(['#empty']);
		expect(result.bestPractice.violations.every((v) => v.criteria.length === 0)).toBe(true);
		expect(countsOf(result)).toEqual({ violations: 0, incomplete: 0 });
	}, 60_000);
});
