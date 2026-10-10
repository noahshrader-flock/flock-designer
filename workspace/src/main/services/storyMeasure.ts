/**
 * Drawing stories to read what they draw (T6 of the design system plan), in hidden windows as sandboxed as the preview
 * frames are (no preload, no Node, a throwaway session, nothing it can open or navigate to), in the mode asked for. The
 * mode is set for each window alone, by the page's `prefers-color-scheme`, so the app's own appearance is never changed.
 * Each window loads the preview page once and draws its share of the story files in it, one after another; a story that
 * does not draw in time is said as null, and the rest go on.
 */
import { BrowserWindow } from 'electron';
import { PREVIEW_SHOW, previewAddress } from '../../shared/catalog';
import type { Drawn, Measure, Mode } from './componentTokens';
import { keepToOrigin, sandboxedPreferences } from './sandboxedPage';

/** How many windows draw a run's files at once, and how long one story may take. */
const WINDOWS_PER_RUN = 3;
const STORY_MS = 15_000;
/**
 * A picture (P5): taken at twice the size a card shows it, at most this many pixels across and down, with a little room
 * around what the story draws.
 */
const PICTURE_MAX = { width: 720, height: 360 };
const PICTURE_MARGIN = 12;
const PICTURE_QUALITY = 85;

/** The windows' session: their own, in memory only. */
const SESSION = 'dsnr-story-measure';

/**
 * What a story file draws, read in the page once it has drawn: the page draws the file in place of the last
 * (`PREVIEW_SHOW`), so the page is loaded once for many. Then its fonts, and what animates in, settle, and its stories'
 * elements that take up room are read: each one's background, text and border colors, its radius, and its padding,
 * margins and gaps, counted by computed value.
 */
const readDrawn = (file: string): string => `(async (file) => {
	const until = Date.now() + ${STORY_MS - 3000};
	while (typeof window[${JSON.stringify(PREVIEW_SHOW)}] !== 'function' && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
	await window[${JSON.stringify(PREVIEW_SHOW)}](file);
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
	// Where the first story draws, for its picture (P5): around what it paints, its name left out, within the window.
	const first = document.querySelector('[data-story]');
	let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const el of first ? first.querySelectorAll('*') : []) {
		if (el.closest('.fd-name')) continue;
		const box = el.getBoundingClientRect();
		if (box.width === 0 || box.height === 0) continue;
		const s = getComputedStyle(el);
		const paints = el.children.length === 0 || s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none';
		if (!paints) continue;
		[l, t, r, b] = [Math.min(l, box.left), Math.min(t, box.top), Math.max(r, box.right), Math.max(b, box.bottom)];
	}
	// Never above the bottom of the story's name, which the room around it would otherwise take in.
	const label = first?.querySelector('.fd-name')?.getBoundingClientRect();
	const x = Math.max(0, Math.floor(l) - ${PICTURE_MARGIN}), y = Math.max(label ? Math.ceil(label.bottom) : 0, Math.floor(t) - ${PICTURE_MARGIN});
	drawn.crop = r > l && b > t ? { x, y, width: Math.min(innerWidth - x, Math.ceil(r) + ${PICTURE_MARGIN} - x), height: Math.min(innerHeight - y, Math.ceil(b) + ${PICTURE_MARGIN} - y) } : null;
	return drawn;
})(${JSON.stringify(file)})`;

/** A promise, or null after `ms`. */
const within = <T>(ms: number, p: Promise<T>): Promise<T | null> =>
	Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** A window nobody sees, held as a shown preview is, on the previews' own origin; not throttled for being out of sight. */
const hiddenWindow = (origin: string): BrowserWindow => {
	const win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { ...sandboxedPreferences(SESSION), backgroundThrottling: false } });
	keepToOrigin(win.webContents, () => origin);
	return win;
};

/** One window's share of a run: the page loaded once, in the run's mode, then each file drawn in turn. */
/** A story's first story, from where the page said it draws, as a JPEG no larger than a card needs; null for nothing. */
const pictureOf = async (wc: Electron.WebContents, crop: Electron.Rectangle | null | undefined): Promise<Buffer | undefined> => {
	if (!crop || crop.width < 4 || crop.height < 4) return undefined;
	const image = await wc.capturePage(crop);
	const { width, height } = image.getSize();
	const scale = Math.min(1, PICTURE_MAX.width / width, PICTURE_MAX.height / height);
	return (scale < 1 ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }) : image).toJPEG(PICTURE_QUALITY);
};

const drawShare = async (base: string, mode: Mode, files: string[], pictures: boolean): Promise<(Drawn | null)[]> => {
	const win = hiddenWindow(new URL(base).origin);
	try {
		const wc = win.webContents;
		// The mode is set on a page: on a window that has none, the command never answers. It holds for the pages after.
		await wc.loadURL('about:blank');
		wc.debugger.attach('1.3');
		const set = await within(STORY_MS, wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] }));
		const loaded =
			set === null
				? null
				: await within(
						STORY_MS,
						wc.loadURL(previewAddress(base, files[0] as string)).then(() => true),
					);
		if (loaded === null) return files.map(() => null);
		const drawn: (Drawn | null)[] = [];
		// Pictures are drawn at twice the size, whatever the screen, so they are sharp.
		if (pictures)
			await within(STORY_MS, wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 2, mobile: false }));
		for (const file of files) {
			const read = (await within(STORY_MS, wc.executeJavaScript(readDrawn(file)) as Promise<Drawn & { crop?: Electron.Rectangle | null }>)) ?? null;
			if (read === null) {
				drawn.push(null);
				continue;
			}
			const { crop, ...measured } = read;
			const picture = pictures ? await within(STORY_MS, pictureOf(wc, crop)) : undefined;
			drawn.push(picture ? { ...measured, picture } : measured);
		}
		return drawn;
	} finally {
		win.destroy();
	}
};

/**
 * One run after another, each in a few windows: this runs in the background as the app opens, so it takes a few windows at
 * a time and not all of them at once.
 */
export const measureInWindows: Measure = async (runs) => {
	const results: (Drawn | null)[][] = [];
	for (const { base, mode, files, pictures = false } of runs) {
		// Each window takes every third file, so the slow ones are spread out.
		const shares = Array.from({ length: Math.min(WINDOWS_PER_RUN, files.length) }, (_, w) => files.filter((_, i) => i % WINDOWS_PER_RUN === w));
		const drawn = await Promise.all(shares.map((share) => drawShare(base, mode, share, pictures)));
		results.push(files.map((_, i) => drawn[i % WINDOWS_PER_RUN]?.[Math.floor(i / WINDOWS_PER_RUN)] ?? null));
	}
	return results;
};
