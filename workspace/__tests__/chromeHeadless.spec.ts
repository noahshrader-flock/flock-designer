import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { HEADLESS_PICTURE_RECIPE, NO_BROWSER, chromeHeadless, findChrome } from '../src/core/services/chromeHeadless';
import { fitJpegBy } from '../src/core/services/picture';
import { decodePng } from '../src/core/services/png';

/**
 * Drawing out of sight: the browser already on the machine (Chrome, Edge or Chromium), driven headless, draws a
 * prototype's picture and checks its page, and a machine with none says so.
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
const fakeBrowser = (page: {
	evaluate?: (code: string) => unknown;
	screenshot?: (o: { type: string; quality?: number }) => Buffer;
	errors?: string[];
}) => {
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
				on: (event: string, listener: (err: Error) => void) => {
					if (event === 'pageerror') for (const e of page.errors ?? []) listener(new Error(e));
				},
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

	it('starts the browser again after it is gone, as when it crashed, rather than asking the one that is gone', async () => {
		const { browser } = fakeBrowser({ evaluate: () => ({ capped: false }), screenshot: () => lit });
		let gone: (() => void) | null = null;
		const launch = vi.fn(async () => ({ ...browser, on: (_: 'disconnected', listener: () => void) => void (gone = listener) }));
		const headless = chromeHeadless({ find: () => '/chrome', launch: launch as never });
		await headless.draw('http://x/a');
		(gone as unknown as () => void)();
		await headless.draw('http://x/b');
		expect(launch).toHaveBeenCalledTimes(2);
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
		const { browser, done } = fakeBrowser({ evaluate: (code) => (code.includes('__fdPage.checkPage(') ? found : undefined) });
		const headless = chromeHeadless({ find: () => '/chrome', launch: (async () => browser) as never });
		expect(await headless.scan('http://x/p.html', ['default', 'empty'], ['wcag2a'])).toEqual([
			{ state: 'default', ...found },
			{ state: 'empty', ...found },
		]);
		expect(done.visited).toEqual(['http://x/p.html?state=default', 'http://x/p.html?state=empty']);
		expect(await headless.scan('http://x/p.html', [], ['wcag2a'])).toEqual([{ state: 'default', ...found }]);
		// A page as it opens is its own address, query and all: a product's page may be one.
		await headless.scan('http://x/devices?tab=list', [], ['wcag2a']);
		expect(done.visited.at(-1)).toBe('http://x/devices?tab=list');
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

describe('drawing stories, headless (6.1, the Design System tab’s pictures and its index of tokens)', () => {
	/** A page that draws what it is told: each story file read as `drawn`, axe when it is in the page. */
	const storyBrowser = ({ fails = [] as string[], axe = false, painted = lit, loadMs = 0 } = {}) => {
		const done = {
			pages: 0,
			open: 0,
			most: 0,
			visited: [] as string[],
			scheme: [] as unknown[],
			scale: [] as number[],
			axeLoaded: 0,
			encoded: 0,
			jpegs: 0,
			/** What each drawing was asked to vary, as the page's script was given it. */
			varied: [] as unknown[],
		};
		const browser = {
			newPage: async () => {
				done.pages++;
				done.most = Math.max(done.most, ++done.open);
				return {
					setViewport: async (v: { deviceScaleFactor: number }) => void done.scale.push(v.deviceScaleFactor),
					emulateMediaFeatures: async (f: unknown) => void done.scheme.push(f),
					goto: async (url: string) => {
						done.visited.push(url);
						await new Promise((r) => setTimeout(r, loadMs));
					},
					evaluate: async (code: string) => {
						if (code.includes('__fdPage.encodeJpeg(')) return (done.encoded++, Buffer.from('jpeg').toString('base64'));
						// The drawing's script asks the page code for one story file, as one object (`readDrawn`).
						const asked = /__fdPage\.readDrawn\((\{.*\})\);\n\}\)\(\)$/.exec(code);
						if (!asked) return (done.axeLoaded++, true);
						const { file: name, vary } = JSON.parse(asked[1] as string) as { file: string; vary: unknown };
						done.varied.push(vary);
						if (fails.includes(name)) throw new Error('did not draw');
						return { colors: { [name]: 1 }, radii: {}, spacing: {}, ...(axe ? { accessibility: { violations: [], incomplete: [] } } : {}) };
					},
					// A capture to find what is painted is a PNG; the picture itself the browser takes as the JPEG.
					screenshot: async ({ type }: { type: string }) => (type === 'jpeg' ? (done.jpegs++, Buffer.from('jpeg')) : painted),
					close: async () => void done.open--,
				};
			},
			close: async () => undefined,
		};
		return { headless: chromeHeadless({ find: () => '/chrome', launch: (async () => browser) as never }), done };
	};
	const files = ['a.stories.tsx', 'b.stories.tsx', 'c.stories.tsx', 'd.stories.tsx'];

	it('draws each run’s files in a few pages, each page loaded once, in the run’s mode, and gives them back in order', async () => {
		const { headless, done } = storyBrowser();
		const [light, dark] = await headless.measure([
			{ base: 'http://127.0.0.1:1/p/', mode: 'light', files },
			{ base: 'http://127.0.0.1:1/p/', mode: 'dark', files: files.slice(0, 1) },
		]);
		expect(light?.map((d) => Object.keys(d?.colors ?? {})[0])).toEqual(files);
		expect(dark?.map((d) => Object.keys(d?.colors ?? {})[0])).toEqual(['a.stories.tsx']);
		// Three pages for the first run (every third file each), one for the second; each loaded at its share's first file.
		expect(done.pages).toBe(4);
		expect(done.visited).toEqual([
			'http://127.0.0.1:1/p/?file=a.stories.tsx',
			'http://127.0.0.1:1/p/?file=b.stories.tsx',
			'http://127.0.0.1:1/p/?file=c.stories.tsx',
			// In dark by its address, as a live frame is, not by what the browser is told: the one way, so the values and a frame agree.
			'http://127.0.0.1:1/p/?file=a.stories.tsx&theme=dark',
		]);
		expect(done.scheme).toEqual([]);
		expect(done.scale).toEqual([1, 1, 1, 1]);
	});

	it('gives the page each file’s drawing with the props to vary, when a run varies them, and none when it does not', async () => {
		const { headless, done } = storyBrowser({ loadMs: 0 });
		const vary = { stories: ['Default'], props: [{ name: 'size', values: ['sm', 'lg'] }] };
		await headless.measure([{ base: 'http://x/', mode: 'light', files: ['a.stories.tsx'], vary }]);
		await headless.measure([{ base: 'http://x/', mode: 'light', files: ['b.stories.tsx'] }]);
		expect(done.varied).toEqual([vary, null]);
	});

	it('draws two runs at once, in the order given, and gives every run back in its place', async () => {
		const { headless, done } = storyBrowser({ loadMs: 20 });
		const runs = ['a', 'b', 'c', 'd'].map((f) => ({ base: 'http://x/', mode: 'light' as const, files: [`${f}.stories.tsx`] }));
		const drawn = await headless.measure(runs);
		expect(drawn.map((run) => Object.keys(run[0]?.colors ?? {})[0])).toEqual(['a.stories.tsx', 'b.stories.tsx', 'c.stories.tsx', 'd.stories.tsx']);
		// One page a run, as each has one file: never more than two open, and they are started in the order given.
		expect(done.most).toBe(2);
		expect(done.visited).toEqual([
			'http://x/?file=a.stories.tsx',
			'http://x/?file=b.stories.tsx',
			'http://x/?file=c.stories.tsx',
			'http://x/?file=d.stories.tsx',
		]);
	});

	it('keeps to two runs at once across asks made at the same time, as the pass makes them while its tags are built', async () => {
		const { headless, done } = storyBrowser({ loadMs: 20 });
		const run = (f: string) => ({ base: 'http://x/', mode: 'light' as const, files: [`${f}.stories.tsx`] });
		const [first, second] = await Promise.all([headless.measure([run('a'), run('b')]), headless.measure([run('c'), run('d')])]);
		expect([...first, ...second].map((r) => Object.keys(r[0]?.colors ?? {})[0])).toEqual([
			'a.stories.tsx',
			'b.stories.tsx',
			'c.stories.tsx',
			'd.stories.tsx',
		]);
		expect(done.most).toBe(2);
	});

	it('takes a picture of each, at twice the size, as a JPEG the browser takes, only when asked; none of one that painted nothing', async () => {
		const { headless, done } = storyBrowser();
		const [drawn] = await headless.measure([{ base: 'http://x/', mode: 'light', files: files.slice(0, 2), pictures: true }]);
		expect(drawn?.map((d) => d?.picture?.toString())).toEqual(['jpeg', 'jpeg']);
		expect(done.scale).toEqual([2, 2]);
		// Taken by the browser as the JPEG, not drawn again in the page.
		expect([done.jpegs, done.encoded]).toEqual([2, 0]);
		const none = storyBrowser({ painted: blank });
		const [unpainted] = await none.headless.measure([{ base: 'http://x/', mode: 'light', files: files.slice(0, 1), pictures: true }]);
		expect(unpainted?.[0]?.picture).toBeUndefined();
		expect(none.done.encoded).toBe(0);
	});

	it('loads axe once a page when the run checks accessibility, and gives what it found', async () => {
		const { headless, done } = storyBrowser({ axe: true });
		const [drawn] = await headless.measure([{ base: 'http://x/', mode: 'light', files: files.slice(0, 1), accessibility: ['wcag2a'] }]);
		expect(drawn?.[0]?.accessibility).toEqual({ violations: [], incomplete: [] });
		expect(done.axeLoaded).toBe(1);
		const without = storyBrowser({ axe: true });
		await without.headless.measure([{ base: 'http://x/', mode: 'light', files: files.slice(0, 1) }]);
		expect(without.done.axeLoaded).toBe(0);
	});

	it('says null for a story that does not draw, and draws the rest', async () => {
		const { headless } = storyBrowser({ fails: ['b.stories.tsx'] });
		const [drawn] = await headless.measure([{ base: 'http://x/', mode: 'light', files: files.slice(0, 2) }]);
		expect(drawn?.map((d) => (d === null ? null : Object.keys(d.colors)[0]))).toEqual(['a.stories.tsx', null]);
	});

	it('says what to install when there is no browser', async () => {
		await expect(chromeHeadless({ find: () => null }).measure([{ base: 'http://x/', mode: 'light', files }])).rejects.toThrow(NO_BROWSER);
	});

	it('has a fingerprint of how it pictures, so a picture drawn another way (the app’s) is drawn again rather than shown', () => {
		expect(HEADLESS_PICTURE_RECIPE).toMatch(/^[0-9a-f]{12}$/);
	});
});

describe('whether a page loads (Run locally checks before it opens anything)', () => {
	const loadsWith = (page: Parameters<typeof fakeBrowser>[0]) => {
		const { browser, done } = fakeBrowser(page);
		return { headless: chromeHeadless({ find: () => '/chrome', launch: (async () => browser) as never, loadSettleMs: 0 }), done };
	};

	it('is null for a page that draws something', async () => {
		const { headless, done } = loadsWith({ evaluate: () => 120 });
		expect(await headless.loads('http://localhost:3000/zones')).toBeNull();
		expect(done.visited).toEqual(['http://localhost:3000/zones']);
	});

	it('is the page’s own error when it throws as it loads', async () => {
		const { headless } = loadsWith({ evaluate: () => 0, errors: ["Cannot read properties of undefined (reading 'None')"] });
		expect(await headless.loads('http://localhost:3000/')).toBe("Cannot read properties of undefined (reading 'None')");
	});

	it('says so when the page draws nothing at all: no text, and nothing painted', async () => {
		const { headless } = loadsWith({ evaluate: () => 0, screenshot: () => blank });
		expect(await headless.loads('http://localhost:3000/')).toBe('the page loaded, but the app drew nothing on it.');
	});

	it('takes an app that paints without text in the document (a canvas, a shadow root) as drawn', async () => {
		const { headless } = loadsWith({ evaluate: () => 0, screenshot: () => lit });
		expect(await headless.loads('http://localhost:3000/')).toBeNull();
	});
});
