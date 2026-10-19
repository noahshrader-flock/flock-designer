import DRAWING from '../../../page/drawing?page';
import { axeFound } from '../accessibility/accessibilityCheck';
import type { Drawn, Mode, Vary } from './componentTokens';
import type { Measure } from '../../ports';
import { within } from '../platform/within';

/**
 * Two runs at once, each in three pages, drew Flock's library as fast as four at once (about 21 s against 31 s one after
 * another) with a fifth less of the browser's memory.
 */
const RUNS_AT_ONCE = 2;
const WINDOWS_PER_RUN = 3;
export const STORY_MS = 15_000;
export const WINDOW = { width: 1200, height: 900 };
/** Pixels: `composeOnWhite` finds the story within the top `PICTURE_TOP`, drawn at `PICTURE_SCALE` so it is sharp. */
export const PICTURE_TOP = 640;
export const PICTURE_SCALE = 2;
export const PICTURE_MOST_ACROSS = 1440;
export const PICTURE_QUALITY = 85;

/** `page/drawing.ts` is bundled to text when DSNR is built. */
export const readDrawn = (file: string, picture: boolean, tags: string[] | null = null, vary: Vary | null = null): string =>
	`(async () => {\n${DRAWING}\nreturn await __fdPage.readDrawn(${JSON.stringify({ file, picture, vary, tags, waitMs: STORY_MS - 3000 })});\n})()`;

/** Interleaved rather than split in runs, so the slow files are spread out. */
const sharesOf = <T>(files: T[]): T[][] =>
	Array.from({ length: Math.min(WINDOWS_PER_RUN, files.length) }, (_, w) => files.filter((_file, i) => i % WINDOWS_PER_RUN === w));

const backInOrder = <T>(files: unknown[], drawn: (T | null)[][]): (T | null)[] =>
	files.map((_, i) => drawn[i % WINDOWS_PER_RUN]?.[Math.floor(i / WINDOWS_PER_RUN)] ?? null);

export interface Share {
	base: string;
	mode: Mode;
	files: string[];
	pictures: boolean;
	tags: string[] | null;
	/** A story drawn with each value of each prop, in place of its stories; null for its stories. */
	vary: Vary | null;
}

/** Runs start in the order given, so give the longest first and it is drawn beside the others. */
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

/** A story that does not draw in time is null and the rest go on; what the page found is kept only when it is axe's results. */
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
