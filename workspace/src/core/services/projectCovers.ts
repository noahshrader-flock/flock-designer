/**
 * The picture of each prototype on its project's card: a file in the design repository, named
 * on the prototype's record, made by one reconcile step. Nothing of a browser is in here: how a page is drawn is passed in
 * (`DrawCover`, headless Chrome: `chromeHeadless.ts`), so all of this is tested without one.
 *
 * - **Who draws:** the machine the page was built on, and only it: its page is in the app's own prototype folder
 *   (`builtHere`). A colleague's page this machine only fetched or pulled is not, so it is never drawn here. One writer
 *   for each prototype, with nothing to do with who is signed in.
 * - **When it is current:** when the record's `cover` is the hash of the page (`contentHashOf`). Then nothing is done,
 *   so running this again changes nothing.
 * - **In what order:** the picture first, then the record, so a record never names a picture that is not there. A picture
 *   already at its path is never written over (the path has the page's hash in it).
 * - **When drawing fails:** nothing is written, and that page is not tried again until the app is next opened.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MadeCover } from '../../shared/contract';
import { coverPath } from '../../shared/designPaths';
import { isPrototypeName } from '../../shared/prototypeNames';
import { PROJECT_ID } from '../../shared/validate';
import { type RecordStore, contentHashOf, readRecords, setCover } from './prototype';

/** The window a picture is drawn in: the shape of a card's cover, twice as wide as tall. */
export const COVER_WINDOW = { width: 1440, height: 720 } as const;
/** The most a picture may be, and the steps (a width and a quality) tried to get it there: measured on real prototypes. */
export const COVER_BUDGET = 48_000;
export const COVER_STEPS = [
	[960, 80],
	[960, 70],
	[720, 70],
	[640, 60],
] as const;
/** How long a page must be unchanged to be ready for its picture, and the most it is waited for. */
const COVER_QUIET_MS = 500;
const COVER_CAP_MS = 8000;

/** A page drawn as its picture, by its address on the local server: the JPEG, or null when it gave no good picture. */
export type DrawCover = (url: string) => Promise<Buffer | null>;

/**
 * What runs in a page to say it is ready for its picture: its fonts are ready, no animation that ends is still running (one
 * that loops forever is part of the page, not on its way), and nothing in it has changed for `quietMs`. Or `capMs` has
 * passed, which it says (`capped`), and that picture is not kept: a page that never settles has no picture rather than a
 * wrong one. Measured on the real prototypes: ready within half a second, with no more than one change after loading.
 */
export const settleScript = (quietMs = COVER_QUIET_MS, capMs = COVER_CAP_MS): string => `new Promise((resolve) => {
	const started = performance.now();
	let changed = started;
	const watching = new MutationObserver(() => { changed = performance.now(); });
	watching.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
	const ending = () => (document.getAnimations ? document.getAnimations() : []).some((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity);
	const look = () => {
		const now = performance.now();
		const capped = now - started >= ${Number(capMs)};
		if (capped || (now - changed >= ${Number(quietMs)} && !ending())) {
			watching.disconnect();
			resolve({ capped });
		} else setTimeout(look, 50);
	};
	(document.fonts ? document.fonts.ready : Promise.resolve()).then(look, look);
})`;

/**
 * Whether a capture is of one color: a page that painted nothing, whatever its background. Pixels are 4 bytes each, as
 * a browser's screenshot decodes; a pixel a step off (a JPEG's or a gradient's edge) counts as the same, and so does one in a
 * hundred of something else (a cursor, a stray line). An empty capture is blank.
 */
export const isBlank = (data: Uint8Array): boolean => {
	const pixels = Math.floor(data.length / 4);
	if (pixels === 0) return true;
	const near = (i: number) =>
		Math.abs((data[i * 4] as number) - (data[0] as number)) <= 4 &&
		Math.abs((data[i * 4 + 1] as number) - (data[1] as number)) <= 4 &&
		Math.abs((data[i * 4 + 2] as number) - (data[2] as number)) <= 4;
	// A sample, not every pixel: a capture is a million of them, and something on the page is never one pixel.
	const step = Math.max(1, Math.floor(pixels / 20_000));
	let seen = 0;
	let other = 0;
	for (let i = 0; i < pixels; i += step, seen++) if (!near(i)) other++;
	return other <= seen / 100;
};

/** Every prototype page built on this machine: those in the app's own prototype folder, by project. */
export const builtHere = (prototypesRoot: string): { projectId: string; name: string }[] => {
	if (!existsSync(prototypesRoot)) return [];
	return readdirSync(prototypesRoot, { withFileTypes: true })
		.filter((d) => d.isDirectory() && PROJECT_ID.test(d.name))
		.flatMap((d) =>
			readdirSync(join(prototypesRoot, d.name))
				.filter((f) => f.endsWith('.html') && isPrototypeName(f.slice(0, -'.html'.length)))
				.map((f) => ({ projectId: d.name, name: f.slice(0, -'.html'.length) }))
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
		);
};

export interface CoverDeps {
	/** Where records and pictures are kept: the design repository's clone, or GitHub. */
	store: () => RecordStore;
	/** A prototype's page as it was built on this machine, or null when it was not built here. */
	page: (projectId: string, name: string) => string | null;
	/** The page on the local server, with what it needs beside it: the address it is drawn from. */
	serve: (projectId: string, name: string, html: string) => Promise<string>;
	draw: DrawCover;
	/** The pages tried this session, by project, prototype and hash, so one that gave no picture is not tried again. */
	tried: Set<string>;
}

/**
 * Makes sure each of `built` has a current picture, one at a time and in order: draws each whose record does not name its
 * page's picture, keeps the picture, then names it on the record. Says which it made. A project whose records cannot be
 * read is passed over, and the rest go on.
 */
export const ensureCovers = async (deps: CoverDeps, built: { projectId: string; name: string }[]): Promise<MadeCover[]> => {
	const made: MadeCover[] = [];
	const projects = [...new Set(built.map((b) => b.projectId))];
	for (const projectId of projects) {
		const store = deps.store();
		const records = await readRecords(store, projectId).catch(() => null);
		if (records === null) continue;
		for (const { name } of built.filter((b) => b.projectId === projectId)) {
			const record = records.find((r) => r.name === name);
			const html = record ? deps.page(projectId, name) : null;
			if (!record || html === null) continue;
			const cover = contentHashOf(html);
			const key = `${projectId}/${name}/${cover}`;
			if (record.cover === cover || deps.tried.has(key)) continue;
			deps.tried.add(key);
			const picture = await deps.draw(await deps.serve(projectId, name, html)).catch(() => null);
			if (picture === null) continue;
			const path = coverPath(projectId, name, cover);
			if (!(await store.has(path))) await store.write(path, picture, `${projectId}: picture of prototype ${name}`);
			if (await setCover(store, projectId, name, cover)) made.push({ projectId, name, cover });
		}
	}
	return made;
};
