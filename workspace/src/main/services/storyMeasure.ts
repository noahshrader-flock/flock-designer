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
import { previewAddress } from '../../shared/catalog';
import type { Drawn, Measure, Mode } from './componentTokens';
import { COMPOSITION, composeOnWhite } from './pictureComposition';
import { axeFound } from './accessibilityCheck';
import { hiddenWindow, setColorScheme } from './sandboxedPage';
import { PICTURE_MOST_ACROSS, PICTURE_QUALITY, PICTURE_SCALE, PICTURE_TOP, STORY_MS, WINDOW, inOrder, readDrawn, sharesOf } from './storyDrawing';
import { within } from './within';

/** The windows' session: their own, in memory only. */
const SESSION = 'dsnr-story-measure';

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
		const drawn = await Promise.all(sharesOf(files).map((share) => drawShare(base, mode, share, pictures, accessibility)));
		results.push(inOrder(files, drawn));
	}
	return results;
};
