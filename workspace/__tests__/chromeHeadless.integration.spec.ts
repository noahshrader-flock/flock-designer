import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromeHeadless, composedPicture, pictureOf } from '../src/core/services/browser/chromeHeadless';
import { COVER_BUDGET } from '../src/core/services/prototypes/projectCovers';
import { readDrawn } from '../src/core/services/designSystem/storyDrawing';
import { resultOf } from '../src/core/services/accessibility/accessibilityCheck';
import { countsOf } from '../src/shared/accessibility';
import { undeclared } from '../src/shared/wcag';
import { withPageTheme } from '../src/core/services/browser/pageTheme';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';

/**
 * One story file of each kind a picture has to get right: small at the top left (its region starts off the page, so it is
 * moved), taller than the capture (cut), wider than the window, beside a dialog, with something fixed to the window, and
 * one that could not be drawn at all.
 */
const STORIES: Record<string, string> = {
	small: '<button style="width:100px;height:40px;background:#108062;color:#fff;border:0;border-radius:8px">Save</button>',
	tall: '<div style="width:300px;height:800px;background:linear-gradient(#123,#c84)"></div>',
	wide: '<div style="width:1190px;height:60px;background:#246;border-radius:12px"></div>',
	dialog: '<span style="color:#333">Open</span>',
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
	// What a state shows once a simulated request is done: nothing wrong at first, a faulty image after 1.2 seconds.
	'/later.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Later</title></head>
<body style="margin:0"><main id="m"><h1 style="background:#a33;color:#fff;padding:24px">Loading</h1></main><script>
setTimeout(() => {
	document.getElementById('m').innerHTML = '<h1 style="background:#123456;color:#fff;padding:24px">Done</h1><img src="camera.png">';
}, 1200);
</script></body></html>`,
	'/blank.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Blank</title></head><body></body></html>',
	// Planted faults only axe's best-practice rules find.
	'/headings.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Headings</title></head>
<body><main><h1>Alerts</h1><h4 id="skipped">Today</h4><h2 id="empty"></h2><p>Every alert from the last day.</p></main></body></html>`,
	'/moving/': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title>
<style>@keyframes pulse { from { padding-top: 4px } to { padding-top: 40px } } @keyframes enter { from { padding-left: 0 } to { padding-left: 24px } }</style></head>
<body style="margin:0;background:#fff"><div id="root"></div><script>
window.__dsnrShow = async () => {
	document.getElementById('root').innerHTML = '<section data-story>'
		+ '<i style="display:block;width:20px;height:20px;padding-top:3px;animation:pulse 0.7s linear infinite"></i>'
		+ '<b style="display:block;width:20px;height:20px;padding-left:24px;animation:enter 2s linear both"></b></section>';
};
</script></body></html>`,
	// Styles inserted into a sheet already on the page when a story draws, as Emotion does in production.
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
	// Red when drawn while hidden: a hidden page draws nothing new, and on Linux a picture of one waits for ever.
	'/visible/': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title></head>
<body style="margin:0;background:#fff"><div id="root"></div><script>
window.__dsnrShow = async () => {
	const seen = document.visibilityState === 'visible' ? '#123456' : '#ff0000';
	document.getElementById('root').innerHTML = '<section data-story><button style="background:' + seen + ';color:#fff;padding:12px 20px;border:0">Save</button></section>';
};
</script></body></html>`,
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

describe.skipIf(NO_CHROME)('with the browser on this machine', () => {
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
		// The endless one at its padding as written; the one that animates in, as it ends.
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

	it('draws every page in view, however many are drawn at once', async () => {
		const files = ['a.stories.tsx', 'b.stories.tsx', 'c.stories.tsx'];
		const runs = await headless.measure((['light', 'dark'] as const).map((mode) => ({ base: `${base}/visible/`, mode, files, pictures: true })));
		const drawn = runs.flat();
		expect(drawn).toHaveLength(6);
		for (const d of drawn) expect(Object.keys(d?.colors ?? {})).toEqual(expect.arrayContaining(['rgb(18, 52, 86)']));
		expect(drawn.some((d) => Object.keys(d?.colors ?? {}).includes('rgb(255, 0, 0)'))).toBe(false);
	}, 60_000);

	it('pictures a story as the composition does, in one capture taken by the browser: moved into view, cut, wide, beside a dialog, fixed', async () => {
		await inChrome(async (browser) => {
			const page = await browser.newPage(OWN_WINDOW);
			await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
			await page.goto(`${base}/pictures/`, { waitUntil: 'load' });
			const compare = await browser.newPage(OWN_WINDOW);
			/**
			 * Compared as a person sees it, never by how near white a pixel is (JPEG's noise reaches 236 of 255, a dialog's grey is
			 * 221): their sizes, the shift that lays one over the other best, and the 16-pixel tile where they differ most.
			 */
			const seen = (a: Buffer, b: Buffer) =>
				compare.evaluate(
					async (x: string, y: string) => {
						const read = async (s: string) => {
							const m = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${s}`)).blob());
							const c = new OffscreenCanvas(m.width, m.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
							c.drawImage(m, 0, 0);
							return { width: m.width, height: m.height, data: c.getImageData(0, 0, m.width, m.height).data };
						};
						const [p, q] = [await read(x), await read(y)];
						// How far apart a pixel of the fast picture is from the composed one's, shifted; past its edge, from white.
						const apart = (px: number, py: number, sx: number, sy: number) => {
							const [qx, qy, i] = [px + sx, py + sy, (py * p.width + px) * 4];
							const j = (qy * q.width + qx) * 4;
							const out = qx < 0 || qy < 0 || qx >= q.width || qy >= q.height;
							let sum = 0;
							for (let c = 0; c < 3; c++) sum += Math.abs(p.data[i + c]! - (out ? 255 : q.data[j + c]!));
							return sum / 3;
						};
						let shift = [0, 0];
						let least = Infinity;
						for (let sy = -3; sy <= 3; sy++)
							for (let sx = -3; sx <= 3; sx++) {
								let sum = 0;
								for (let py = 0; py < p.height; py += 2) for (let px = 0; px < p.width; px += 2) sum += apart(px, py, sx, sy);
								if (sum < least) [least, shift] = [sum, [sx, sy]];
							}
						const TILE = 16;
						const across = Math.ceil(p.width / TILE);
						const tiles = new Float64Array(across * Math.ceil(p.height / TILE));
						for (let py = 0; py < p.height; py++)
							for (let px = 0; px < p.width; px++)
								tiles[Math.floor(py / TILE) * across + Math.floor(px / TILE)]! += apart(px, py, shift[0]!, shift[1]!);
						return { sizes: [p.width, p.height, q.width, q.height], shift, worstTile: Math.max(...tiles) / (TILE * TILE) };
					},
					a.toString('base64'),
					b.toString('base64'),
				);
			for (const file of Object.keys(STORIES)) {
				await page.evaluate(readDrawn(file, true));
				const fastPicture = (await pictureOf(page as never)) as Buffer;
				const composedOne = (await composedPicture(page as never)) as Buffer;
				const { sizes, shift, worstTile } = await seen(fastPicture, composedOne);
				const [fw, fh, cw, ch] = sizes as [number, number, number, number];
				const said = `${file}: fast ${fw}x${fh}, composed ${cw}x${ch}, shifted ${shift.join(',')}, worst tile ${worstTile.toFixed(1)}`;
				// To within the 2 pixels the half-size capture finds an edge to. Measured: real pairs differ by at most 12 in their
				// worst tile, on the Mac and on Linux; a 40-pixel piece missing makes it 42 or more.
				expect.soft(Math.max(Math.abs(fw - cw), Math.abs(fh - ch)), said).toBeLessThanOrEqual(2);
				expect.soft(Math.max(...shift.map(Math.abs)), said).toBeLessThanOrEqual(2);
				expect.soft(worstTile, said).toBeLessThan(25);
			}
		});
	}, 60_000);

	it('checks a state once the request it waits on is done, not while it is still loading', async () => {
		const [run] = await headless.scan(`${base}/later.html`, [], ['wcag2a']);
		expect(run?.violations.map((v) => v.id)).toContain('image-alt');
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
