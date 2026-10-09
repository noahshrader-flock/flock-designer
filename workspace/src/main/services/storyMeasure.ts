/**
 * Drawing stories to read what they draw (T6 of the design system plan), in hidden windows as sandboxed as the preview
 * frames are (no preload, no Node, a throwaway session, nothing it can open or navigate to), in the mode asked for. The
 * mode is set for each window alone, by the page's `prefers-color-scheme`, so the app's own appearance is never changed.
 * Each window loads the preview page once and draws its share of the story files in it, one after another; a story that
 * does not draw in time is said as null, and the rest go on.
 */
import { BrowserWindow } from 'electron';
import { previewAddress } from '../../shared/catalog';
import type { Drawn, Measure } from './componentTokens';

/** How many windows draw each set of pages, and how long one story may take. */
const WINDOWS_PER_RUN = 3;
const STORY_MS = 15_000;

/**
 * What a story file draws, read in the page once it has drawn: the page draws the file in place of the last
 * (`__dsnrShow`), so the page is loaded once for many. Then its fonts, and what animates in, settle, and its stories'
 * elements that take up room are read: each one's background, text and border colors, its radius, and its padding,
 * margins and gaps, counted by computed value.
 */
const readDrawn = (file: string): string => `(async (file) => {
	const until = Date.now() + ${STORY_MS - 3000};
	while (typeof window.__dsnrShow !== 'function' && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
	await window.__dsnrShow(file);
	await document.fonts.ready;
	const settled = Date.now() + 600;
	while (document.getAnimations().some((a) => a.playState === 'running') && Date.now() < settled) await new Promise((r) => setTimeout(r, 25));
	const drawn = { colors: {}, radii: {}, spacing: {} };
	const add = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
	for (const el of document.querySelectorAll('#root *')) {
		const box = el.getBoundingClientRect();
		if (box.width === 0 || box.height === 0) continue;
		const s = getComputedStyle(el);
		add(drawn.colors, s.backgroundColor);
		add(drawn.colors, s.color);
		if (parseFloat(s.borderTopWidth) > 0) add(drawn.colors, s.borderTopColor);
		add(drawn.radii, s.borderTopLeftRadius);
		for (const k of ['paddingTop', 'paddingLeft', 'marginTop', 'marginLeft', 'rowGap', 'columnGap']) add(drawn.spacing, s[k]);
	}
	return drawn;
})(${JSON.stringify(file)})`;

/** A promise, or null after `ms`. */
const within = <T>(ms: number, p: Promise<T>): Promise<T | null> =>
	Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

const hiddenWindow = (): BrowserWindow => {
	const win = new BrowserWindow({
		show: false,
		width: 1200,
		height: 900,
		// Not throttled for being out of sight: its timers and drawing run as a shown window's do.
		webPreferences: {
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: true,
			partition: 'dsnr-story-measure',
			backgroundThrottling: false,
		},
	});
	win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	// Only the preview page it was given, and its own addresses on the local server.
	win.webContents.on('will-navigate', (event, target) => {
		if (!target.startsWith('http://127.0.0.1:')) event.preventDefault();
	});
	return win;
};

/** One window's share of a run: the page loaded once, in the run's mode, then each file drawn in turn. */
const drawShare = async (base: string, mode: 'light' | 'dark', files: string[]): Promise<(Drawn | null)[]> => {
	const win = hiddenWindow();
	try {
		const wc = win.webContents;
		// The mode is set on a page: on a window that has none, the command never answers. It holds for the pages after.
		await wc.loadURL('about:blank');
		wc.debugger.attach('1.3');
		const set = await within(STORY_MS, wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] }));
		const loaded = set === null ? null : await within(STORY_MS, wc.loadURL(previewAddress(base, files[0] as string)).then(() => true));
		if (loaded === null) return files.map(() => null);
		const drawn: (Drawn | null)[] = [];
		for (const file of files) drawn.push((await within(STORY_MS, wc.executeJavaScript(readDrawn(file)) as Promise<Drawn>)) ?? null);
		return drawn;
	} finally {
		win.destroy();
	}
};

export const measureInWindows: Measure = async (runs) =>
	Promise.all(
		runs.map(async ({ base, mode, files }) => {
			// Each window takes every third file, so the slow ones are spread out.
			const shares = Array.from({ length: Math.min(WINDOWS_PER_RUN, files.length) }, (_, w) => files.filter((_, i) => i % WINDOWS_PER_RUN === w));
			const drawn = await Promise.all(shares.map((share) => drawShare(base, mode, share)));
			return files.map((_, i) => drawn[i % WINDOWS_PER_RUN]?.[Math.floor(i / WINDOWS_PER_RUN)] ?? null);
		}),
	);
