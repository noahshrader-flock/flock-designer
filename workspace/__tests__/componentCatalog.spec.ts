import { describe, expect, it } from 'vitest';
import { designSystemOf, type DesignSystem } from '../src/shared/catalog';
import {
	isStoryFile,
	literalField,
	readCatalog,
	storybookId,
	storybookUrl,
	UNGROUPED,
	type CatalogReads,
} from '../src/core/services/designSystem/componentCatalog';

/** A library made of files in memory. A file whose text is null cannot be read. */
const library = (files: Record<string, string | null>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === null || text === undefined) throw new Error(`cannot read ${path}`);
		return text;
	},
});
const DS: DesignSystem = { repository: 'acme/ui', branch: 'main', storybook: 'https://sb.example/' };
const story = (title: string, extra = '') => `const meta = {\n  title: '${title}',\n  parameters: {${extra}\n  },\n};\nexport default meta;\n`;

describe('what is a component', () => {
	it('is every Storybook story file, wherever it is, by any of the script extensions, and no docs page', async () => {
		const catalog = await readCatalog(
			library({
				'src/components/Button/Button.stories.tsx': story('Buttons/Button'),
				'lib/anywhere/deep/Card.stories.jsx': story('Surfaces/Card'),
				'packages/x/Chip.stories.ts': story('Data/Chip'),
				'src/Intro.mdx': '# Welcome',
				'src/components/Button/index.tsx': '',
				'src/stories.tsx': '',
			}),
			DS,
		);
		expect(catalog.map((c) => c.id).sort()).toEqual([
			'lib/anywhere/deep/Card.stories.jsx',
			'packages/x/Chip.stories.ts',
			'src/components/Button/Button.stories.tsx',
		]);
		expect(['a.stories.js', 'a.stories.mjs', 'a.stories.tsx'].every(isStoryFile)).toBe(true);
		expect(['a.stories.mdx', 'a.story.tsx', 'stories.tsx'].some(isStoryFile)).toBe(false);
	});

	it('names and groups a component by its Storybook title, and links it to the library’s own Storybook and source', async () => {
		const [c] = await readCatalog(
			library({
				'src/components/FSButton/FSButton.stories.tsx': story('Buttons/FSButton', "\n    componentSubtitle: 'Buttons allow users to take actions.',"),
			}),
			designSystemOf({ repository: 'flocksafety/flock-react-component-lib', branch: 'develop' }),
		);
		expect(c).toEqual({
			id: 'src/components/FSButton/FSButton.stories.tsx',
			name: 'FSButton',
			group: 'Buttons',
			subtitle: 'Buttons allow users to take actions.',
			storybook: 'https://develop--6617f3c579abb5c5e780fddc.chromatic.com/?path=/docs/buttons-fsbutton--docs',
			source: 'https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/components/FSButton',
		});
	});

	it('takes the name from the last part of a deeper title, and the group from the first', async () => {
		const [c] = await readCatalog(library({ 'a/FormInput.stories.tsx': story('Inputs/Composite Components/FSInputModal/FSFormInput') }), DS);
		expect(c).toMatchObject({ name: 'FSFormInput', group: 'Inputs' });
	});

	it('names a story with no readable title by its file, Ungrouped, with no Storybook link', async () => {
		const [c] = await readCatalog(library({ 'src/Odd/Odd.stories.tsx': 'const meta = { title: `Odd/${x}` };' }), DS);
		expect(c).toMatchObject({ name: 'Odd', group: UNGROUPED, storybook: null, source: 'https://github.com/acme/ui/tree/main/src/Odd' });
	});

	it('leaves out Storybook links for a library with no hosted Storybook', async () => {
		const [c] = await readCatalog(library({ 'a/B.stories.tsx': story('X/B') }), { ...DS, storybook: null });
		expect(c?.storybook).toBeNull();
	});

	it('keeps a story file that cannot be read, without what it would have said', async () => {
		const catalog = await readCatalog(library({ 'a/Broken.stories.tsx': null, 'a/Fine.stories.tsx': story('X/Fine') }), DS);
		expect(catalog.map((c) => [c.name, c.group])).toEqual([
			['Fine', 'X'],
			['Broken', UNGROUPED],
		]);
	});
});

describe('reading a story', () => {
	it('reads a subtitle written on the line after its key', () => {
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
});

describe('the order', () => {
	it('is alphabetical: groups, then names within a group, whatever case they are written in, with Ungrouped last', async () => {
		const catalog = await readCatalog(
			library({
				'a/Zeta.stories.tsx': story('Popovers/Zeta'),
				'a/Alpha.stories.tsx': story('Popovers/Alpha'),
				'a/Field.stories.tsx': story('inputs/Field'),
				'a/primary.stories.tsx': story('Buttons/primary'),
				'a/Big.stories.tsx': story('Buttons/Big'),
				'a/Loose.stories.tsx': 'const meta = {};',
				'a/Utils.stories.tsx': story('Utils/Util'),
			}),
			DS,
		);
		expect(catalog.map((c) => `${c.group}/${c.name}`)).toEqual([
			'Buttons/Big',
			'Buttons/primary',
			'inputs/Field',
			'Popovers/Alpha',
			'Popovers/Zeta',
			'Utils/Util',
			`${UNGROUPED}/Loose`,
		]);
	});

	it('is the same whatever order the library’s own Storybook shows its sidebar in: it is not read', async () => {
		const SIDEBAR = "const preview = { parameters: { options: { storySort: { order: ['Popovers', 'Inputs', 'Buttons'] } } } };";
		const files = { 'a/B.stories.tsx': story('Buttons/B'), 'a/P.stories.tsx': story('Popovers/P'), 'a/I.stories.tsx': story('Inputs/I') };
		const without = await readCatalog(library(files), DS);
		const withSidebar = await readCatalog(library({ ...files, '.storybook/preview.tsx': SIDEBAR }), DS);
		expect(withSidebar.map((c) => c.group)).toEqual(['Buttons', 'Inputs', 'Popovers']);
		expect(withSidebar).toEqual(without);
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
		expect(storybookUrl('https://sb.example/', title)).toBe(`https://sb.example/?path=/docs/${id}--docs`);
	});
});
