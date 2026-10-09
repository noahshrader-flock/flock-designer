import { describe, expect, it } from 'vitest';
import type { CatalogReads } from '../src/main/services/componentCatalog';
import { readTokens } from '../src/main/services/designTokens';
import { categoryOf } from '../src/main/services/tokens/source';

/**
 * The other ways a library keeps its tokens (decision 18), behind the same list as FUI's theme files: CSS variables (a
 * shadcn or Tailwind design system), and design token files in the standard JSON format. Against fixtures.
 */

const reads = (files: Record<string, string>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === undefined) throw new Error(`no ${path}`);
		return text;
	},
});
const find = (list: Awaited<ReturnType<typeof readTokens>>, path: string) => list.tokens.find((t) => t.path === path);

describe('which tab a token is on', () => {
	it('is Color for a color, Shape for a radius, Spacing for spacing, and nothing for a size it cannot place', () => {
		expect(categoryOf('color', 'primary')).toBe('Color');
		expect(categoryOf('dimension', 'radius-md')).toBe('Shape');
		expect(categoryOf('dimension', 'rounded')).toBe('Shape');
		expect(categoryOf('dimension', 'spacing')).toBe('Spacing');
		expect(categoryOf('dimension', 'space.4')).toBe('Spacing');
		expect(categoryOf('dimension', 'gap-2')).toBe('Spacing');
		// Not a guess: a font size, a width or a breakpoint is not spacing.
		expect(categoryOf('dimension', 'font-size-sm')).toBeNull();
		expect(categoryOf('dimension', 'breakpoint-md')).toBeNull();
	});
});

describe('CSS variables', () => {
	const CSS = `:root {
  --background: #ffffff;
  --primary: oklch(0.205 0 0);
  --ring: rgb(10 20 30);
  --radius: 0.625rem;
  --font-size-sm: 14px;
  --z-modal: 50;
  /* --commented: #000000; */
}

.dark {
  --background: hsl(0 0% 4%);
  --primary: var(--ring-dark);
  --ring-dark: #333333;
}

@theme {
  --color-red-500: oklch(0.637 0.237 25.331);
  --spacing: 0.25rem;
}
`;

	it('are read as tokens when the library has no theme files, each mode from its own block', async () => {
		const list = await readTokens(reads({ 'src/styles/globals.css': CSS }));
		expect(list.source).toBe('CSS variables');
		expect(find(list, 'css.light.background')).toMatchObject({ kind: 'color', category: 'Color', group: 'Light', value: '#ffffff', source: { file: 'src/styles/globals.css', line: 2 } });
		expect(find(list, 'css.dark.background')).toMatchObject({ group: 'Dark', value: 'hsl(0 0% 4%)' });
		expect(find(list, 'css.light.primary')?.value).toBe('oklch(0.205 0 0)');
		expect(find(list, 'css.light.ring')?.value).toBe('rgb(10 20 30)');
	});

	it('follow a variable to the color it points at', async () => {
		const list = await readTokens(reads({ 'src/styles/globals.css': CSS }));
		expect(find(list, 'css.dark.primary')?.value).toBe('#333333');
	});

	it('put a radius on Shape and spacing on Spacing, and leave out what is neither', async () => {
		const list = await readTokens(reads({ 'src/styles/globals.css': CSS }));
		expect(find(list, 'css.light.radius')).toMatchObject({ kind: 'dimension', category: 'Shape', value: '0.625rem' });
		expect(find(list, 'css.light.spacing')).toMatchObject({ kind: 'dimension', category: 'Spacing', value: '0.25rem' });
		expect(list.tokens.map((t) => t.path)).not.toContain('css.light.font-size-sm');
		expect(list.tokens.map((t) => t.path)).not.toContain('css.light.z-modal');
		expect(list.tokens.map((t) => t.path)).not.toContain('css.light.commented');
	});

	it('group a scale of steps into one set: Tailwind’s --color-red-500 is step 500 of color-red', async () => {
		const list = await readTokens(reads({ 'src/styles/globals.css': CSS }));
		expect(find(list, 'css.light.color-red-500')).toMatchObject({ set: 'color-red', name: '500' });
	});
});

describe('design token files', () => {
	const TOKENS = JSON.stringify(
		{
			color: {
				$type: 'color',
				red: { 500: { $value: '#ff0000' } },
				brand: { $value: '{color.red.500}' },
			},
			spacing: { sm: { $type: 'dimension', $value: '4px' } },
			radius: { md: { $type: 'dimension', $value: { value: 6, unit: 'px' } } },
			font: { body: { $type: 'typography', $value: { fontFamily: 'Inter' } } },
		},
		null,
		2,
	);

	it('are read as tokens in the standard format, with the type each group says', async () => {
		const list = await readTokens(reads({ 'tokens/base.tokens.json': TOKENS }));
		expect(list.source).toBe('token files');
		expect(find(list, 'color.red.500')).toMatchObject({ kind: 'color', category: 'Color', group: 'Color', set: 'color.red', name: '500', value: '#ff0000' });
		expect(find(list, 'spacing.sm')).toMatchObject({ kind: 'dimension', category: 'Spacing', value: '4px' });
		expect(find(list, 'radius.md')).toMatchObject({ kind: 'dimension', category: 'Shape', value: '6px' });
	});

	it('follow a reference to the token it names, and leave out the kinds the panel does not show', async () => {
		const list = await readTokens(reads({ 'tokens/base.tokens.json': TOKENS }));
		expect(find(list, 'color.brand')?.value).toBe('#ff0000');
		expect(list.tokens.map((t) => t.path)).not.toContain('font.body');
	});

	it('name a file that is not JSON, and read the others', async () => {
		const list = await readTokens(reads({ 'tokens/base.tokens.json': TOKENS, 'tokens/broken.tokens.json': '{ not json' }));
		expect(find(list, 'color.red.500')).toBeDefined();
		expect(list.problems).toEqual([{ file: 'tokens/broken.tokens.json', reason: expect.stringContaining('not JSON') }]);
	});
});

describe('the order they are tried in', () => {
	it('takes the first way that finds tokens, theme files first, so one library is never read two ways at once', async () => {
		const list = await readTokens(
			reads({
				'src/colors/tones.ts': "export const blue = {\n  50: '#0000FF',\n  40: '#0000AA',\n};\n",
				'src/styles/globals.css': ':root {\n  --primary: #ff0000;\n}\n',
			}),
		);
		expect(list.source).toBe('theme files');
		expect(list.tokens.some((t) => t.path.startsWith('css.'))).toBe(false);
	});
});
