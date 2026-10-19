// TEMPORARY: finds which step of the fast picture moves an edge on Linux. Deleted once read.
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readDrawn } from '../src/core/services/designSystem/storyDrawing';
import { painted } from '../src/core/services/prototypes/pictureComposition';
import { decodePng } from '../src/core/services/prototypes/png';
import PICTURE from '../src/page/picture?page';
import { OWN_WINDOW, inChrome } from './realChrome';

const STORIES: Record<string, string> = {
	tall: '<div style="width:300px;height:800px;background:linear-gradient(#123,#c84)"></div>',
	wide: '<div style="width:1190px;height:60px;background:#246;border-radius:12px"></div>',
	unread: '',
};
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Previews</title>
<style>body { margin: 0; padding: 16px; background: #fff; } .fd-name { margin: 0 0 8px; font: 12px sans-serif; color: #6b7280; }</style></head>
<body><div id="root"></div><script>
const stories = ${JSON.stringify(STORIES)};
window.__dsnrShow = async (file) => {
	document.getElementById('root').innerHTML = file === 'unread'
		? '<pre class="fd-error" style="color:#b91c1c">There is no such story file in this build.</pre>'
		: '<section data-story="Default"><h4 class="fd-name">Default</h4>' + stories[file] + '</section><section data-story="Other"><h4 class="fd-name">Other</h4><p>Another story</p></section>';
};
</script></body></html>`;

let server: Server;
let base: string;
beforeAll(async () => {
	server = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pictures/`;
});
afterAll(() => new Promise((r) => server.close(r)));

it('reports where each step puts the painted edges', async () => {
	const lines: string[] = [];
	await inChrome(async (browser) => {
		const page = await browser.newPage(OWN_WINDOW);
		await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
		await page.goto(base, { waitUntil: 'load' });
		const inPage = (name: string, args: unknown = {}) => `(async () => {\n${PICTURE}\nreturn await __fdPage.${name}(${JSON.stringify(args)});\n})()`;
		/** Painted edges [left, top, right, bottom] in CSS pixels of the page, from a PNG at `scale`. */
		const edges = async (o: Record<string, unknown>, scale: number, at = { x: 0, y: 0 }) => {
			const png = decodePng(Buffer.from(await page.screenshot({ type: 'png', ...o } as never)));
			const f = painted({ data: Buffer.from(png.rgba.buffer, png.rgba.byteOffset, png.rgba.byteLength), width: png.width, height: png.height });
			const k = 2 * scale;
			return f === null
				? 'none'
				: [f.x / k + at.x, f.y / k + at.y, (f.x + f.width) / k + at.x, (f.y + f.height) / k + at.y].map((n) => n.toFixed(1)).join(' ');
		};
		const clip = { x: 0, y: 0, width: 1200, height: 640 };
		for (const file of Object.keys(STORIES)) {
			await page.evaluate(readDrawn(file, true));
			const say = (what: string, v: string) => lines.push(`${file.padEnd(6)} ${what.padEnd(34)} ${v}`);
			say('png', await edges({ clip }, 1));
			say('png, optimizeForSpeed', await edges({ clip, optimizeForSpeed: true }, 1));
			say('png, captureBeyondViewport false', await edges({ clip, captureBeyondViewport: false }, 1));
			say('png at half size', await edges({ clip: { ...clip, scale: 0.5 } }, 0.5));
			say('png at half size, optimizeForSpeed', await edges({ clip: { ...clip, scale: 0.5 }, optimizeForSpeed: true }, 0.5));
			say('png at 0.5625', await edges({ clip: { ...clip, scale: 0.5625 } }, 0.5625));
			await page.evaluate(`document.getElementById('root').style.translate = '0px 0px'`);
			say('png, translated 0', await edges({ clip }, 1));
			await page.evaluate(`document.getElementById('root').style.translate = '0px 3px'`);
			say('png, translated 3 down', await edges({ clip }, 1));
			await page.evaluate(`document.getElementById('root').style.translate = ''`);
			// The cut as the fast picture makes it, taken past the cut line.
			if ((await page.evaluate(inPage('readyToPicture', { cut: true, dx: 0, dy: 0, width: 1200, height: 640 }))) === true) {
				say('cut by clip-path, taken to 900', await edges({ clip: { ...clip, height: 900 } }, 1));
				say('cut by clip-path, 0.5625, to 900', await edges({ clip: { ...clip, height: 900, scale: 0.5625 } }, 0.5625));
			}
			await page.evaluate(inPage('pictured'));
			lines.push(
				`${file.padEnd(6)} viewport ${JSON.stringify(await page.evaluate('[innerWidth, innerHeight, document.documentElement.clientWidth, document.documentElement.scrollHeight, devicePixelRatio]'))}`,
			);
		}
	});
	expect(lines.join('\n')).toBe('');
}, 60_000);
