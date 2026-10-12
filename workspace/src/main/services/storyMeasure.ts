/**
 * Drawing stories to read what they draw (T6 of the design system plan), in hidden windows as sandboxed as the preview
 * frames are (no preload, no Node, a throwaway session, nothing it can open or navigate to), in the mode asked for. The
 * mode is set for each window alone, by the page's `prefers-color-scheme`, so the app's own appearance is never changed.
 * Each window loads the preview page once and draws its share of the story files in it, one after another; a story that
 * does not draw in time is said as null, and the rest go on.
 */
import { createHash } from 'node:crypto';
import axe from 'axe-core';
import { nativeImage } from 'electron';
import { PREVIEW_SHOW, previewAddress } from '../../shared/catalog';
import type { Drawn, Measure, Mode } from './componentTokens';
import { COMPOSITION, composeOnWhite } from './pictureComposition';
import { axeFound, axeRun } from './accessibilityCheck';
import { hiddenWindow, setColorScheme, within } from './sandboxedPage';

/** How many windows draw a run's files at once, how long one story may take, and each window's size. */
const WINDOWS_PER_RUN = 3;
const STORY_MS = 15_000;
const WINDOW = { width: 1200, height: 900 };
/**
 * A picture (P5): the top of the page this many pixels down, drawn at twice the size (`PICTURE_SCALE`) so it is sharp,
 * is what `composeOnWhite` finds the story in; it is kept at most this many pixels across, as JPEG. How long the page is
 * given to repaint before one is taken.
 */
const PICTURE_TOP = 640;
const PICTURE_SCALE = 2;
const PICTURE_MOST_ACROSS = 1440;
const PICTURE_QUALITY = 85;
const REPAINT_MS = 150;

/** The windows' session: their own, in memory only. */
const SESSION = 'dsnr-story-measure';

/**
 * What a story file draws, read in the page once it has drawn: the page draws the file in place of the last
 * (`PREVIEW_SHOW`), so the page is loaded once for many. Then its fonts, and what animates in, settle, and its stories'
 * elements that take up room are read: each one's background, text and border colors, its radius, and its padding,
 * margins and gaps, counted by computed value. With `tags`, axe (in the page already) checks the stories' accessibility
 * at them (T7), before anything is hidden for a picture, since axe passes over what is hidden.
 */
const readDrawn = (file: string, picture: boolean, tags: string[] | null = null): string => `(async (file, picture) => {
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
	}${
		tags
			? `
	// The stories only: not the page they are drawn on, nor the names it gives them.
	drawn.accessibility = window.axe ? await ${axeRun("{ include: [['#root']], exclude: [['.fd-name']] }", tags)} : null;`
			: ''
	}
	if (!picture) return drawn;
	// A picture (P5): the first story alone, at the top of the page, which is white. Everything else is hidden first (hidden,
	// so nothing moves), or a short story would have the next one, and its own name, in its picture. A hidden window paints
	// a moment after a change, and the picture is of what it has painted.
	const first = document.querySelector('[data-story]');
	for (const el of document.querySelectorAll('[data-story]')) if (el !== first) el.style.visibility = 'hidden';
	const name = first?.querySelector('.fd-name');
	if (name) name.style.visibility = 'hidden';
	await new Promise((r) => setTimeout(r, ${REPAINT_MS}));
	return drawn;
})(${JSON.stringify(file)}, ${picture})`;

/** The picture of a story's first story from a capture of the top of its page; nothing when it painted nothing. */
const pictureOf = async (wc: Electron.WebContents): Promise<Buffer | undefined> => {
	const image = await wc.capturePage({ x: 0, y: 0, width: WINDOW.width, height: PICTURE_TOP });
	const data = image.toBitmap();
	// The captured image's size in pixels, whatever the scale it was taken at.
	const size = image.getSize();
	const scale = Math.sqrt(data.length / 4 / (size.width * size.height));
	const composed = composeOnWhite({ data, width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
	if (composed === null) return undefined;
	const picture = nativeImage.createFromBitmap(composed.data, { width: composed.width, height: composed.height });
	return (composed.width > PICTURE_MOST_ACROSS ? picture.resize({ width: PICTURE_MOST_ACROSS, quality: 'best' }) : picture).toJPEG(PICTURE_QUALITY);
};

/** How pictures are taken, as a fingerprint of the code that takes them: they are only shown while it is the same (see `ComponentPictures`). */
export const PICTURE_RECIPE = createHash('sha256')
	.update(`${readDrawn('', true)}${pictureOf}${COMPOSITION}${[WINDOW.width, PICTURE_TOP, PICTURE_SCALE, PICTURE_MOST_ACROSS, PICTURE_QUALITY]}`)
	.digest('hex')
	.slice(0, 12);

/** One window's share of a run: the page loaded once, in the run's mode, then each file drawn in turn. */
const drawShare = async (base: string, mode: Mode, files: string[], pictures: boolean, tags: string[] | null): Promise<(Drawn | null)[]> => {
	const win = hiddenWindow(SESSION, new URL(base).origin, WINDOW);
	try {
		const wc = win.webContents;
		const loaded = !(await setColorScheme(wc, mode, STORY_MS))
			? null
			: await within(
					STORY_MS,
					wc.loadURL(previewAddress(base, files[0] as string)).then(() => true),
				);
		if (loaded === null) return files.map(() => null);
		const drawn: (Drawn | null)[] = [];
		// Pictures are drawn at twice the size, whatever the screen, so they are sharp.
		if (pictures)
			await within(
				STORY_MS,
				wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { ...WINDOW, deviceScaleFactor: PICTURE_SCALE, mobile: false }),
			);
		// axe-core, once for every file the page draws (T7).
		if (tags) await within(STORY_MS, wc.executeJavaScript(`${axe.source};true`));
		for (const file of files) {
			const read = await within(STORY_MS, wc.executeJavaScript(readDrawn(file, pictures, tags)) as Promise<Drawn & { accessibility?: unknown }>);
			if (read === null) {
				drawn.push(null);
				continue;
			}
			// What the page says it found, only when it is axe's results.
			const { accessibility, ...measured } = read;
			const picture = pictures ? await within(STORY_MS, pictureOf(wc)) : undefined;
			drawn.push({ ...measured, ...(picture ? { picture } : {}), ...(axeFound(accessibility) ? { accessibility } : {}) });
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
	for (const { base, mode, files, pictures = false, accessibility = null } of runs) {
		// Each window takes every third file, so the slow ones are spread out.
		const shares = Array.from({ length: Math.min(WINDOWS_PER_RUN, files.length) }, (_, w) => files.filter((_file, i) => i % WINDOWS_PER_RUN === w));
		const drawn = await Promise.all(shares.map((share) => drawShare(base, mode, share, pictures, accessibility)));
		results.push(files.map((_, i) => drawn[i % WINDOWS_PER_RUN]?.[Math.floor(i / WINDOWS_PER_RUN)] ?? null));
	}
	return results;
};
