/**
 * The component library's catalog: what is in `flock-react-component-lib`, read from its files as they are, for the
 * Design System tab. An index of the library, never a copy of it: no story is run, nothing is compiled, and what the
 * tab shows beyond a name, a line and three links is Storybook's to show.
 *
 * The reads are passed in, so this decides only what the files mean. In the app they read `origin/develop` through git
 * (DESIGN_SYSTEM_PLAN.md, S2); in the tests they read a fixture.
 */

/** How the catalog reads the library: every file under a folder (paths from the library's root), and one file's text. */
export interface CatalogReads {
	listFiles(dir: string): Promise<string[]>;
	readFile(path: string): Promise<string>;
}

export interface CatalogStory {
	/** The story file, from the library's root. */
	file: string;
	/** Its Storybook title (`Buttons/FSButton`), or null when the file does not give one as plain text. */
	title: string | null;
	/** The story's docs page on the hosted Storybook, or null without a title. */
	storybook: string | null;
}

export interface CatalogComponent {
	/** The folder under `src/`, which is the component's identity: `components/FSButton`. */
	id: string;
	/** The folder's name. */
	name: string;
	/** The first part of its story's title (`Buttons`); a part takes its parent's; `Ungrouped` when there is none. */
	group: string;
	/** Under `src/compositeComponents`. */
	composite: boolean;
	subtitle: string | null;
	stories: CatalogStory[];
	figma: string | null;
	/** The folder on GitHub, built from the path, so it is there for every component. */
	source: string;
	/** For a component with no story that belongs to one that has one (`FSCardContent` to `FSCard`), the parent's id. */
	partOf: string | null;
}

/** No story, and not a part of one that has one: a real gap in the library's stories. */
export const isGap = (c: CatalogComponent): boolean => c.stories.length === 0 && c.partOf === null;

export const STORYBOOK_URL = 'https://develop--6617f3c579abb5c5e780fddc.chromatic.com/';
const SOURCE_URL = 'https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/';
const AREAS = ['components', 'compositeComponents'] as const;
export const UNGROUPED = 'Ungrouped';

/** Storybook's sidebar order, from the library's `.storybook/preview.tsx`. Any other group sorts after, alphabetically. */
export const GROUP_ORDER = ['Buttons', 'Inputs', 'Data Display', 'Feedback', 'Surfaces', 'Navigation', 'Layout', 'Tables'];

/** Storybook's own id rule (`sanitize` in `storybook/internal/csf`): lowercased, punctuation and spaces as one `-`. */
export const storybookId = (part: string): string =>
	part
		.toLowerCase()
		.replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, '-')
		.replace(/-+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '');

/** The docs page for a story title on the hosted Storybook. */
export const storybookUrl = (title: string): string => `${STORYBOOK_URL}?path=/docs/${storybookId(title)}--docs`;

/**
 * The first value of `key` in a story's text, only when it is a plain string literal. A template with `${}` in it, a
 * variable or a call is "not given": the catalog never guesses.
 */
export const literalField = (text: string, key: string): string | null => {
	const m = new RegExp(`\\b${key}\\s*:\\s*(?:'((?:[^'\\\\\\n]|\\\\.)*)'|"((?:[^"\\\\\\n]|\\\\.)*)"|\`((?:[^\`\\\\$]|\\\\.)*)\`)`).exec(text);
	if (!m) return null;
	const value = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1').trim();
	return value === '' ? null : value;
};

const groupRank = (group: string): number => {
	if (group === UNGROUPED) return GROUP_ORDER.length + 2;
	const i = GROUP_ORDER.indexOf(group);
	return i === -1 ? GROUP_ORDER.length + 1 : i;
};

const readStory = async (reads: CatalogReads, file: string): Promise<{ story: CatalogStory; subtitle: string | null; figma: string | null }> => {
	let text = '';
	try {
		text = await reads.readFile(file);
	} catch {
		// One unreadable story leaves its component in the list, without what the story would have said.
	}
	const title = literalField(text, 'title');
	return {
		story: { file, title, storybook: title === null ? null : storybookUrl(title) },
		subtitle: literalField(text, 'componentSubtitle'),
		figma: literalField(text, 'figmaPageUrl'),
	};
};

/**
 * Every component in the library, in the order the tab shows them: groups in Storybook's order, components
 * alphabetically, each part straight after its parent.
 *
 * A component is a folder under `src/components` or `src/compositeComponents` whose name starts with `fs` in any case
 * (one is spelled `FsDateTimeRangePicker`); anything else there (`pickerTimezone`, the `.css` files) is not one. Its
 * stories are every `*.stories.tsx` anywhere under the folder.
 */
export const readCatalog = async (reads: CatalogReads): Promise<CatalogComponent[]> => {
	const found: CatalogComponent[] = [];
	for (const area of AREAS) {
		const files = await reads.listFiles(`src/${area}`);
		const folders = new Map<string, string[]>();
		for (const file of files) {
			const parts = file.split('/');
			// src/<area>/<folder>/<file...>: a file directly in the area is not a component.
			if (parts.length < 4 || parts[0] !== 'src' || parts[1] !== area) continue;
			const folder = parts[2]!;
			if (!/^fs/i.test(folder)) continue;
			const list = folders.get(folder) ?? [];
			list.push(file);
			folders.set(folder, list);
		}
		const inArea: CatalogComponent[] = [];
		for (const [name, list] of folders) {
			const storyFiles = list.filter((f) => /\.stories\.tsx$/.test(f)).sort();
			const read = await Promise.all(storyFiles.map((f) => readStory(reads, f)));
			const title = read.find((r) => r.story.title !== null)?.story.title ?? null;
			inArea.push({
				id: `${area}/${name}`,
				name,
				group: title === null ? UNGROUPED : title.split('/')[0]!.trim() || UNGROUPED,
				composite: area === 'compositeComponents',
				subtitle: read.find((r) => r.subtitle !== null)?.subtitle ?? null,
				stories: read.map((r) => r.story),
				figma: read.find((r) => r.figma !== null)?.figma ?? null,
				source: `${SOURCE_URL}${area}/${name}`,
				partOf: null,
			});
		}
		// A component with no story is a part of the one with a story whose name is the longest proper prefix of its own.
		const withStory = inArea.filter((c) => c.stories.length > 0);
		for (const c of inArea) {
			if (c.stories.length > 0) continue;
			const parent = withStory
				.filter((p) => p.name.length < c.name.length && c.name.toLowerCase().startsWith(p.name.toLowerCase()))
				.sort((a, b) => b.name.length - a.name.length)[0];
			if (parent) {
				c.partOf = parent.id;
				c.group = parent.group;
			}
		}
		found.push(...inArea);
	}

	const byId = new Map(found.map((c) => [c.id, c]));
	const key = (c: CatalogComponent) => {
		const head = c.partOf === null ? c : byId.get(c.partOf)!;
		return { rank: groupRank(c.group), group: c.group, head: head.name.toLowerCase(), part: c.partOf === null ? 0 : 1, name: c.name.toLowerCase() };
	};
	return found.sort((a, b) => {
		const x = key(a);
		const y = key(b);
		return x.rank - y.rank || x.group.localeCompare(y.group) || x.head.localeCompare(y.head) || x.part - y.part || x.name.localeCompare(y.name);
	});
};
