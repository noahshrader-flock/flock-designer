// TEMPORARY: finds which step of the fast picture moves an edge on Linux. Deleted once read.
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readDrawn } from '../src/core/services/designSystem/storyDrawing';
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
		const compare = await browser.newPage(OWN_WINDOW);
		/** Edges by the picture test's own rule (white is all three above 240); `re` re-encodes it as the composition does, at `k`. */
		const boxOf = (image: Buffer, type: string, re: boolean, k: number) =>
			compare.evaluate(
				async (b64: string, t: string, again: boolean, scale: number) => {
					let m = await createImageBitmap(await (await fetch(`data:${t};base64,${b64}`)).blob());
					if (again || scale !== 1) {
						const c = new OffscreenCanvas(Math.round(m.width * scale), Math.round(m.height * scale));
						const g = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
						g.fillStyle = '#fff';
						g.fillRect(0, 0, c.width, c.height);
						g.imageSmoothingQuality = 'high';
						g.drawImage(m, 0, 0, c.width, c.height);
						m = await createImageBitmap(again ? await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }) : await c.convertToBlob());
					}
					const c = new OffscreenCanvas(m.width, m.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
					c.drawImage(m, 0, 0);
					const d = c.getImageData(0, 0, m.width, m.height).data;
					let [l, top, r, bottom] = [m.width, m.height, -1, -1];
					for (let i = 0; i < d.length; i += 4) {
						if (d[i]! > 240 && d[i + 1]! > 240 && d[i + 2]! > 240) continue;
						const [x, y] = [(i / 4) % m.width, Math.floor(i / 4 / m.width)];
						[l, top, r, bottom] = [Math.min(l, x), Math.min(top, y), Math.max(r, x), Math.max(bottom, y)];
					}
					return [l, top, r + 1, bottom + 1].join(' ');
				},
				image.toString('base64'),
				type,
				re,
				k,
			);
		const clip = { x: 0, y: 0, width: 1200, height: 640 };
		const shot = async (o: Record<string, unknown>) => Buffer.from(await page.screenshot(o as never));
		for (const file of Object.keys(STORIES)) {
			await page.evaluate(readDrawn(file, true));
			const say = (what: string, v: string) => lines.push(`${file.padEnd(6)} ${what.padEnd(44)} ${v}`);
			const png = await shot({ type: 'png', clip });
			say('full size: png', await boxOf(png, 'image/png', false, 1));
			say(
				'full size: Chrome jpeg 85, optimizeForSpeed',
				await boxOf(await shot({ type: 'jpeg', quality: 85, optimizeForSpeed: true, clip }), 'image/jpeg', false, 1),
			);
			say('full size: Chrome jpeg 85', await boxOf(await shot({ type: 'jpeg', quality: 85, clip }), 'image/jpeg', false, 1));
			say('full size: canvas jpeg 85 of the png', await boxOf(png, 'image/png', true, 1));
			const k = 0.5625;
			say('0.5625: Chrome png', await boxOf(await shot({ type: 'png', clip: { ...clip, scale: k } }), 'image/png', false, 1));
			say('0.5625: canvas png of the full png', await boxOf(png, 'image/png', false, k));
			say(
				'0.5625: Chrome jpeg 85, optimizeForSpeed',
				await boxOf(await shot({ type: 'jpeg', quality: 85, optimizeForSpeed: true, clip: { ...clip, scale: k } }), 'image/jpeg', false, 1),
			);
			say('0.5625: canvas jpeg 85 of the full png', await boxOf(png, 'image/png', true, k));
		}
	});
	expect(lines.join('\n')).toBe('');
}, 60_000);
