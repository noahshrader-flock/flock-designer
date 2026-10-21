import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What the build's check shows an agent of its own page: a picture of each state at each of these windows, with the
 * fonts and icons drawn as a person sees them, so it is looked at before it is called finished.
 */
export const LOOK_WINDOWS = [
	{ width: 1280, height: 900 },
	{ width: 800, height: 700 },
] as const;

export interface Look {
	state: string;
	width: number;
	png: Buffer;
}

/** The pictures written, or why none could be taken. */
export type Looked = { files: string[] } | { why: string };

/** One picture of a page, for every state and window. */
export type LookPage = (url: string, states: string[], windows: readonly { width: number; height: number }[]) => Promise<Look[]>;

/** Beside the page, named for it. */
export const looksDir = (page: string): string => page.replace(/\.html$/, '-looks');

/** What an earlier check left is gone first, so a state that no longer exists has no picture. */
export const writeLooks = (dir: string, looks: Look[]): string[] => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	for (const { state, width, png } of looks) writeFileSync(join(dir, `${state}-${width}.png`), png);
	return readdirSync(dir)
		.sort()
		.map((file) => join(dir, file));
};

/** The layout standard says what to look for, once; this only sends the agent to it, with the pictures. */
export const lookText = (files: string[]): string =>
	[
		`Pictures of the page, one for each state at ${LOOK_WINDOWS.map((w) => w.width).join(' and ')} wide, drawn as a person sees it:`,
		...files,
		'Look at every one before you finish: read each image, and fix what a person would see is wrong, as `standards/universal/layout-judgment.md` ("Looking at what you built") lists. Say in your summary that you looked, and what you changed.',
	].join('\n');
