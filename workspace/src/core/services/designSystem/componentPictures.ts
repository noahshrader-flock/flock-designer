/**
 * The grid view's picture of each component, taken in the drawing pass (`ComponentTokens`). Replaced in place, never
 * blanked: a component the pass did not picture keeps its last. Kept outside the previews' build folder, which is removed
 * when the library moves; each file is named by its content, so a newer picture is never shown stale from a cache.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrototypeServer } from '../prototypes/prototypeServer';
import { writeAtomic } from '../platform/jsonFile';

const RECORD = 'pictures.json';
const hash = (s: string | Buffer, n: number) => createHash('sha256').update(s).digest('hex').slice(0, n);
/** What a design system's pictures are served as, on the local server. */
const servedAs = (system: string) => `component-pictures-${hash(system, 12)}`;

export interface ComponentPicturesDeps {
	/** The app's own folder for pictures. */
	folder: string;
	server: PrototypeServer;
	/** A fingerprint of the code that takes pictures: one taken another way (another shape, crop) is no picture, not a wrong one. */
	recipe: string;
}

export class ComponentPictures {
	constructor(private readonly deps: ComponentPicturesDeps) {}

	/** Where a design system's pictures are kept. */
	folderOf(system: string): string {
		return join(this.deps.folder, hash(system, 12));
	}

	/** A pass's pictures for a design system's `listed` components, each replacing that component's last. */
	keep(system: string, listed: string[], taken: Map<string, Buffer>): void {
		const dir = this.folderOf(system);
		mkdirSync(dir, { recursive: true });
		const last = this.record(system);
		const record: Record<string, string> = {};
		for (const file of listed) {
			const picture = taken.get(file);
			if (picture === undefined) {
				if (last[file] && existsSync(join(dir, last[file]))) record[file] = last[file];
				continue;
			}
			const name = `${hash(picture, 16)}.jpg`;
			if (!existsSync(join(dir, name))) writeFileSync(join(dir, name), picture);
			record[file] = name;
		}
		// Written whole: a reader sees the last record or this one, never part of one.
		writeAtomic(join(dir, RECORD), JSON.stringify({ recipe: this.deps.recipe, pictures: record }));
		const named = new Set(Object.values(record));
		for (const f of readdirSync(dir)) if (f.endsWith('.jpg') && !named.has(f)) rmSync(join(dir, f), { force: true });
	}

	/** Each component's picture, by its story file, as an address on the local server; none for one with no picture. */
	async of(system: string): Promise<Record<string, string>> {
		const record = this.record(system);
		if (Object.keys(record).length === 0) return {};
		const base = await this.deps.server.serveFolder(servedAs(system), this.folderOf(system));
		return Object.fromEntries(Object.entries(record).map(([file, name]) => [file, `${base}${name}`]));
	}

	/** Removes a design system's pictures, when it is removed from the app: nothing of it is left behind. */
	forget(system: string): void {
		this.deps.server.stopServing(servedAs(system));
		rmSync(this.folderOf(system), { recursive: true, force: true });
	}

	/** Which picture is whose; none when it is missing, cannot be read, or was taken by another `recipe`. */
	private record(system: string): Record<string, string> {
		try {
			const kept = JSON.parse(readFileSync(join(this.folderOf(system), RECORD), 'utf8')) as { recipe?: unknown; pictures?: unknown };
			if (kept.recipe !== this.deps.recipe || typeof kept.pictures !== 'object' || kept.pictures === null) return {};
			return Object.fromEntries(
				Object.entries(kept.pictures).filter((e): e is [string, string] => typeof e[1] === 'string' && /^[0-9a-f]{16}\.jpg$/.test(e[1])),
			);
		} catch {
			return {};
		}
	}
}
