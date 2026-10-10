/**
 * The pictures of a design system's components, for the grid view (P5 of the design system plan, decision 31): one for
 * each component, taken in the drawing pass T6 makes (`ComponentTokens`), kept the way good apps keep thumbnails.
 *
 * - **Replaced in place, never blanked:** a pass's picture of a component replaces that component's last one; a component
 *   the pass did not picture (its story did not draw) keeps its last; a component no longer listed loses its picture.
 * - **Kept across restarts,** in the app's own folder, apart for each design system, and not in the previews' build
 *   folder, which is removed when the library moves.
 * - **Each file named by its content,** so a newer picture is at a new address (nothing shows an old one from a cache), and
 *   a file no longer named is removed. Which picture is whose is a small record, written whole, so it is never half
 *   written.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrototypeServer } from './prototypeServer';

const RECORD = 'pictures.json';
const hash = (s: string | Buffer, n: number) => createHash('sha256').update(s).digest('hex').slice(0, n);
/** What a design system's pictures are served as, on the local server. */
const servedAs = (system: string) => `component-pictures-${hash(system, 12)}`;

export interface ComponentPicturesDeps {
	/** The app's own folder for pictures. */
	folder: string;
	server: PrototypeServer;
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
		writeFileSync(join(dir, `${RECORD}.new`), JSON.stringify(record));
		renameSync(join(dir, `${RECORD}.new`), join(dir, RECORD));
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

	/** Which picture is whose; none when it is missing or cannot be read. */
	private record(system: string): Record<string, string> {
		try {
			const kept = JSON.parse(readFileSync(join(this.folderOf(system), RECORD), 'utf8')) as unknown;
			if (typeof kept !== 'object' || kept === null) return {};
			return Object.fromEntries(Object.entries(kept).filter((e): e is [string, string] => typeof e[1] === 'string' && /^[0-9a-f]{16}\.jpg$/.test(e[1])));
		} catch {
			return {};
		}
	}
}
