import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogReads } from './componentCatalog';
import { GENERATED_FOLDERS } from '../../../shared/generatedFolders';

const SKIPPED = new Set<string>([...GENERATED_FOLDERS, '.git']);
/** More files than any design system has: a folder past this is not read whole. */
const MOST = 20_000;

/** Reads the folder from disk as it is now, not at a commit; paths are relative to it, with `/`. */
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
