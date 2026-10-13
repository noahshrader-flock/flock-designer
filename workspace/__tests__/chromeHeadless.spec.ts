import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { NO_BROWSER, chromeHeadless, findChrome } from '../src/main/services/chromeHeadless';
import { fitJpegBy } from '../src/main/services/picture';
import { decodePng } from '../src/main/services/png';

/**
 * Drawing out of sight in a shell with no hidden windows (ELECTRON_MIGRATION_PLAN 2B, 4.4): the browser already on the
 * machine (Chrome, Edge or Chromium), driven headless, draws a prototype's picture and checks its page as the app's
 * hidden windows do, and a machine with none says so.
 */

/** A PNG of `rows` (each a list of [r, g, b, a]), each row with its own filter, as an encoder may choose. */
const png = (rows: number[][][], filters: number[]): Buffer => {
	const chunk = (type: string, data: Buffer) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
	};
	const width = rows[0]!.length;
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(rows.length, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const raw: number[] = [];
	let prev = new Array(width * 4).fill(0);
	rows.forEach((row, y) => {
		const line = row.flat();
		const f = filters[y] ?? 0;
		raw.push(f);
		line.forEach((v, x) => {
			const a = x >= 4 ? line[x - 4]! : 0;
			const b = prev[x]!;
			raw.push(f === 0 ? v : f === 1 ? (v - a) & 255 : f === 2 ? (v - b) & 255 : (v - ((a + b) >> 1)) & 255);
		});
		prev = line;
	});
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(Buffer.from(raw))),
		chunk('IEND', Buffer.alloc(0)),
	]);
};

describe('a screenshot’s pixels', () => {
	it('are read from the PNG, whatever filter each row was written with', () => {
		const rows = [
			[
				[255, 0, 0, 255],
				[0, 255, 0, 255],
			],
			[
				[10, 20, 30, 255],
				[40, 50, 60, 128],
			],
			[
				[1, 2, 3, 4],
				[5, 6, 7, 8],
			],
		];
		const read = decodePng(png(rows, [0, 1, 2]));
		expect([read.width, read.height]).toEqual([2, 3]);
		expect([...read.rgba]).toEqual(rows.flat(2));
		expect([...decodePng(png(rows, [3, 3, 3])).rgba]).toEqual(rows.flat(2));
	});

	it('are not read from what is not a PNG', () => {
		expect(() => decodePng(Buffer.from('not a picture'))).toThrow(/not a PNG/);
	});
});

describe('fitting a picture in its budget', () => {
	it('keeps the first step that fits, and none when none does', async () => {
		const encode = vi.fn(async (width: number, quality: number) => Buffer.alloc(width * quality));
		expect(
			(
				await fitJpegBy(encode, 51_000, [
					[960, 80],
					[720, 70],
					[640, 60],
				])
			)?.length,
		).toBe(720 * 70);
		expect(encode.mock.calls).toEqual([
			[960, 80],
			[720, 70],
		]);
		expect(await fitJpegBy(async () => Buffer.alloc(10), 5, [[960, 80]])).toBeNull();
		expect(await fitJpegBy(async () => Promise.reject(new Error('gone')), 5, [[960, 80]])).toBeNull();
	});
});

describe('finding the browser', () => {
	it('is CHROME_BIN when it is set, else Chrome, Edge or Chromium where each installs, else none', () => {
		const at =
			(...paths: string[]) =>
			(p: string) =>
				paths.includes(p);
		expect(findChrome({ CHROME_BIN: '/x/chrome' }, at('/x/chrome'), 'darwin')).toBe('/x/chrome');
		expect(findChrome({}, at('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), 'darwin')).toBe(
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		);
		expect(findChrome({}, at('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'), 'darwin')).toBe(
			'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
		);
		expect(findChrome({}, at('/usr/bin/chromium'), 'linux')).toBe('/usr/bin/chromium');
		expect(findChrome({}, at(), 'darwin')).toBeNull();
	});
});

/** A browser that answers as puppeteer's does, its page doing what it is told. */
const fakeBrowser = (page: { evaluate?: (code: string) => unknown; screenshot?: (o: { type: string; quality?: number }) => Buffer }) => {
	const done = { closed: 0, pages: 0, visited: [] as string[], scheme: [] as unknown[] };
	const browser = {
		newPage: async () => {
			done.pages++;
			return {
				setViewport: async () => undefined,
				emulateMediaFeatures: async (f: unknown) => void done.scheme.push(f),
				goto: async (url: string) => void done.visited.push(url),
				evaluate: async (code: string) => page.evaluate?.(code),
				screenshot: async (o: { type: string; quality?: number }) => page.screenshot?.(o) ?? Buffer.alloc(0),
				close: async () => undefined,
			};
		},
		close: async () => void done.closed++,
	};
	return { browser, done };
};
const lit = png(
	[
		[
			[255, 255, 255, 255],
			[0, 0, 0, 255],
		],
	],
	[0],
);
const blank = png(
	[
		[
			[255, 255, 255, 255],
			[255, 255, 255, 255],
		],
	],
	[0],
);

describe('drawing a prototype’s picture, headless', () => {
	const drawWith = (page: Parameters<typeof fakeBrowser>[0]) => {
		const { browser, done } = fakeBrowser(page);
		const launch = vi.fn(async () => browser);
		return { headless: chromeHeadless({ find: () => '/chrome', launch: launch as never }), launch, done };
	};

	it('is the page once it is ready, in light, fitted to its budget', async () => {
		const { headless, done } = drawWith({
			evaluate: () => ({ capped: false }),
			screenshot: (o) => (o.type === 'png' ? lit : Buffer.from('jpeg')),
		});
		expect((await headless.draw('http://127.0.0.1:1/p.html'))?.toString()).toBe('jpeg');
		expect(done.visited).toEqual(['http://127.0.0.1:1/p.html']);
		expect(done.scheme).toEqual([[{ name: 'prefers-color-scheme', value: 'light' }]]);
	});

	it('is nothing for a page that never settles, or painted nothing', async () => {
		expect(await drawWith({ evaluate: () => ({ capped: true }), screenshot: () => lit }).headless.draw('http://x/')).toBeNull();
		expect(await drawWith({ evaluate: () => ({ capped: false }), screenshot: () => blank }).headless.draw('http://x/')).toBeNull();
	});

	it('starts the browser once, and keeps it until it is closed', async () => {
		const { headless, launch, done } = drawWith({ evaluate: () => ({ capped: false }), screenshot: () => lit });
		await headless.draw('http://x/a');
		await headless.draw('http://x/b');
		expect(launch).toHaveBeenCalledTimes(1);
		expect(launch).toHaveBeenCalledWith('/chrome');
		await headless.close();
		expect(done.closed).toBe(1);
	});
});

describe('checking a page for accessibility, headless', () => {
	it('runs axe in each of its states, one run each, or the page as it opens', async () => {
		const found = { violations: [], incomplete: [] };
		const { browser, done } = fakeBrowser({ evaluate: (code) => (code.includes('window.axe.run') ? found : undefined) });
		const headless = chromeHeadless({ find: () => '/chrome', launch: (async () => browser) as never });
		expect(await headless.scan('http://x/p.html', ['default', 'empty'], ['wcag2a'])).toEqual([
			{ state: 'default', ...found },
			{ state: 'empty', ...found },
		]);
		expect(done.visited).toEqual(['http://x/p.html?state=default', 'http://x/p.html?state=empty']);
		expect(await headless.scan('http://x/p.html', [], ['wcag2a'])).toEqual([{ state: 'default', ...found }]);
	});

	it('fails in words when a state gives no results', async () => {
		const { browser } = fakeBrowser({ evaluate: () => 'nothing' });
		const headless = chromeHeadless({ find: () => '/chrome', launch: (async () => browser) as never });
		await expect(headless.scan('http://x/p.html', ['empty'], [])).rejects.toThrow(
			"The accessibility check did not finish in the page's empty state.",
		);
	});
});

describe('a machine with no browser', () => {
	it('says what to install, for pictures and checks alike, and starts nothing', async () => {
		const launch = vi.fn();
		const headless = chromeHeadless({ find: () => null, launch: launch as never });
		await expect(headless.draw('http://x/')).rejects.toThrow(NO_BROWSER);
		await expect(headless.scan('http://x/', [], [])).rejects.toThrow(NO_BROWSER);
		expect(launch).not.toHaveBeenCalled();
		expect(NO_BROWSER).toMatch(/Chrome, Edge or Chromium/);
	});
});
