/**
 * The component library's catalog, as its Storybook has it, for the Design System tab. **Storybook is the source of
 * truth:** a component is a story file, wherever it is in the repository, named and grouped by its Storybook title and
 * listed alphabetically. Nothing here knows how one library lays out its
 * folders or names its components, so a story added to the library is in the list, and a library set up like any other
 * Storybook library reads the same way. An index of the library, never a copy: no story is run here, nothing is compiled.
 *
 * The reads are passed in, so this decides only what the files mean. In the app they read the library's branch on
 * GitHub through git (`designLibrary.ts`); in the tests they read a fixture.
 */
import { dirname } from 'node:path';
import type { DesignSystem } from '../../shared/catalog';
import type { CatalogComponent } from '../../shared/contract';

/** How the catalog reads the library: every file under a folder (`''` for all of it, paths from the root), and one file's text. */
export interface CatalogReads {
	listFiles(dir: string): Promise<string[]>;
	readFile(path: string): Promise<string>;
}

export const UNGROUPED = 'Ungrouped';

/** The script extensions Storybook reads stories and its set-up from. */
export const SCRIPT_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js', 'mjs'];
const STORY_FILE = new RegExp(`\\.stories\\.(${SCRIPT_EXTENSIONS.join('|')})$`);

/** A Storybook story file, by Storybook's own convention: `*.stories.` and a script extension. Docs pages (`.mdx`) are not components. */
export const isStoryFile = (path: string): boolean => STORY_FILE.test(path);

/** The library's Storybook preview set-up: `.storybook/preview` with a script extension. */
export const PREVIEW_CANDIDATES = SCRIPT_EXTENSIONS.map((e) => `.storybook/preview.${e}`);

/** Storybook's own id rule (`sanitize` in `storybook/internal/csf`): lowercased, punctuation and spaces as one `-`. */
export const storybookId = (part: string): string =>
	part
		.toLowerCase()
		.replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, '-')
		.replace(/-+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '');

/** The docs page for a story title on a hosted Storybook at `base`. */
export const storybookUrl = (base: string, title: string): string => `${base}?path=/docs/${storybookId(title)}--docs`;

/**
 * The first value of `key` in a file's text, only when it is a plain string literal. A template with `${}` in it, a
 * variable or a call is "not given": the catalog never guesses.
 */
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

/** One word before another, without regard to case, and numbers by their value: `FSTab2` before `FSTab10`. */
const alphabetical = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/**
 * Every component in the library, alphabetically: groups, then components within a group, with `Ungrouped` last, the group
 * of those with no title to put them in one. The order is ours, not the library's own sidebar order.
 */
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
				storybook: title !== null && library.storybook !== null ? storybookUrl(library.storybook, title) : null,
				source: `https://github.com/${library.repository}/tree/${library.branch}/${dirname(file)}`,
			};
		}),
	);
	const last = (group: string) => (group === UNGROUPED ? 1 : 0);
	return components.sort(
		(a, b) => last(a.group) - last(b.group) || alphabetical(a.group, b.group) || alphabetical(a.name, b.name) || a.id.localeCompare(b.id),
	);
};
