/** Nothing here knows one library's layout, and nothing of the library's is run or compiled. */
import { dirname } from 'node:path';
import type { DesignSystem } from '../../../shared/catalog';
import type { CatalogComponent } from '../../../shared/contract';
import { treeUrl } from '../../../shared/hostUrls';
/** `listFiles('')` lists every file; paths are from the library's root. */
export interface CatalogReads {
	listFiles(dir: string): Promise<string[]>;
	readFile(path: string): Promise<string>;
}

export const UNGROUPED = 'Ungrouped';

export const SCRIPT_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js', 'mjs', 'cjs', 'mts', 'cts'];
const STORY_FILE = new RegExp(`\\.stories\\.(${SCRIPT_EXTENSIONS.join('|')})$`);

export const isStoryFile = (path: string): boolean => STORY_FILE.test(path);

/** Storybook's own id rule (`sanitize` in `storybook/internal/csf`): lowercased, punctuation and spaces as one `-`. */
export const storybookId = (part: string): string =>
	part
		.toLowerCase()
		.replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, '-')
		.replace(/-+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '');

export const storybookPath = (title: string): string => `?path=/docs/${storybookId(title)}--docs`;

/** Only a plain string literal counts: a template with `${}`, a variable or a call is null, since the catalog never guesses. */
export const literalField = (text: string, key: string): string | null => {
	const m = new RegExp(`\\b${key}\\s*:\\s*(?:'((?:[^'\\\\\\n]|\\\\.)*)'|"((?:[^"\\\\\\n]|\\\\.)*)"|\`((?:[^\`\\\\$]|\\\\.)*)\`)`).exec(text);
	if (!m) return null;
	const value = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1').trim();
	return value === '' ? null : value;
};

const read = async (reads: CatalogReads, path: string): Promise<string> => {
	try {
		return await reads.readFile(path);
	} catch {
		// One unreadable file leaves its component in the list, without what the file would have said.
		return '';
	}
};

const alphabetical = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** Alphabetical by group then name, `Ungrouped` last: our order, not the library's own sidebar order. */
export const readCatalog = async (reads: CatalogReads, library: DesignSystem): Promise<CatalogComponent[]> => {
	const files = await reads.listFiles('');
	const components = await Promise.all(
		files.filter(isStoryFile).map(async (file): Promise<CatalogComponent> => {
			const text = await read(reads, file);
			const title = literalField(text, 'title');
			const parts = title?.split('/').map((p) => p.trim()) ?? [];
			return {
				id: file,
				name:
					parts.at(-1) ||
					file
						.split('/')
						.pop()!
						.replace(/\.stories\.\w+$/, ''),
				group: parts.length > 1 ? parts[0]! : UNGROUPED,
				subtitle: literalField(text, 'componentSubtitle'),
				storybookPath: title === null ? null : storybookPath(title),
				storybook: title !== null && library.storybook !== null ? `${library.storybook}${storybookPath(title)}` : null,
				source: treeUrl(library.repository, library.branch, dirname(file)),
			};
		}),
	);
	const last = (group: string) => (group === UNGROUPED ? 1 : 0);
	return components.sort(
		(a, b) => last(a.group) - last(b.group) || alphabetical(a.group, b.group) || alphabetical(a.name, b.name) || a.id.localeCompare(b.id),
	);
};
