import { describe, expect, it } from 'vitest';
import type { CatalogReads } from '../src/main/services/componentCatalog';
import { readTokens } from '../src/main/services/designTokens';

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

	it('put the semantic variables before a Tailwind scale’s steps, which are the raw colors', async () => {
		const css = ':root {\n  --color-red-500: #ff0000;\n  --primary: #00ff00;\n  --color-red-600: #cc0000;\n}\n';
		const list = await readTokens(reads({ 'src/styles/globals.css': css }));
		expect(list.tokens.map((t) => t.path)).toEqual(['css.light.primary', 'css.light.color-red-500', 'css.light.color-red-600']);
	});

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

	it('put a radius on Shape, spacing on Spacing, a font size on Typography, and leave out what is none of these', async () => {
		const list = await readTokens(reads({ 'src/styles/globals.css': CSS }));
		expect(find(list, 'css.light.radius')).toMatchObject({ kind: 'dimension', category: 'Shape', value: '0.625rem' });
		expect(find(list, 'css.light.spacing')).toMatchObject({ kind: 'dimension', category: 'Spacing', value: '0.25rem' });
		expect(find(list, 'css.light.font-size-sm')).toMatchObject({ kind: 'font', category: 'Typography', group: 'Size', set: 'sm', value: '14px' });
		expect(list.tokens.map((t) => t.path)).not.toContain('css.light.z-modal');
		expect(list.tokens.map((t) => t.path)).not.toContain('css.light.commented');
	});

	it('read typography by its name, as Tailwind’s theme names it: a family, a weight, a size and its line height, a leading', async () => {
		const css = `@theme {
  --font-sans: Inter, sans-serif;
  --font-weight-bold: 700;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.25rem;
  --leading-tight: 1.25;
  --text-muted: #666666;
  --font-color: #333333;
}
`;
		const list = await readTokens(reads({ 'src/app.css': css }));
		const typography = list.tokens.filter((t) => t.category === 'Typography').map(({ path, kind, group, set, name, value }) => ({ path, kind, group, set, name, value }));
		expect(typography).toEqual([
			{ path: 'css.light.font-sans', kind: 'font', group: 'Family', set: 'font', name: 'sans', value: 'Inter, sans-serif' },
			{ path: 'css.light.font-weight-bold', kind: 'font', group: 'Weight', set: 'font-weight', name: 'bold', value: '700' },
			{ path: 'css.light.text-sm', kind: 'font', group: 'Size', set: 'sm', name: 'size', value: '0.875rem' },
			{ path: 'css.light.text-sm--line-height', kind: 'font', group: 'Line height', set: 'sm', name: 'line height', value: '1.25rem' },
			{ path: 'css.light.leading-tight', kind: 'font', group: 'Line height', set: 'leading', name: 'tight', value: '1.25' },
		]);
		// A color named like type is a color: a font's color is not a family.
		expect(find(list, 'css.light.text-muted')).toMatchObject({ kind: 'color', category: 'Color' });
		expect(find(list, 'css.light.font-color')).toMatchObject({ kind: 'color', category: 'Color' });
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

	it('put the tokens that name another before the raw ones they name', async () => {
		const list = await readTokens(reads({ 'tokens/base.tokens.json': TOKENS }));
		const colors = list.tokens.filter((t) => t.category === 'Color').map((t) => t.path);
		expect(colors).toEqual(['color.brand', 'color.red.500']);
	});

	it('follow a reference to the token it names', async () => {
		const list = await readTokens(reads({ 'tokens/base.tokens.json': TOKENS }));
		expect(find(list, 'color.brand')?.value).toBe('#ff0000');
	});

	it('read typography: a family, a weight, a size, and a typography token as each of its parts, following what it names', async () => {
		const type = JSON.stringify(
			{
				font: {
					family: { sans: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } },
					weight: { bold: { $type: 'fontWeight', $value: 700 } },
					size: { body: { $type: 'dimension', $value: '16px' } },
				},
				heading: { h1: { $type: 'typography', $value: { fontFamily: '{font.family.sans}', fontSize: '32px', fontWeight: 700, lineHeight: 1.2 } } },
				shadow: { sm: { $type: 'shadow', $value: { offsetX: '0px' } } },
			},
			null,
			2,
		);
		const list = await readTokens(reads({ 'tokens/type.tokens.json': type }));
		const typography = list.tokens.filter((t) => t.category === 'Typography').map(({ path, kind, group, set, name, value }) => ({ path, kind, group, set, name, value }));
		expect(typography).toEqual([
			{ path: 'font.family.sans', kind: 'font', group: 'Family', set: 'font.family', name: 'sans', value: 'Inter, sans-serif' },
			{ path: 'font.weight.bold', kind: 'font', group: 'Weight', set: 'font.weight', name: 'bold', value: '700' },
			{ path: 'font.size.body', kind: 'font', group: 'Size', set: 'font.size', name: 'body', value: '16px' },
			{ path: 'heading.h1.fontFamily', kind: 'font', group: 'Family', set: 'heading.h1', name: 'fontFamily', value: 'Inter, sans-serif' },
			{ path: 'heading.h1.fontSize', kind: 'font', group: 'Size', set: 'heading.h1', name: 'fontSize', value: '32px' },
			{ path: 'heading.h1.fontWeight', kind: 'font', group: 'Weight', set: 'heading.h1', name: 'fontWeight', value: '700' },
			{ path: 'heading.h1.lineHeight', kind: 'font', group: 'Line height', set: 'heading.h1', name: 'lineHeight', value: '1.2' },
		]);
		// A kind no primitive reads yet is still left out.
		expect(list.tokens.map((t) => t.path)).not.toContain('shadow.sm');
	});

	it('read the one typography token in the shared fixture as its family', async () => {
		const list = await readTokens(reads({ 'tokens/base.tokens.json': TOKENS }));
		expect(find(list, 'font.body.fontFamily')).toMatchObject({ kind: 'font', category: 'Typography', group: 'Family', value: 'Inter' });
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
