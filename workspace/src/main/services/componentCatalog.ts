/**
 * The component library's catalog, as its Storybook has it, for the Design System tab. **Storybook is the source of
 * truth:** a component is a story file, wherever it is in the repository, named and grouped by its Storybook title and
 * ordered as the library's own `.storybook/preview` orders its sidebar. Nothing here knows how one library lays out its
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

/** A Storybook story file, by Storybook's own convention: `*.stories.` and a script extension. Docs pages (`.mdx`) are not components. */
export const isStoryFile = (path: string): boolean => /\.stories\.(js|jsx|mjs|ts|tsx)$/.test(path);

/** The library's Storybook preview set-up, where its sidebar order lives. */
const isPreviewFile = (path: string): boolean => /^\.storybook\/preview\.(js|jsx|mjs|ts|tsx)$/.test(path);

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

/**
 * The top level of the sidebar order in a Storybook preview set-up (`parameters.options.storySort.order`), as written:
 * its string literals, and not those in the nested lists that order a group's own entries. Empty when it has none.
 */
export const sidebarOrder = (preview: string): string[] => {
	const start = /\border\s*:\s*\[/.exec(preview);
	if (!start) return [];
	const order: string[] = [];
	let depth = 1;
	for (let i = start.index + start[0].length; i < preview.length && depth > 0; i++) {
		const c = preview[i]!;
		if (c === '[') depth++;
		else if (c === ']') depth--;
		else if ((c === "'" || c === '"') && depth === 1) {
			const end = preview.indexOf(c, i + 1);
			if (end === -1) break;
			order.push(preview.slice(i + 1, end));
			i = end;
		}
	}
	return order;
};

const read = async (reads: CatalogReads, path: string): Promise<string> => {
	try {
		return await reads.readFile(path);
	} catch {
		// One unreadable file leaves its component in the list, without what the file would have said.
		return '';
	}
};

/**
 * Every component in the library, in the order its Storybook shows them: groups in the sidebar's order, any other group
 * after them alphabetically and `Ungrouped` last, and components alphabetically within a group.
 */
export const readCatalog = async (reads: CatalogReads, library: DesignSystem): Promise<CatalogComponent[]> => {
	const files = await reads.listFiles('');
	const preview = files.find(isPreviewFile);
	const order = preview === undefined ? [] : sidebarOrder(await read(reads, preview));
	const components = await Promise.all(
		files.filter(isStoryFile).map(async (file): Promise<CatalogComponent> => {
			const text = await read(reads, file);
			const title = literalField(text, 'title');
			const parts = title?.split('/').map((p) => p.trim()) ?? [];
			return {
				id: file,
				name: parts.at(-1) || file.split('/').pop()!.replace(/\.stories\.\w+$/, ''),
				group: parts.length > 1 ? parts[0]! : UNGROUPED,
				subtitle: literalField(text, 'componentSubtitle'),
				storybook: title !== null && library.storybook !== null ? storybookUrl(library.storybook, title) : null,
				source: `https://github.com/${library.repository}/tree/${library.branch}/${dirname(file)}`,
			};
		}),
	);
	const rank = (group: string) => (group === UNGROUPED ? order.length + 2 : order.includes(group) ? order.indexOf(group) : order.length + 1);
	return components.sort(
		(a, b) =>
			rank(a.group) - rank(b.group) ||
			a.group.localeCompare(b.group) ||
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
			a.id.localeCompare(b.id),
	);
};
