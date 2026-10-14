/**
 * How a story file is drawn to read what it draws (T6 of the design system plan), whichever shell draws it: the app's
 * hidden windows (`storyMeasure.ts`) or a headless browser (`chromeHeadless.ts`). The script the page runs, the size it is
 * drawn at, and how long a story may take; and how a run's files are shared between a few pages and put back in order.
 */
import { PREVIEW_SHOW } from '../../shared/catalog';
import { axeFound, axeRun } from './accessibilityCheck';
import type { Drawn, Measure, Mode } from './componentTokens';
import { within } from './within';

/** How many windows draw a run's files at once, how long one story may take, and each window's size. */
const WINDOWS_PER_RUN = 3;
export const STORY_MS = 15_000;
export const WINDOW = { width: 1200, height: 900 };
/**
 * A picture (P5): the top of the page this many pixels down, drawn at twice the size (`PICTURE_SCALE`) so it is sharp,
 * is what `composeOnWhite` finds the story in; it is kept at most this many pixels across, as JPEG. How long the page is
 * given to repaint before one is taken.
 */
export const PICTURE_TOP = 640;
export const PICTURE_SCALE = 2;
export const PICTURE_MOST_ACROSS = 1440;
export const PICTURE_QUALITY = 85;
const REPAINT_MS = 150;

/**
 * What a story file draws, read in the page once it has drawn: the page draws the file in place of the last
 * (`PREVIEW_SHOW`), so the page is loaded once for many. Then its fonts, and what animates in, settle, and its stories'
 * elements that take up room are read: each one's background, text and border colors, its radius, and its padding,
 * margins and gaps, counted by computed value. With `tags`, axe (in the page already) checks the stories' accessibility
 * at them (T7), before anything is hidden for a picture, since axe passes over what is hidden.
 */
export const readDrawn = (file: string, picture: boolean, tags: string[] | null = null): string => `(async (file, picture) => {
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

/** A run's files shared between `pages` pages: each takes every so many, so the slow ones are spread out. */
const sharesOf = <T>(files: T[]): T[][] =>
	Array.from({ length: Math.min(WINDOWS_PER_RUN, files.length) }, (_, w) => files.filter((_file, i) => i % WINDOWS_PER_RUN === w));

/** What each page drew, back in the order of the run's files (`sharesOf`'s order undone); null for any not drawn. */
const backInOrder = <T>(files: unknown[], drawn: (T | null)[][]): (T | null)[] =>
	files.map((_, i) => drawn[i % WINDOWS_PER_RUN]?.[Math.floor(i / WINDOWS_PER_RUN)] ?? null);

/** What one page is given of a run to draw: the build, its mode, its share of the files, and whether it pictures and checks them. */
export interface Share {
	base: string;
	mode: Mode;
	files: string[];
	pictures: boolean;
	tags: string[] | null;
}

/**
 * One run after another, each shared between a few pages at once, drawn by the shell's own page (`drawShare`), and put
 * back in the order of the run's files: how both shells measure (`Measure`).
 */
export const measureWith =
	(drawShare: (share: Share) => Promise<(Drawn | null)[]>): Measure =>
	async (runs) => {
		const results: (Drawn | null)[][] = [];
		for (const { base, mode, files, pictures = false, accessibility = null } of runs) {
			const drawn = await Promise.all(sharesOf(files).map((share) => drawShare({ base, mode, files: share, pictures, tags: accessibility })));
			results.push(backInOrder(files, drawn));
		}
		return results;
	};

/**
 * Each file of a page's share drawn in turn, once the page is loaded (with axe in it when the run checks accessibility):
 * `run` runs a script in the page, `picture` takes the first story's picture. A story that does not draw in time is null,
 * and the rest go on; what the page says it found is kept only when it is axe's results.
 */
export const drawEach = async (
	{ files, pictures, tags }: Share,
	run: (code: string) => Promise<unknown>,
	picture: () => Promise<Buffer | undefined>,
): Promise<(Drawn | null)[]> => {
	const drawn: (Drawn | null)[] = [];
	for (const file of files) {
		const read = (await within(
			STORY_MS,
			run(readDrawn(file, pictures, tags)).catch(() => null),
		)) as (Drawn & { accessibility?: unknown }) | null;
		if (read === null) {
			drawn.push(null);
			continue;
		}
		const { accessibility, ...measured } = read;
		const taken = pictures
			? await within(
					STORY_MS,
					picture().catch(() => undefined),
				)
			: undefined;
		drawn.push({ ...measured, ...(taken ? { picture: taken } : {}), ...(axeFound(accessibility) ? { accessibility } : {}) });
	}
	return drawn;
};
