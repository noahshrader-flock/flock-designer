/**
 * How a story file is drawn to read what it draws (T6 of the design system plan), in a headless browser
 * (`chromeHeadless.ts`). The script the page runs, the size it is drawn at, and how long a story may take; and how a run's files are shared between a few pages and put back in order.
 */
import DRAWING from '../../../page/drawing?page';
import { axeFound } from '../accessibility/accessibilityCheck';
import type { Drawn, Mode, Vary } from './componentTokens';
import type { Measure } from '../../ports';
import { within } from '../platform/within';

/**
 * How many runs are drawn at once, how many pages draw each run's files at once, how long one story may take, and each
 * page's size. Two runs at once, each in three pages, drew Flock's library as fast as all four at once (about 21 s for the
 * whole pass, against 31 s one run after another) with a fifth less of the browser's memory, so six pages is the most open.
 */
const RUNS_AT_ONCE = 2;
const WINDOWS_PER_RUN = 3;
export const STORY_MS = 15_000;
export const WINDOW = { width: 1200, height: 900 };
/**
 * A picture (P5): the top of the page this many pixels down, drawn at twice the size (`PICTURE_SCALE`) so it is sharp,
 * is what `composeOnWhite` finds the story in; it is kept at most this many pixels across, as JPEG.
 */
export const PICTURE_TOP = 640;
export const PICTURE_SCALE = 2;
export const PICTURE_MOST_ACROSS = 1440;
export const PICTURE_QUALITY = 85;

/**
 * The script that reads what a story file draws (`page/drawing.ts`, bundled to text when DSNR is built): the page draws the
 * file, and what it drew, its instances, and with `tags` what axe finds in it, come back, with a picture's page set up.
 */
export const readDrawn = (file: string, picture: boolean, tags: string[] | null = null, vary: Vary | null = null): string =>
	`(async () => {\n${DRAWING}\nreturn await __fdPage.readDrawn(${JSON.stringify({ file, picture, vary, tags, waitMs: STORY_MS - 3000 })});\n})()`;

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
	/** A story drawn with each value of each prop, in place of its stories (Phase 5); null for its stories. */
	vary: Vary | null;
}

/**
 * The runs, `RUNS_AT_ONCE` at a time in the order given (so the longest, given first, is drawn beside the others), each
 * shared between a few pages at once, drawn by the shell's own page (`drawShare`), and put back in the order of the runs
 * and of each run's files: how the shell measures (`Measure`).
 */
export const measureWith = (drawShare: (share: Share) => Promise<(Drawn | null)[]>): Measure => {
	// Shared by every ask, so runs asked for at once by two callers still draw `RUNS_AT_ONCE` at a time, in the order asked.
	let drawing = 0;
	const waiting: (() => void)[] = [];
	const turn = async (): Promise<void> => {
		if (drawing >= RUNS_AT_ONCE) await new Promise<void>((go) => waiting.push(go));
		drawing++;
	};
	const done = () => {
		drawing--;
		waiting.shift()?.();
	};
	return (runs) =>
		Promise.all(
			runs.map(async ({ base, mode, files, pictures = false, accessibility = null, vary = null }) => {
				await turn();
				try {
					return backInOrder(
						files,
						await Promise.all(sharesOf(files).map((share) => drawShare({ base, mode, files: share, pictures, tags: accessibility, vary }))),
					);
				} finally {
					done();
				}
			}),
		);
};

/**
 * Each file of a page's share drawn in turn, once the page is loaded (with axe in it when the run checks accessibility):
 * `run` runs a script in the page, `picture` takes the first story's picture. A story that does not draw in time is null,
 * and the rest go on; what the page says it found is kept only when it is axe's results.
 */
export const drawEach = async (
	{ files, pictures, tags, vary }: Share,
	run: (code: string) => Promise<unknown>,
	picture: () => Promise<Buffer | undefined>,
): Promise<(Drawn | null)[]> => {
	const drawn: (Drawn | null)[] = [];
	for (const file of files) {
		const read = (await within(
			STORY_MS,
			run(readDrawn(file, pictures, tags, vary)).catch(() => null),
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
