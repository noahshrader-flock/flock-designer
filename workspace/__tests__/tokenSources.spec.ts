import { describe, expect, it } from 'vitest';
import { readTokens } from '../src/core/services/designSystem/designTokens';
import { editedFiles } from '../src/core/services/designSystem/tokenEdits';
import { channelsOf, hexOfChannels } from '../src/core/services/designSystem/tokens/cssVariables';
import { memoryReads, styledLibrary } from './fixtures';

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
		const list = await readTokens(styledLibrary({ 'src/styles/globals.css': css }));
		expect(list.tokens.map((t) => t.path)).toEqual(['css.light.primary', 'css.light.color-red-500', 'css.light.color-red-600']);
	});

	it('are read as tokens when the library has no theme files, each mode from its own block', async () => {
		const list = await readTokens(styledLibrary({ 'src/styles/globals.css': CSS }));
		expect(list.source).toBe('CSS variables');
		expect(find(list, 'css.light.background')).toMatchObject({
			kind: 'color',
			category: 'Color',
			group: 'Light',
			value: '#ffffff',
			source: { file: 'src/styles/globals.css', line: 2 },
		});
		expect(find(list, 'css.dark.background')).toMatchObject({ group: 'Dark', value: 'hsl(0 0% 4%)' });
		expect(find(list, 'css.light.primary')?.value).toBe('oklch(0.205 0 0)');
		expect(find(list, 'css.light.ring')?.value).toBe('rgb(10 20 30)');
	});

	it('follow a variable to the color it points at', async () => {
		const list = await readTokens(styledLibrary({ 'src/styles/globals.css': CSS }));
		expect(find(list, 'css.dark.primary')?.value).toBe('#333333');
	});

	it('put a radius on Shape, spacing on Spacing, a font size on Typography, and leave out what is none of these', async () => {
		const list = await readTokens(styledLibrary({ 'src/styles/globals.css': CSS }));
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
		const list = await readTokens(styledLibrary({ 'src/app.css': css }));
		const typography = list.tokens
			.filter((t) => t.category === 'Typography')
			.map(({ path, kind, group, set, name, value }) => ({ path, kind, group, set, name, value }));
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

	it('read a shadow by its name, as Tailwind’s theme names them, following a variable it is written as', async () => {
		const css = `@theme {
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --inset-shadow-xs: inset 0 1px 1px rgb(0 0 0 / 0.05);
  --shadow: var(--shadow-sm);
  --shadow-color: #000000;
}
`;
		const list = await readTokens(styledLibrary({ 'src/app.css': css }));
		const shadows = list.tokens
			.filter((t) => t.category === 'Elevation')
			.map(({ path, kind, group, set, name, value }) => ({ path, kind, group, set, name, value }));
		expect(shadows).toEqual([
			{
				path: 'css.light.shadow-sm',
				kind: 'shadow',
				group: 'Shadows',
				set: 'shadow',
				name: 'sm',
				value: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
			},
			{
				path: 'css.light.inset-shadow-xs',
				kind: 'shadow',
				group: 'Shadows',
				set: 'inset-shadow',
				name: 'xs',
				value: 'inset 0 1px 1px rgb(0 0 0 / 0.05)',
			},
			{
				path: 'css.light.shadow',
				kind: 'shadow',
				group: 'Shadows',
				set: 'shadow',
				name: 'base',
				value: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
			},
		]);
		expect(find(list, 'css.light.shadow-color')).toMatchObject({ kind: 'color', category: 'Color' });
	});

	it('read breakpoints and border widths as lengths named for them, and motion as its durations and easings', async () => {
		const css = `@theme {
  --breakpoint-md: 48rem;
  --border-thin: 1px;
  --duration-fast: 150ms;
  --default-transition-duration: 0.15s;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --border: #e5e5e5;
}
`;
		const list = await readTokens(styledLibrary({ 'src/app.css': css }));
		expect(find(list, 'css.light.breakpoint-md')).toMatchObject({ kind: 'dimension', category: 'Breakpoints', group: 'Breakpoints', value: '48rem' });
		expect(find(list, 'css.light.border-thin')).toMatchObject({ kind: 'dimension', category: 'Borders', group: 'Borders', value: '1px' });
		expect(find(list, 'css.light.duration-fast')).toMatchObject({ kind: 'duration', category: 'Motion', group: 'Duration', value: '150ms' });
		expect(find(list, 'css.light.default-transition-duration')).toMatchObject({
			kind: 'duration',
			category: 'Motion',
			group: 'Duration',
			value: '0.15s',
		});
		expect(find(list, 'css.light.ease-out')).toMatchObject({
			kind: 'easing',
			category: 'Motion',
			group: 'Easing',
			value: 'cubic-bezier(0, 0, 0.2, 1)',
		});
		expect(find(list, 'css.light.border')).toMatchObject({ kind: 'color', category: 'Color' });
	});

	it('read shadcn’s colors written as bare HSL channels, as the color they draw, in each mode and through a pointer', async () => {
		const css = ':root {\n  --primary: 222.2 47.4% 11.2%;\n  --ring: var(--primary);\n}\n.dark {\n  --primary: 210 40% 98%;\n}\n';
		const list = await readTokens(styledLibrary({ 'src/globals.css': css }));
		expect(find(list, 'css.light.primary')).toMatchObject({ kind: 'color', category: 'Color', value: '#0F172A' });
		expect(find(list, 'css.dark.primary')?.value).toBe('#F8FAFC');
		expect(find(list, 'css.light.ring')).toMatchObject({ value: '#0F172A', ref: { path: 'css.light.primary' } });
	});

	it('give back every color it writes as channels as that same color, so a change reads back as made', () => {
		for (let n = 0; n < 4096; n++) {
			const hex = `#${(((n * 2654435761) >>> 0) % 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
			expect(hexOfChannels(channelsOf(hex))).toBe(hex);
		}
		expect(hexOfChannels(channelsOf('#11223380'))).toBe('#11223380');
	});

	it('give a color written short (Tremor’s --color-black: #000) as its full hex, so it is matched where it is drawn', async () => {
		const list = await readTokens(styledLibrary({ 'src/globals.css': ':root {\n  --color-black: #000;\n  --color-tint: #f0a8;\n}\n' }));
		expect(find(list, 'css.light.color-black')?.value).toBe('#000000');
		expect(find(list, 'css.light.color-tint')?.value).toBe('#FF00AA88');
	});

	it('group a scale of steps into one set: Tailwind’s --color-red-500 is step 500 of color-red', async () => {
		const list = await readTokens(styledLibrary({ 'src/styles/globals.css': CSS }));
		expect(find(list, 'css.light.color-red-500')).toMatchObject({ set: 'color-red', name: '500' });
	});
});

describe('which mode a variable is a token of', () => {
	it('is the page’s own rules and light’s for light, dark’s for dark; one scoped to a component or another theme is no token', async () => {
		const css = `:root { --brand: #108062; }
[data-theme="light"] { --surface: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --surface: #111111; } }
.card { --brand: #ff0000; --card-gap: 4px; }
[data-color-mode="light"][data-light-theme="high_contrast"] .x { --brand: #000000; }
.darken { --surface: #222222; }
`;
		const list = await readTokens(styledLibrary({ 'src/theme.css': css }));
		expect(list.tokens.map((t) => [t.path, t.value])).toEqual([
			['css.light.brand', '#108062'],
			['css.light.surface', '#ffffff'],
			['css.dark.surface', '#111111'],
		]);
	});
});

describe('CSS variables a stylesheet imports (Phase 5.5)', () => {
	const PACKAGE = {
		'node_modules/theme-kit/package.json': JSON.stringify({ name: 'theme-kit', exports: { '.': { style: './index.css' } } }),
		'node_modules/theme-kit/index.css': `@layer theme {
  @theme default {
    --color-blue-500: oklch(0.62 0.21 259.8);
    --radius-md: 0.375rem;
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    --font-sans: ui-sans-serif, 'Apple Color Emoji', "Segoe UI; Emoji";
    --radius-lg: 0.5rem;
  }
}
.dark { --surface: #111111; }
`,
	};
	const LIBRARY = { ...PACKAGE, 'src/globals.css': "@import 'theme-kit';\n\n:root {\n  --radius-lg: 12px;\n}\n" };

	it('are the library’s, read where it imports them, with what it declares after them winning, as in the browser', async () => {
		const list = await readTokens(styledLibrary(LIBRARY));
		expect(list.source).toBe('CSS variables');
		const imported = { file: 'src/globals.css', line: 1 };
		expect(find(list, 'css.light.radius-md')).toMatchObject({
			value: '0.375rem',
			source: { ...imported, from: { file: 'node_modules/theme-kit/index.css', line: 4, rule: ':root' } },
		});
		expect(find(list, 'css.light.color-blue-500')).toMatchObject({ kind: 'color', source: { ...imported, from: { line: 3 } } });
		expect(find(list, 'css.dark.surface')?.source.from).toEqual({ file: 'node_modules/theme-kit/index.css', line: 12, rule: '.dark' });
		// Declared after the package's, and after a rule with braces of its own in the package's: the library's own.
		expect(find(list, 'css.light.radius-lg')).toMatchObject({ value: '12px', source: { file: 'src/globals.css', line: 4 } });
		expect(find(list, 'css.light.radius-lg')?.source.from).toBeUndefined();
		// A `;` inside a font's quoted name is the font's, not the end of its declaration.
		expect(find(list, 'css.light.font-sans')?.value).toBe(`ui-sans-serif, 'Apple Color Emoji', "Segoe UI; Emoji"`);
	});

	it('read a stylesheet of the library’s own it imports as its own, and a package not installed as nothing', async () => {
		const list = await readTokens(
			styledLibrary({ 'src/globals.css': "@import './theme.css';\n@import 'not-installed';\n", 'src/theme.css': ':root {\n  --radius: 4px;\n}\n' }),
		);
		expect(list.tokens.map((t) => [t.path, t.source])).toEqual([['css.light.radius', { file: 'src/theme.css', line: 2 }]]);
	});
});

describe('CSS variables the library’s stories load (its Storybook preview’s imports)', () => {
	/** A library whose unit tests' set-up stylesheet and whose Storybook's both import the same package, as Primer's do. */
	const LIBRARY = {
		'node_modules/kit/package.json': JSON.stringify({ name: 'kit', exports: { '.': { style: './index.css' } } }),
		'node_modules/kit/index.css': ':root {\n  --radius-md: 0.375rem;\n}\n',
		'config/vitest/global.css': "@import 'kit';\n",
		'.storybook/primitives.css': "@import 'kit';\n",
		'.storybook/preview.tsx': "import './primitives.css';\nimport { Thing } from './thing';\nexport default {};\n",
	};

	it('are read from the stylesheet the preview imports, so a change is written where a story sees it', async () => {
		const list = await readTokens(memoryReads(LIBRARY));
		expect(find(list, 'css.light.radius-md')?.source).toMatchObject({ file: '.storybook/primitives.css', line: 1 });
		// Written there, over the package's: the file the stories load, not the tests'.
		const edited = await editedFiles(memoryReads(LIBRARY), [{ path: 'css.light.radius-md', value: '1rem' }]);
		expect([...edited.keys()]).toEqual(['.storybook/primitives.css']);
	});

	it('are not read from a stylesheet nothing loads: neither the stories nor the library’s own code', async () => {
		const list = await readTokens(memoryReads({ ...LIBRARY, '.storybook/preview.tsx': 'export default {};\n' }));
		expect(list.tokens).toEqual([]);
	});

	it('are read from a stylesheet the library’s own code imports, by any form of import', async () => {
		for (const loads of [
			"import '../config/vitest/global.css';",
			"import styles from '../config/vitest/global.css';",
			"require('../config/vitest/global.css');",
		]) {
			const list = await readTokens(memoryReads({ ...LIBRARY, '.storybook/preview.tsx': 'export default {};\n', 'src/index.ts': `${loads}\n` }));
			expect(find(list, 'css.light.radius-md')?.source, loads).toMatchObject({ file: 'config/vitest/global.css' });
		}
	});

	it('are read past a package manifest that is not JSON: one broken file never stops the rest', async () => {
		const list = await readTokens(
			memoryReads({
				'broken/package.json': '{ not json',
				'package.json': '{ "style": "theme.css" }',
				'theme.css': ':root {\n  --brand: #123456;\n}\n',
			}),
		);
		expect(find(list, 'css.light.brand')?.value).toBe('#123456');
	});

	it('are read from the stylesheet a library that ships only CSS names in its package: its style, main or exports', async () => {
		for (const named of [{ style: 'dist/theme.css' }, { main: 'dist/theme.css' }, { exports: { '.': { style: './dist/theme.css' } } }]) {
			const list = await readTokens(memoryReads({ 'package.json': JSON.stringify(named), 'dist/theme.css': ':root {\n  --brand: #123456;\n}\n' }));
			expect(find(list, 'css.light.brand')?.value, JSON.stringify(named)).toBe('#123456');
		}
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
		const list = await readTokens(styledLibrary({ 'tokens/base.tokens.json': TOKENS }));
		expect(list.source).toBe('token files');
		expect(find(list, 'color.red.500')).toMatchObject({
			kind: 'color',
			category: 'Color',
			group: 'Color',
			set: 'color.red',
			name: '500',
			value: '#ff0000',
		});
		expect(find(list, 'spacing.sm')).toMatchObject({ kind: 'dimension', category: 'Spacing', value: '4px' });
		expect(find(list, 'radius.md')).toMatchObject({ kind: 'dimension', category: 'Shape', value: '6px' });
	});

	it('put the tokens that name another before the raw ones they name', async () => {
		const list = await readTokens(styledLibrary({ 'tokens/base.tokens.json': TOKENS }));
		const colors = list.tokens.filter((t) => t.category === 'Color').map((t) => t.path);
		expect(colors).toEqual(['color.brand', 'color.red.500']);
	});

	it('follow a reference to the token it names', async () => {
		const list = await readTokens(styledLibrary({ 'tokens/base.tokens.json': TOKENS }));
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
				gradient: { sky: { $type: 'gradient', $value: [] } },
			},
			null,
			2,
		);
		const list = await readTokens(styledLibrary({ 'tokens/type.tokens.json': type }));
		const typography = list.tokens
			.filter((t) => t.category === 'Typography')
			.map(({ path, kind, group, set, name, value }) => ({ path, kind, group, set, name, value }));
		expect(typography).toEqual([
			{ path: 'font.family.sans', kind: 'font', group: 'Family', set: 'font.family', name: 'sans', value: 'Inter, sans-serif' },
			{ path: 'font.weight.bold', kind: 'font', group: 'Weight', set: 'font.weight', name: 'bold', value: '700' },
			{ path: 'font.size.body', kind: 'font', group: 'Size', set: 'font.size', name: 'body', value: '16px' },
			{ path: 'heading.h1.fontFamily', kind: 'font', group: 'Family', set: 'heading.h1', name: 'fontFamily', value: 'Inter, sans-serif' },
			{ path: 'heading.h1.fontSize', kind: 'font', group: 'Size', set: 'heading.h1', name: 'fontSize', value: '32px' },
			{ path: 'heading.h1.fontWeight', kind: 'font', group: 'Weight', set: 'heading.h1', name: 'fontWeight', value: '700' },
			{ path: 'heading.h1.lineHeight', kind: 'font', group: 'Line height', set: 'heading.h1', name: 'lineHeight', value: '1.2' },
		]);
		expect(list.tokens.map((t) => t.path)).not.toContain('gradient.sky');
	});

	it('read a shadow, or several on one token, as the box shadow they draw, following a color it names', async () => {
		const shadows = JSON.stringify(
			{
				color: { black: { $type: 'color', $value: '#000000' } },
				shadow: {
					$type: 'shadow',
					sm: { $value: { color: '{color.black}', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' } },
					md: {
						$value: [
							{ color: '#00000033', offsetX: { value: 0, unit: 'px' }, offsetY: '4px', blur: '6px', spread: '-1px' },
							{ color: '#0000001a', offsetX: '0px', offsetY: '2px', blur: '4px', spread: '-2px', inset: true },
						],
					},
					broken: { $value: { color: '#000000', offsetX: '0px' } },
					partly: { $value: [{ color: '#000000', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' }, { color: '#000000' }] },
				},
			},
			null,
			2,
		);
		const list = await readTokens(styledLibrary({ 'tokens/shadow.tokens.json': shadows }));
		expect(find(list, 'shadow.sm')).toMatchObject({
			kind: 'shadow',
			category: 'Elevation',
			group: 'Shadows',
			set: 'shadow',
			name: 'sm',
			value: '0px 1px 2px 0px #000000',
		});
		expect(find(list, 'shadow.md')?.value).toBe('0px 4px 6px -1px #00000033, inset 0px 2px 4px -2px #0000001a');
		expect(find(list, 'shadow.broken')).toBeUndefined();
		expect(list.problems.map((p) => p.reason)).toContain(
			'shadow.broken is not a shadow that can be read: it needs a color, offsets, a blur and a spread',
		);
		// Nor half of one: a token of several shadows is drawn whole or not at all, never as the part that could be read.
		expect(find(list, 'shadow.partly')).toBeUndefined();
		expect(list.problems.map((p) => p.reason)).toContain(
			'shadow.partly is not a shadow that can be read: it needs a color, offsets, a blur and a spread',
		);
	});

	it('read motion, breakpoints and border widths: a duration, a cubic Bézier, and lengths named for them', async () => {
		const more = JSON.stringify(
			{
				motion: {
					fast: { $type: 'duration', $value: '100ms' },
					slow: { $type: 'duration', $value: { value: 400, unit: 'ms' } },
					out: { $type: 'cubicBezier', $value: [0, 0, 0.2, 1] },
					wrong: { $type: 'cubicBezier', $value: [0, 0] },
				},
				breakpoint: { md: { $type: 'dimension', $value: '900px' } },
				border: { width: { thin: { $type: 'dimension', $value: '1px' } } },
			},
			null,
			2,
		);
		const list = await readTokens(styledLibrary({ 'tokens/more.tokens.json': more }));
		expect(find(list, 'motion.fast')).toMatchObject({
			kind: 'duration',
			category: 'Motion',
			group: 'Duration',
			set: 'motion',
			name: 'fast',
			value: '100ms',
		});
		expect(find(list, 'motion.slow')?.value).toBe('400ms');
		expect(find(list, 'motion.out')).toMatchObject({ kind: 'easing', category: 'Motion', group: 'Easing', value: 'cubic-bezier(0, 0, 0.2, 1)' });
		expect(find(list, 'motion.wrong')).toBeUndefined();
		expect(list.problems.map((p) => p.reason)).toContain('motion.wrong is not a duration or an easing that can be read');
		expect(find(list, 'breakpoint.md')).toMatchObject({ kind: 'dimension', category: 'Breakpoints', value: '900px' });
		expect(find(list, 'border.width.thin')).toMatchObject({ kind: 'dimension', category: 'Borders', value: '1px' });
	});

	it('read the standard’s border as its width, and its transition as its duration and its easing', async () => {
		const more = JSON.stringify(
			{
				line: { thin: { $type: 'border', $value: { color: '#000000', width: '1px', style: 'solid' } } },
				ease: { out: { $type: 'cubicBezier', $value: [0, 0, 0.2, 1] } },
				move: { quick: { $type: 'transition', $value: { duration: '200ms', delay: '0ms', timingFunction: '{ease.out}' } } },
			},
			null,
			2,
		);
		const list = await readTokens(styledLibrary({ 'tokens/more.tokens.json': more }));
		expect(find(list, 'line.thin')).toMatchObject({ kind: 'dimension', category: 'Borders', value: '1px' });
		expect(find(list, 'move.quick.duration')).toMatchObject({
			kind: 'duration',
			category: 'Motion',
			group: 'Duration',
			set: 'move.quick',
			value: '200ms',
		});
		expect(find(list, 'move.quick.timingFunction')).toMatchObject({
			kind: 'easing',
			category: 'Motion',
			group: 'Easing',
			value: 'cubic-bezier(0, 0, 0.2, 1)',
		});
	});

	it('read a Tokens Studio file, as Figma’s plugin writes one: value and type with no $, by its own names for the types', async () => {
		const studio = JSON.stringify(
			{
				global: {
					colors: { blue: { value: '#0000ff', type: 'color' } },
					size: { sm: { value: '4px', type: 'spacing' } },
					rounding: { md: { value: '6px', type: 'borderRadius' }, lg: { value: '8', type: 'borderRadius' } },
					stroke: { thin: { value: '1px', type: 'borderWidth' } },
					families: { body: { value: 'Inter', type: 'fontFamilies' } },
					weights: { bold: { value: '700', type: 'fontWeights' } },
					leading: { tight: { value: '1.2', type: 'lineHeights' } },
					scale: { md: { value: '16px', type: 'fontSizes' } },
					elevation: {
						sm: { value: { x: '0', y: '1', blur: '2', spread: '0', color: '{global.colors.blue}', type: 'innerShadow' }, type: 'boxShadow' },
					},
				},
			},
			null,
			2,
		);
		const list = await readTokens(styledLibrary({ 'tokens.json': studio }));
		const of = (path: string) => {
			const t = find(list, path);
			return t && { kind: t.kind, category: t.category, value: t.value };
		};
		expect(of('global.colors.blue')).toEqual({ kind: 'color', category: 'Color', value: '#0000ff' });
		expect(of('global.size.sm')).toEqual({ kind: 'dimension', category: 'Spacing', value: '4px' });
		expect(of('global.rounding.md')).toEqual({ kind: 'dimension', category: 'Shape', value: '6px' });
		// A length with no unit, as Tokens Studio writes one, is in pixels.
		expect(of('global.rounding.lg')).toEqual({ kind: 'dimension', category: 'Shape', value: '8px' });
		expect(of('global.stroke.thin')).toEqual({ kind: 'dimension', category: 'Borders', value: '1px' });
		expect(of('global.families.body')).toEqual({ kind: 'font', category: 'Typography', value: 'Inter' });
		expect(find(list, 'global.weights.bold')?.group).toBe('Weight');
		expect(find(list, 'global.leading.tight')?.group).toBe('Line height');
		expect(find(list, 'global.scale.md')?.group).toBe('Size');
		// Its shadow's lengths are written without units, which are pixels, and an inner shadow is an inset one.
		expect(of('global.elevation.sm')).toEqual({ kind: 'shadow', category: 'Elevation', value: 'inset 0px 1px 2px 0px #0000ff' });
	});

	it('read the one typography token in the shared fixture as its family', async () => {
		const list = await readTokens(styledLibrary({ 'tokens/base.tokens.json': TOKENS }));
		expect(find(list, 'font.body.fontFamily')).toMatchObject({ kind: 'font', category: 'Typography', group: 'Family', value: 'Inter' });
	});

	it('name a file that is not JSON, and read the others', async () => {
		const list = await readTokens(styledLibrary({ 'tokens/base.tokens.json': TOKENS, 'tokens/broken.tokens.json': '{ not json' }));
		expect(find(list, 'color.red.500')).toBeDefined();
		expect(list.problems).toEqual([{ file: 'tokens/broken.tokens.json', reason: expect.stringContaining('not JSON') }]);
	});
});

describe('the order they are tried in', () => {
	it('takes the first way that finds tokens, theme files first, so one library is never read two ways at once', async () => {
		const list = await readTokens(
			styledLibrary({
				'src/colors/tones.ts': "export const blue = {\n  50: '#0000FF',\n  40: '#0000AA',\n};\n",
				'src/styles/globals.css': ':root {\n  --primary: #ff0000;\n}\n',
			}),
		);
		expect(list.source).toBe('theme files');
		expect(list.tokens.some((t) => t.path.startsWith('css.'))).toBe(false);
	});
});

describe('token scripts: a script named for its tokens, exporting objects of plain values', () => {
	const FILE = 'src/theme/design-tokens.ts';
	const TEXT = `import { mix } from './mix';

export const scales = {
  blue: {
    100: '#E8F0FF',
    500: '#2563EB',
  },
  slate: {
    900: '#0F172A',
  },
};

export const tokens = {
  colors: {
    ...scales,
    light: {
      primary: { main: scales.blue[500], text: '#FFFFFF' },
    },
    dark: {
      primary: { main: scales.blue[100], text: scales.slate[900] },
    },
    overlay: mix('#000000', 0.5),
  },
  spacing: { sm: 4, md: 8 },
  radius: { md: 12 },
  typography: { fontFamily: '"Inter", sans-serif', fontSize: { body: 14 }, fontWeight: { bold: 700 } },
  motion: { duration: { fast: 100 }, easing: { out: 'cubic-bezier(0, 0, 0.2, 1)' } },
  shadows: { sm: '0 1px 2px rgb(0 0 0 / 0.1)' },
  zIndex: { modal: 50 },
  indicators: { thickness: '3px' },
};
`;
	const read = (files: Record<string, string> = { [FILE]: TEXT }) => readTokens(memoryReads(files));

	it('reads each value as the primitive its value and its path say: scales, roles by mode, lengths, type, motion, shadows', async () => {
		const list = await read();
		expect(list.source).toBe('token scripts');
		expect(find(list, 'scales.blue.500')).toMatchObject({ kind: 'color', group: 'Light', set: 'blue', name: '500', value: '#2563EB' });
		expect(find(list, 'tokens.colors.light.primary.main')).toMatchObject({
			group: 'Light',
			set: 'primary',
			value: '#2563EB',
			ref: { path: 'scales.blue.500' },
		});
		expect(find(list, 'tokens.colors.dark.primary.main')).toMatchObject({
			group: 'Dark',
			set: 'primary',
			value: '#E8F0FF',
			ref: { path: 'scales.blue.100' },
		});
		// Numbers are pixels for a length, as a theme means them, and milliseconds for a duration.
		expect(find(list, 'tokens.spacing.sm')).toMatchObject({ kind: 'dimension', category: 'Spacing', value: '4px' });
		expect(find(list, 'tokens.radius.md')).toMatchObject({ category: 'Shape', value: '12px' });
		expect(find(list, 'tokens.typography.fontSize.body')).toMatchObject({ kind: 'font', group: 'Size', value: '14px' });
		expect(find(list, 'tokens.typography.fontFamily')).toMatchObject({ group: 'Family', value: '"Inter", sans-serif' });
		expect(find(list, 'tokens.motion.duration.fast')).toMatchObject({ kind: 'duration', value: '100ms' });
		expect(find(list, 'tokens.motion.easing.out')).toMatchObject({ kind: 'easing' });
		expect(find(list, 'tokens.shadows.sm')).toMatchObject({ kind: 'shadow' });
		// The roles that point at a step before the steps, which are the primitives.
		const colors = list.tokens.filter((t) => t.kind === 'color').map((t) => t.path);
		expect(colors.indexOf('tokens.colors.light.primary.main')).toBeLessThan(colors.indexOf('scales.blue.500'));
	});

	it('reads a scale spread in as the same tokens, once, and follows a pointer through it', async () => {
		const list = await read({ [FILE]: TEXT.replace("main: scales.blue[500], text: '#FFFFFF'", "main: tokens.colors.blue[500], text: '#FFFFFF'") });
		expect(list.tokens.filter((t) => t.value === '#2563EB' && t.ref === undefined).map((t) => t.path)).toEqual(['scales.blue.500']);
		expect(find(list, 'tokens.colors.light.primary.main')?.ref?.path).toBe('scales.blue.500');
	});

	it('says a value worked out by code, never guesses one, and leaves out a value no primitive has a place for', async () => {
		const list = await read();
		expect(list.problems).toEqual([
			expect.objectContaining({ file: FILE, reason: expect.stringMatching(/tokens\.colors\.overlay is mix\(.*worked out by code/) }),
		]);
		expect(find(list, 'tokens.colors.overlay')).toBeUndefined();
		expect(find(list, 'tokens.zIndex.modal')).toBeUndefined();
		expect(find(list, 'tokens.indicators.thickness')).toBeUndefined();
	});

	it('follows a pointer into an object the file keeps to itself, which is no token, and says why one worked out by code is not read', async () => {
		const text = `const shades = {\n  dim: mix('#000000', 0.5),\n  ink: '#111111',\n};\n\nexport const tokens = {\n  colors: { light: { overlay: shades.dim, text: shades.ink } },\n};\n`;
		const list = await read({ [FILE]: text });
		expect(find(list, 'tokens.colors.light.text')).toMatchObject({ value: '#111111' });
		expect(find(list, 'tokens.colors.light.text')?.ref).toBeUndefined();
		expect(list.tokens.map((t) => t.path)).toEqual(['tokens.colors.light.text']);
		expect(list.problems.map((p) => p.reason)).toEqual([
			"tokens.colors.light.overlay points at shades.dim, which is worked out by code (mix('#000000', 0.5)), so it is not read",
		]);
	});

	it('reads only a script named for its tokens, never an object that only looks like them', async () => {
		expect((await read({ 'src/config.ts': TEXT })).source).not.toBe('token scripts');
		for (const name of ['src/tokens.ts', 'src/theme.tokens.ts', 'lib/designTokens/tokens.js'])
			expect((await read({ [name]: TEXT })).source, name).toBe('token scripts');
	});

	it('writes a change in place, in the shape it had: a step keeps its quotes, a length its number, a role its pointer', async () => {
		const reads = memoryReads({ [FILE]: TEXT });
		const written = await editedFiles(reads, [
			{ path: 'scales.blue.500', value: '#1D4ED8' },
			{ path: 'tokens.spacing.md', value: '10px' },
			{ path: 'tokens.colors.dark.primary.main', ref: 'scales.slate.900' },
		]);
		const text = written.get(FILE) as string;
		expect(text).toContain("500: '#1D4ED8',");
		expect(text).toContain('md: 10 }');
		expect(text).toContain('main: scales.slate[900]');
		expect(text.split('\n').filter((line, i) => line !== TEXT.split('\n')[i])).toHaveLength(3);
	});

	it('refuses a length a number cannot be, rather than write it some other way', async () => {
		await expect(editedFiles(memoryReads({ [FILE]: TEXT }), [{ path: 'tokens.spacing.md', value: '1rem' }])).rejects.toThrow(/written as a number/);
	});
});
