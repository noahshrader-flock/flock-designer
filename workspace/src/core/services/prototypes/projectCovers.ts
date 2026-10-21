/**
 * Drawn only by the machine that built the page (`builtHere`), so each picture has one writer. The picture is written
 * before the record, so a record never names a missing one.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MadeCover } from '../../../shared/contract';
import { coverPath } from '../../../shared/designPaths';
import { isPrototypeName } from '../../../shared/prototypeNames';
import { PROJECT_ID } from '../../../shared/validate';
import { type RecordStore, contentHashOf, readRecords, setCover } from './prototype';
import type { DrawCover } from '../../ports';

export const COVER_WINDOW = { width: 1440, height: 720 } as const;
/** In bytes; it and the steps were measured on real prototypes. */
export const COVER_BUDGET = 48_000;
export const COVER_STEPS = [
	[960, 80],
	[960, 70],
	[720, 70],
	[640, 60],
] as const;
/**
 * Of one color, whatever the background. A pixel a step off (a JPEG's or a gradient's edge) counts as the same, and so
 * does one in a hundred of something else (a cursor, a stray line).
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
	store: () => RecordStore;
	/** Null when it was not built here. */
	page: (projectId: string, name: string) => string | null;
	/** Resolves to the address it is drawn from. */
	serve: (projectId: string, name: string, html: string) => Promise<string>;
	draw: DrawCover;
	/** So a page that gave no picture is not tried again this session. */
	tried: Set<string>;
}

/** A project whose records cannot be read is passed over, and the rest go on. */
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
