import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
	isGap,
	literalField,
	readCatalog,
	storybookId,
	storybookUrl,
	STORYBOOK_URL,
	UNGROUPED,
	type CatalogReads,
} from '../src/main/services/componentCatalog';
import { libraryReads } from '../src/main/services/designLibrary';

/** A library made of files in memory. A file whose text is null cannot be read. */
const library = (files: Record<string, string | null>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === null || text === undefined) throw new Error(`cannot read ${path}`);
		return text;
	},
});

const story = (title: string, extra = '') => `import type { Meta } from '@storybook/react-vite';
const meta: Meta = {
  title: '${title}',
  component: X,
  parameters: {${extra}
  },
};
export default meta;
`;

describe('reading a story', () => {
	it('reads a standard story in full', async () => {
		const [c] = await readCatalog(
			library({
				'src/components/FSButton/index.tsx': '',
				'src/components/FSButton/FSButton.stories.tsx': story(
					'Buttons/FSButton',
					`
    componentSubtitle: 'Buttons allow users to take actions.',
    urls: { githubUrl: 'https://example.com/old', figmaPageUrl: 'https://www.figma.com/design/abc' },`,
				),
			}),
		);
		expect(c).toEqual({
			id: 'components/FSButton',
			name: 'FSButton',
			group: 'Buttons',
			composite: false,
			subtitle: 'Buttons allow users to take actions.',
			stories: [{ file: 'src/components/FSButton/FSButton.stories.tsx', title: 'Buttons/FSButton', storybook: `${STORYBOOK_URL}?path=/docs/buttons-fsbutton--docs` }],
			figma: 'https://www.figma.com/design/abc',
			source: 'https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/components/FSButton',
			partOf: null,
		});
	});

	it('reads a subtitle written on the line after its key, as FSDialog does', () => {
		expect(literalField("    componentSubtitle:\n      'Dialogs inform users.',", 'componentSubtitle')).toBe('Dialogs inform users.');
	});

	it('takes only plain string literals, never guessing at a template, a variable or a call', () => {
		expect(literalField('title: `Buttons/${name}`,', 'title')).toBeNull();
		expect(literalField('title: TITLE,', 'title')).toBeNull();
		expect(literalField("title: t('x'),", 'title')).toBeNull();
		expect(literalField('title: "Buttons/FSButton",', 'title')).toBe('Buttons/FSButton');
		expect(literalField('title: `Buttons/FSButton`,', 'title')).toBe('Buttons/FSButton');
		expect(literalField("title: 'It\\'s here',", 'title')).toBe("It's here");
	});

	it('puts a story with no readable title in Ungrouped, under its folder name, with no Storybook link', async () => {
		const [c] = await readCatalog(library({ 'src/components/FSOdd/FSOdd.stories.tsx': 'const meta = { title: `Odd/${x}` };' }));
		expect(c).toMatchObject({ name: 'FSOdd', group: UNGROUPED, stories: [{ title: null, storybook: null }] });
	});

	it('keeps a component whose story cannot be read, without what the story would have said', async () => {
		const catalog = await readCatalog(
			library({ 'src/components/FSBroken/FSBroken.stories.tsx': null, 'src/components/FSButton/FSButton.stories.tsx': story('Buttons/FSButton') }),
		);
		expect(catalog.map((c) => c.name)).toEqual(['FSButton', 'FSBroken']);
		expect(catalog[1]).toMatchObject({ group: UNGROUPED, subtitle: null, stories: [{ title: null }] });
	});

	it('builds Source from the folder even when the story has no githubUrl', async () => {
		const [c] = await readCatalog(library({ 'src/compositeComponents/FSEmptyState/FSEmptyState.stories.tsx': story('Layout/Composite Components/FSEmptyState') }));
		expect(c?.source).toBe('https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/compositeComponents/FSEmptyState');
		expect(c?.figma).toBeNull();
		expect(c?.composite).toBe(true);
	});
});

describe('which folders are components', () => {
	it('takes folders starting with fs in any case, and skips other folders and loose files', async () => {
		const catalog = await readCatalog(
			library({
				'src/components/FsDateTimeRangePicker/FsDateTimeRangePicker.stories.tsx': story('Inputs/FSDateTimeRangePicker'),
				'src/components/pickerTimezone/index.tsx': '',
				'src/components/flock-theme.css': '',
				'src/components/index.ts': '',
			}),
		);
		expect(catalog.map((c) => c.id)).toEqual(['components/FsDateTimeRangePicker']);
	});

	it('finds every story in a folder, nested ones included', async () => {
		const catalog = await readCatalog(
			library({
				'src/compositeComponents/FSPopovers/fsPopoverHeader.stories.tsx': story('Popovers/PopoverHeader'),
				'src/compositeComponents/FSPopovers/fsMapPopoverContainer.stories.tsx': story('Popovers/MapPopoverContainer'),
				'src/compositeComponents/FSInputModal/FSFormInput/fsFormInput.stories.tsx': story('Inputs/Composite Components/FSInputModal/FSFormInput'),
			}),
		);
		const popovers = catalog.find((c) => c.name === 'FSPopovers');
		expect(popovers?.stories.map((s) => s.title)).toEqual(['Popovers/MapPopoverContainer', 'Popovers/PopoverHeader']);
		expect(catalog.find((c) => c.name === 'FSInputModal')?.stories).toHaveLength(1);
	});
});

describe('parts and gaps', () => {
	const files = {
		'src/components/FSCard/FSCard.stories.tsx': story('Surfaces/FSCard'),
		'src/components/FSCardContent/index.tsx': '',
		'src/components/FSList/FSList.stories.tsx': story('Data Display/FSList'),
		'src/components/FSListItem/index.tsx': '',
		'src/components/FSListItemText/index.tsx': '',
		'src/components/FSApp/index.tsx': '',
	};

	it('makes a story-less component a part of the one with a story whose name is the longest prefix of its own', async () => {
		const catalog = await readCatalog(library(files));
		const byName = Object.fromEntries(catalog.map((c) => [c.name, c]));
		expect(byName.FSCardContent).toMatchObject({ partOf: 'components/FSCard', group: 'Surfaces' });
		// FSListItem has no story, so it cannot be a parent: FSListItemText belongs to FSList.
		expect(byName.FSListItemText).toMatchObject({ partOf: 'components/FSList', group: 'Data Display' });
		expect(isGap(byName.FSCardContent!)).toBe(false);
	});

	it('picks the longest prefix when two components with stories match', async () => {
		const catalog = await readCatalog(
			library({
				'src/components/FSList/FSList.stories.tsx': story('Data Display/FSList'),
				'src/components/FSListItem/FSListItem.stories.tsx': story('Data Display/FSListItem'),
				'src/components/FSListItemText/index.tsx': '',
			}),
		);
		expect(catalog.find((c) => c.name === 'FSListItemText')?.partOf).toBe('components/FSListItem');
	});

	it('marks a story-less component with no parent as a gap', async () => {
		const app = (await readCatalog(library(files))).find((c) => c.name === 'FSApp')!;
		expect(app).toMatchObject({ partOf: null, group: UNGROUPED });
		expect(isGap(app)).toBe(true);
	});

	it('lists each part straight after its parent', async () => {
		expect((await readCatalog(library(files))).map((c) => c.name)).toEqual(['FSList', 'FSListItem', 'FSListItemText', 'FSCard', 'FSCardContent', 'FSApp']);
	});
});

describe('order', () => {
	it("puts groups in Storybook's order, any other group after them alphabetically, and Ungrouped last", async () => {
		const catalog = await readCatalog(
			library({
				'src/components/FSTable/FSTable.stories.tsx': story('Tables/FSTable'),
				'src/components/FSUtil/FSUtil.stories.tsx': story('Utils/FSUtil'),
				'src/components/FSNoTitle/FSNoTitle.stories.tsx': 'const meta = {};',
				'src/components/FSPop/FSPop.stories.tsx': story('Popovers/FSPop'),
				'src/components/FSInput/FSInput.stories.tsx': story('Inputs/FSInput'),
				'src/components/FSButtonB/FSButtonB.stories.tsx': story('Buttons/FSButtonB'),
				'src/components/FSButtonA/FSButtonA.stories.tsx': story('Buttons/FSButtonA'),
			}),
		);
		expect(catalog.map((c) => c.group)).toEqual(['Buttons', 'Buttons', 'Inputs', 'Tables', 'Popovers', 'Utils', UNGROUPED]);
		expect(catalog[0]?.name).toBe('FSButtonA');
	});
});

describe("Storybook's id rule", () => {
	it.each([
		['Buttons/FSButton', 'buttons-fsbutton'],
		['Data Display/FSAvatar', 'data-display-fsavatar'],
		['Inputs/Composite Components/FSInputModal/FSFormInput', 'inputs-composite-components-fsinputmodal-fsforminput'],
		['Design Tokens/Spacing & Shape', 'design-tokens-spacing-shape'],
	])('%s is %s', (title, id) => {
		expect(storybookId(title)).toBe(id);
		expect(storybookUrl(title)).toBe(`${STORYBOOK_URL}?path=/docs/${id}--docs`);
	});
});

/**
 * The reader against the real library's `origin/develop`, not a fixture. Skipped, loudly, when the library is not
 * checked out beside this repository.
 */
const LIBRARY = '/Users/noah.shrader/Documents/GitHub/flock-react-component-lib';
const git = (...args: string[]) => execFileSync('git', ['-C', LIBRARY, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const hasDevelop = (() => {
	if (!existsSync(`${LIBRARY}/.git`)) return false;
	try {
		git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/develop');
		return true;
	} catch {
		return false;
	}
})();

describe.skipIf(!hasDevelop)('against the real library on origin/develop', () => {
	// The app's own reads (one `cat-file --batch` for the stories), so this checks them on the real library too.
	const reads = libraryReads(LIBRARY);

	it('finds the components, with the six real gaps by name', async () => {
		const catalog = await readCatalog(reads);
		expect(catalog.filter((c) => !c.composite).length).toBeGreaterThan(70);
		expect(catalog.filter((c) => c.composite).length).toBeGreaterThan(15);
		expect(catalog.filter((c) => c.partOf !== null).length).toBeGreaterThan(20);
		expect(catalog.filter(isGap).map((c) => c.name).sort()).toEqual(['FSApp', 'FSInputAdornment', 'FSLoadingButton', 'FSRadioButton', 'FSTab', 'FSTreeItem']);
	});

	it('reads every story title, so nothing on develop is Ungrouped', async () => {
		const catalog = await readCatalog(reads);
		expect(catalog.filter((c) => c.stories.some((s) => s.title === null)).map((c) => c.name)).toEqual([]);
		expect(catalog.filter((c) => c.group === UNGROUPED && !isGap(c)).map((c) => c.name)).toEqual([]);
	});

	it("builds every Storybook id exactly as the library's own Storybook does", async () => {
		const csf = createRequire(`${LIBRARY}/package.json`)('storybook/internal/csf') as { toId: (kind: string, name: string) => string };
		const titles = (await readCatalog(reads)).flatMap((c) => c.stories.map((s) => s.title!));
		expect(titles.length).toBeGreaterThan(70);
		for (const title of titles) expect(`${storybookId(title)}--docs`).toBe(csf.toId(title, 'Docs'));
	});
});
