import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AxeRun } from '../../shared/accessibility';
import { withState } from '../../shared/prototypeStates';
import type { Headless } from '../ports';
import { CHECK_WINDOW, type CheckPage, axeFound, axeInPage } from './accessibilityCheck';
import { fitJpegBy } from './picture';
import { decodePng } from './png';
import { COVER_BUDGET, COVER_STEPS, COVER_WINDOW, type DrawCover, isBlank, settleScript } from './projectCovers';
import { within } from './within';

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
		clip: { x: number; y: number; width: number; height: number; scale?: number };
	}): Promise<Uint8Array>;
	close(): Promise<void>;
}
interface BrowserLike {
	newPage(): Promise<PageLike>;
	close(): Promise<void>;
}

/** Starts the browser at `path`, headless, through puppeteer: loaded when first needed, as the app loads its own tools. */
const launchChrome = async (path: string): Promise<BrowserLike> => {
	const { default: puppeteer } = await import('puppeteer-core');
	return (await puppeteer.launch({ executablePath: path, headless: true, args: ['--hide-scrollbars', '--mute-audio'] })) as unknown as BrowserLike;
};

/** The most loading the page, and then its getting ready, may take, as the app's hidden windows allow. */
const LOAD_MS = 15_000;
const READY_MS = 12_000;
const STATE_MS = 20_000;

/**
 * Drawing out of sight with the browser already on the machine (`Headless`, ELECTRON_MIGRATION_PLAN 2B), for a shell
 * with no hidden windows: a prototype's picture and its accessibility check, done as the app's hidden windows do them
 * (`coverWindow.ts`, `accessibilityWindow.ts`), one page at a time. The browser is started when first needed and kept,
 * as starting it takes a second; `close` ends it. With no browser here, each says what to install. Drawing stories
 * (`measure`) is the Design System tab's, and comes with it.
 */
export const chromeHeadless = ({
	find = () => findChrome(),
	launch = launchChrome,
}: { find?: () => string | null; launch?: (path: string) => Promise<BrowserLike> } = {}): Headless & { close(): Promise<void> } => {
	let browser: Promise<BrowserLike> | null = null;
	const started = (): Promise<BrowserLike> => {
		if (browser === null) {
			const path = find();
			if (path === null) return Promise.reject(new Error(NO_BROWSER));
			browser = launch(path);
			// A start that failed is tried again next time.
			browser.catch(() => (browser = null));
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
			const runs: AxeRun[] = [];
			for (const state of states.length ? states : [null]) {
				const said = state ?? 'default';
				const loaded = await within(STATE_MS, page.goto(withState(url, state), { waitUntil: 'load', timeout: STATE_MS }));
				if (loaded === null) throw new Error(`The page did not load in its ${said} state, so it could not be checked.`);
				const found: unknown = await within(STATE_MS, page.evaluate(axeInPage(tags)));
				if (!axeFound(found)) throw new Error(`The accessibility check did not finish in the page's ${said} state.`);
				runs.push({ state: said, ...found });
			}
			return runs;
		});

	return {
		draw,
		scan,
		measure: async () => {
			throw new Error('Drawing stories comes to DSNR in VS Code with the Design System tab.');
		},
		close: async () => {
			const open = browser;
			browser = null;
			if (open) await (await open.catch(() => null))?.close();
		},
	};
};
