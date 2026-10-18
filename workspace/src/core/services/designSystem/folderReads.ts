import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogReads } from './componentCatalog';
import { GENERATED_FOLDERS } from '../../../shared/generatedFolders';

/** Folders a design system's files are never in: what is installed or built, and git's own. */
const SKIPPED = new Set<string>([...GENERATED_FOLDERS, '.git']);
/** More files than any design system has: a folder past this is not read whole. */
const MOST = 20_000;

/**
 * A folder's files as the catalog and token readers read a library (`CatalogReads`), from disk as it is now, not at a
 * commit: what a folder open in an editor is. Paths are the folder's own, with `/`.
 */
export const folderReads = (root: string): CatalogReads => {
	let files: string[] | null = null;
	const all = (): string[] => {
		if (files) return files;
		const found: string[] = [];
		const walk = (dir: string, rel: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				if (found.length >= MOST) return;
				const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
				if (entry.isDirectory()) {
					if (!SKIPPED.has(entry.name)) walk(join(dir, entry.name), path);
				} else if (entry.isFile()) found.push(path);
			}
		};
		walk(root, '');
		return (files = found);
	};
	return {
		listFiles: async (dir) => all().filter((f) => dir === '' || f.startsWith(`${dir}/`)),
		readFile: async (path) => readFileSync(join(root, path), 'utf8'),
	};
};
