import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import axe from 'axe-core';
import type { AxeRun } from '../../../shared/accessibility';
import { previewAddress } from '../../../shared/catalog';
import { withState } from '../../../shared/prototypeStates';
import type { Headless } from '../../ports';
import { CHECKED_IN, CHECK_WINDOW, axeFound, axeInPage } from '../accessibility/accessibilityCheck';
import type { CheckPage } from '../../ports';
import type { Drawn } from '../designSystem/componentTokens';
import type { Measure } from '../../ports';
import { fitJpegBy } from '../prototypes/picture';
import { COMPOSITION, painted, placeAround, placeOnWhite } from '../prototypes/pictureComposition';
import { decodePng } from '../prototypes/png';
import { COVER_BUDGET, COVER_STEPS, COVER_WINDOW, isBlank, settleScript } from '../prototypes/projectCovers';
import type { DrawCover } from '../../ports';
import {
	PICTURE_MOST_ACROSS,
	PICTURE_QUALITY,
	PICTURE_SCALE,
	PICTURE_TOP,
	STORY_MS,
	type Share,
	WINDOW,
	drawEach,
	measureWith,
	readDrawn,
} from '../designSystem/storyDrawing';
import { type ProbeOptions, type ProbePage, type ViewProbed, probeView } from '../accessibility/probe/probe';
import { within } from '../platform/within';
import PICTURE from '../../../page/picture?page';

/** Said when there is no browser to draw or check with: what to install, or where to point. */
export const NO_BROWSER =
	'Drawing pictures and checking accessibility need Chrome, Edge or Chromium on this machine. Install one, or set CHROME_BIN to one, then open DSNR again.';

/** Where each installs, on each system, in the order they are looked for. */
const PLACES: Record<string, string[]> = {
	darwin: [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
		'/Applications/Chromium.app/Contents/MacOS/Chromium',
	],
	linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
	win32: [
		join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
		join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
	],
};

/** The browser to draw and check with: `CHROME_BIN` when it is set, else Chrome, Edge or Chromium where each installs. */
export const findChrome = (
	env: NodeJS.ProcessEnv = process.env,
	exists: (p: string) => boolean = existsSync,
	platform: string = process.platform,
): string | null => {
	if (env.CHROME_BIN && exists(env.CHROME_BIN)) return env.CHROME_BIN;
	return (PLACES[platform] ?? []).find(exists) ?? null;
};

/** The slice of puppeteer's page this uses, so it is tested without a browser. */
interface PageLike {
	setViewport(v: { width: number; height: number; deviceScaleFactor: number }): Promise<void>;
	emulateMediaFeatures(features: { name: string; value: string }[]): Promise<void>;
	goto(url: string, o: { waitUntil: 'load'; timeout: number }): Promise<unknown>;
	evaluate(code: string): Promise<unknown>;
	screenshot(o: {
		type: 'png' | 'jpeg';
		quality?: number;
		optimizeForSpeed?: boolean;
		captureBeyondViewport?: boolean;
		clip: { x: number; y: number; width: number; height: number; scale?: number };
	}): Promise<Uint8Array>;
	/** Told of an error the page's own code throws (puppeteer's `pageerror`). */
	on?(event: 'pageerror', listener: (err: unknown) => void): void;
	close(): Promise<void>;
}
interface BrowserLike {
	newPage(): Promise<PageLike>;
	close(): Promise<void>;
	/** Told when the browser is gone (it crashed, or was ended outside DSNR), as puppeteer's is. */
	on?(event: 'disconnected', listener: () => void): unknown;
}

/** Starts the browser at `path`, headless, through puppeteer: loaded when first needed, as the app loads its own tools. */
const launchChrome = async (path: string): Promise<BrowserLike> => {
	const { default: puppeteer } = await import('puppeteer-core');
	return (await puppeteer.launch({ executablePath: path, headless: true, args: ['--hide-scrollbars', '--mute-audio'] })) as unknown as BrowserLike;
};

/** A call to the picture's page code (`page/picture.ts`, bundled to text when DSNR is built), given what it needs as one object. */
const inPage = (name: 'encodeJpeg' | 'readyToPicture' | 'pictured', args: unknown = {}): string =>
	`(async () => {\n${PICTURE}\nreturn await __fdPage.${name}(${JSON.stringify(args)});\n})()`;

/**
 * A story's picture, from a PNG of the top of its page (`PICTURE_TOP` down, at `PICTURE_SCALE`): what it painted, placed
 * on white as the app's are (`placeOnWhite`), then drawn by the page's own canvas at most `PICTURE_MOST_ACROSS` across, as
 * JPEG. Only the PNG and where it goes are handed to the page, never the pixels; nothing when it painted nothing.
 */
const encodeInPage = (png: Buffer, place: NonNullable<ReturnType<typeof placeOnWhite>>): string =>
	inPage('encodeJpeg', { png: png.toString('base64'), place, most: PICTURE_MOST_ACROSS, quality: PICTURE_QUALITY / 100 });

/** A story's picture as the composition makes it, from a full capture: exact for any story, and the slower way. Exported for its test. */
export const composedPicture = async (page: PageLike): Promise<Buffer | undefined> => {
	const png = Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: WINDOW.width, height: PICTURE_TOP } }));
	const { width, height, rgba } = decodePng(png);
	const place = placeOnWhite({ data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height });
	if (place === null) return undefined;
	const jpeg = await page.evaluate(encodeInPage(png, place));
	return typeof jpeg === 'string' && jpeg !== '' ? Buffer.from(jpeg, 'base64') : undefined;
};

/** Readies the page for the picture's one region (`readyToPicture`), and undoes it (`pictured`). */
const readyToPicture = (cut: boolean, dx: number, dy: number) => inPage('readyToPicture', { cut, dx, dy, width: WINDOW.width, height: PICTURE_TOP });
const pictured = inPage('pictured');

/**
 * A story's picture, the same as the composition's (`composedPicture`) and about twice as fast (about 220 ms against 470): what it painted is found
 * from a capture at half the size (a quarter of the pixels to read, one per pixel of the page, with one more each side for
 * what halving blurs), placed as the composition places it (`placeAround`), and then the browser takes that one region as
 * the JPEG itself, so no capture is read back into the page or drawn again. The page behind the stories is white, as the
 * composition's canvas is; a story that runs past what is captured is clipped to it, as the composition sees it; one whose
 * region would start above or left of the page is moved into view, and one wider or taller than the window is taken past
 * it. Where that cannot hold (something drawn outside the stories, such as an open dialog, or something fixed to the window
 * in a story that would have to move), the composition makes it. Exported for its test.
 */
export const pictureOf = async (page: PageLike): Promise<Buffer | undefined> => {
	const small = Buffer.from(
		await page.screenshot({
			type: 'png',
			optimizeForSpeed: true,
			clip: { x: 0, y: 0, width: WINDOW.width, height: PICTURE_TOP, scale: 1 / PICTURE_SCALE },
		}),
	);
	const { width, height, rgba } = decodePng(small);
	const found = painted({ data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height });
	if (found === null) return undefined;
	const [left, top] = [Math.max(0, found.x - 1), Math.max(0, found.y - 1)];
	const [right, bottom] = [Math.min(width, found.x + found.width + 1), Math.min(height, found.y + found.height + 1)];
	const place = placeAround({
		x: left * PICTURE_SCALE,
		y: top * PICTURE_SCALE,
		width: (right - left) * PICTURE_SCALE,
		height: (bottom - top) * PICTURE_SCALE,
	});
	// The region, in the page's own pixels, and how far the story moves so the region starts on the page.
	// On whole pixels of the page, so the picture is exactly its size, not a pixel more where a half pixel is rounded up.
	const region = {
		x: Math.round(left - place.left / PICTURE_SCALE),
		y: Math.round(top - place.top / PICTURE_SCALE),
		width: place.width / PICTURE_SCALE,
		height: place.height / PICTURE_SCALE,
	};
	const [dx, dy] = [Math.max(0, -region.x), Math.max(0, -region.y)];
	if ((await page.evaluate(readyToPicture(right >= width || bottom >= height, dx, dy))) !== true) return composedPicture(page);
	try {
		const scale = Math.min(1, PICTURE_MOST_ACROSS / place.width);
		const clip = { x: region.x + dx, y: region.y + dy, width: region.width, height: region.height, scale };
		// A region wider or taller than the window is taken past it, where the page is white too.
		return Buffer.from(await page.screenshot({ type: 'jpeg', quality: PICTURE_QUALITY, optimizeForSpeed: true, captureBeyondViewport: true, clip }));
	} finally {
		await page.evaluate(pictured);
	}
};

/** How pictures are taken here, as a fingerprint of the code that takes them: never the same as the app's (`PICTURE_RECIPE`). */
export const HEADLESS_PICTURE_RECIPE = createHash('sha256')
	.update(
		`headless${readDrawn('', true)}${PICTURE}${composedPicture}${pictureOf}${COMPOSITION}${[WINDOW.width, PICTURE_TOP, PICTURE_SCALE, PICTURE_MOST_ACROSS, PICTURE_QUALITY]}`,
	)
	.digest('hex')
	.slice(0, 12);

/** The most loading the page, and then its getting ready, may take. */
const LOAD_MS = 15_000;
const READY_MS = 12_000;
const STATE_MS = 20_000;

/**
 * Drawing out of sight with the browser already on the machine (`Headless`): a prototype's picture and its
 * accessibility check, one page at a time. The browser is started when first needed and kept,
 * as starting it takes a second; `close` ends it. With no browser here, each says what to install. And the Design System
 * tab's stories (`measure`), drawn from the script every drawing runs (`storyDrawing.ts`).
 */
export const chromeHeadless = ({
	find = () => findChrome(),
	launch = launchChrome,
	loadSettleMs = 4000,
}: {
	find?: () => string | null;
	launch?: (path: string) => Promise<BrowserLike>;
	/** How long a loaded page is given to draw, or to fail, before it is judged (`loads`). */
	loadSettleMs?: number;
} = {}): Headless & {
	loads(url: string): Promise<string | null>;
	probe(url: string, options: ProbeOptions): Promise<ViewProbed>;
	close(): Promise<void>;
} => {
	let browser: Promise<BrowserLike> | null = null;
	const started = (): Promise<BrowserLike> => {
		if (browser === null) {
			const path = find();
			if (path === null) return Promise.reject(new Error(NO_BROWSER));
			const launched = launch(path);
			browser = launched;
			// A start that failed, or a browser that is gone since (it crashed), is started again next time, not asked again.
			const gone = () => {
				if (browser === launched) browser = null;
			};
			launched.then((b) => b.on?.('disconnected', gone), gone);
		}
		return browser;
	};
	/** A page of its own for `work`, closed after, whatever happens. */
	const onPage = async <T>(work: (page: PageLike) => Promise<T>): Promise<T> => {
		const page = await (await started()).newPage();
		try {
			return await work(page);
		} finally {
			await page.close().catch(() => undefined);
		}
	};

	const draw: DrawCover = (url) =>
		onPage(async (page) => {
			await page.setViewport({ ...COVER_WINDOW, deviceScaleFactor: 1 });
			// Always in light, whatever the machine's theme.
			await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
			if ((await within(LOAD_MS, page.goto(url, { waitUntil: 'load', timeout: LOAD_MS }))) === null) return null;
			const ready = (await within(READY_MS, page.evaluate(settleScript()))) as { capped?: unknown } | null;
			if (ready === null || ready.capped !== false) return null;
			const clip = { x: 0, y: 0, ...COVER_WINDOW };
			if (isBlank(decodePng(Buffer.from(await page.screenshot({ type: 'png', clip }))).rgba)) return null;
			return fitJpegBy(
				async (width, quality) => Buffer.from(await page.screenshot({ type: 'jpeg', quality, clip: { ...clip, scale: width / COVER_WINDOW.width } })),
				COVER_BUDGET,
				COVER_STEPS,
			);
		}).catch((err: unknown) => {
			// No browser is said; any other failure is no picture, as in the app.
			if (err instanceof Error && err.message === NO_BROWSER) throw err;
			return null;
		});

	const scan: CheckPage = (url, states, tags) =>
		onPage(async (page) => {
			await page.setViewport({ ...CHECK_WINDOW, deviceScaleFactor: 1 });
			await page.emulateMediaFeatures([CHECKED_IN]);
			const runs: AxeRun[] = [];
			for (const state of states.length ? states : [null]) {
				const said = state ?? 'default';
				// With no state, the page's own address as given, its query and all: a product's page may be one.
				const at = state === null ? url : withState(url, state);
				const loaded = await within(STATE_MS, page.goto(at, { waitUntil: 'load', timeout: STATE_MS }));
				if (loaded === null) throw new Error(`The page did not load in its ${said} state, so it could not be checked.`);
				const found: unknown = await within(STATE_MS, page.evaluate(axeInPage(tags)));
				if (!axeFound(found)) throw new Error(`The accessibility check did not finish in the page's ${said} state.`);
				runs.push({ state: said, ...found });
			}
			return runs;
		});

	/**
	 * One page's share of a run: loaded once, in the run's mode, at twice
	 * the size for pictures, with axe in it when the run checks accessibility, then each file drawn in turn. A story that
	 * does not draw in time is null, and the rest go on; a page that does not load is null for all of its share.
	 */
	const drawShare = (share: Share): Promise<(Drawn | null)[]> =>
		onPage(async (page) => {
			const { base, mode, files, pictures, tags } = share;
			await page.setViewport({ ...WINDOW, deviceScaleFactor: pictures ? PICTURE_SCALE : 1 });
			// In its mode by its address, as a live frame is, so the values and the frame cannot be drawn two ways.
			const loaded = await within(STORY_MS, page.goto(previewAddress(base, files[0] as string, mode), { waitUntil: 'load', timeout: STORY_MS }));
			if (loaded === null) return files.map(() => null);
			if (tags) await within(STORY_MS, page.evaluate(`${axe.source};true`));
			return drawEach(
				share,
				(code) => page.evaluate(code),
				() => pictureOf(page),
			);
		}).catch((err: unknown) => {
			// No browser is said; any other failure is its share not drawn, as a window that fails is in the app.
			if (err instanceof Error && err.message === NO_BROWSER) throw err;
			return share.files.map(() => null);
		});

	/**
	 * The probe (A3 of the accessibility plan) on one view of a page, in a page of its own. It drives more of the page than
	 * the rest (keys, the pointer, the accessibility tree), which puppeteer's page has: the narrow `PageLike` is what the
	 * rest is tested against without a browser.
	 */
	const probe = (url: string, options: ProbeOptions): Promise<ViewProbed> => onPage((page) => probeView(page as unknown as ProbePage, url, options));

	/** A few runs at once, each in a few pages at once (`measureWith`). */
	const measure: Measure = measureWith(drawShare);

	/**
	 * Whether a page really loads (Run locally): a server can answer while the app on it fails, so the page is opened here,
	 * given a moment, and judged. Null when it drew something; else its own error, or that it drew nothing.
	 */
	const loads = (url: string): Promise<string | null> =>
		onPage(async (page) => {
			const errors: string[] = [];
			page.on?.('pageerror', (err) => errors.push(err instanceof Error ? err.message : String(err)));
			await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
			if ((await within(LOAD_MS, page.goto(url, { waitUntil: 'load', timeout: LOAD_MS }))) === null) return 'the page did not load in time.';
			await new Promise((resolve) => setTimeout(resolve, loadSettleMs));
			if (errors.length > 0) return errors[0] as string;
			// Drawn: text in the document, or, for an app that draws in a canvas or behind a shadow root, anything painted.
			const text = Number(await page.evaluate('document.body ? document.body.innerText.trim().length : 0'));
			if (text > 0) return null;
			const drew = !isBlank(decodePng(Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 800 } }))).rgba);
			return drew ? null : 'the page loaded, but the app drew nothing on it.';
		});

	return {
		draw,
		scan,
		probe,
		measure,
		loads,
		close: async () => {
			const open = browser;
			browser = null;
			if (open) await (await open.catch(() => null))?.close();
		},
	};
};
