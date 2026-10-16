import { describe, expect, it } from 'vitest';
import { readTokens } from '../src/main/services/designTokens';
import { channelsOf, hexOfChannels } from '../src/main/services/tokens/cssVariables';
import { memoryReads } from './fixtures';

/**
 * The other ways a library keeps its tokens (decision 18), behind the same list as FUI's theme files: CSS variables (a
 * shadcn or Tailwind design system), and design token files in the standard JSON format. Against fixtures.
 */

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
		const list = await readTokens(memoryReads({ 'src/styles/globals.css': css }));
		expect(list.tokens.map((t) => t.path)).toEqual(['css.light.primary', 'css.light.color-red-500', 'css.light.color-red-600']);
	});

	it('are read as tokens when the library has no theme files, each mode from its own block', async () => {
		const list = await readTokens(memoryReads({ 'src/styles/globals.css': CSS }));
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
		const list = await readTokens(memoryReads({ 'src/styles/globals.css': CSS }));
		expect(find(list, 'css.dark.primary')?.value).toBe('#333333');
	});

	it('put a radius on Shape, spacing on Spacing, a font size on Typography, and leave out what is none of these', async () => {
		const list = await readTokens(memoryReads({ 'src/styles/globals.css': CSS }));
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
		const list = await readTokens(memoryReads({ 'src/app.css': css }));
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
		const list = await readTokens(memoryReads({ 'src/app.css': css }));
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
		// A color named for a shadow is a color.
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
		const list = await readTokens(memoryReads({ 'src/app.css': css }));
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
		// A color named for a border is a color.
		expect(find(list, 'css.light.border')).toMatchObject({ kind: 'color', category: 'Color' });
	});

	it('read shadcn’s colors written as bare HSL channels, as the color they draw, in each mode and through a pointer', async () => {
		const css = ':root {\n  --primary: 222.2 47.4% 11.2%;\n  --ring: var(--primary);\n}\n.dark {\n  --primary: 210 40% 98%;\n}\n';
		const list = await readTokens(memoryReads({ 'src/globals.css': css }));
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

	it('group a scale of steps into one set: Tailwind’s --color-red-500 is step 500 of color-red', async () => {
		const list = await readTokens(memoryReads({ 'src/styles/globals.css': CSS }));
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
		const list = await readTokens(memoryReads({ 'src/theme.css': css }));
		expect(list.tokens.map((t) => [t.path, t.value])).toEqual([
			['css.light.brand', '#108062'],
			['css.light.surface', '#ffffff'],
			['css.dark.surface', '#111111'],
		]);
	});
});

describe('CSS variables a stylesheet imports (Phase 5.5)', () => {
	/** A package of variables, as Tailwind 4's theme is one: its stylesheet named by its exports, its theme nested in layers. */
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
		const list = await readTokens(memoryReads(LIBRARY));
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
			memoryReads({ 'src/globals.css': "@import './theme.css';\n@import 'not-installed';\n", 'src/theme.css': ':root {\n  --radius: 4px;\n}\n' }),
		);
		expect(list.tokens.map((t) => [t.path, t.source])).toEqual([['css.light.radius', { file: 'src/theme.css', line: 2 }]]);
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
		const list = await readTokens(memoryReads({ 'tokens/base.tokens.json': TOKENS }));
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
		const list = await readTokens(memoryReads({ 'tokens/base.tokens.json': TOKENS }));
		const colors = list.tokens.filter((t) => t.category === 'Color').map((t) => t.path);
		expect(colors).toEqual(['color.brand', 'color.red.500']);
	});

	it('follow a reference to the token it names', async () => {
		const list = await readTokens(memoryReads({ 'tokens/base.tokens.json': TOKENS }));
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
		const list = await readTokens(memoryReads({ 'tokens/type.tokens.json': type }));
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
		// A kind no primitive reads yet is still left out.
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
		const list = await readTokens(memoryReads({ 'tokens/shadow.tokens.json': shadows }));
		expect(find(list, 'shadow.sm')).toMatchObject({
			kind: 'shadow',
			category: 'Elevation',
			group: 'Shadows',
			set: 'shadow',
			name: 'sm',
			value: '0px 1px 2px 0px #000000',
		});
		expect(find(list, 'shadow.md')?.value).toBe('0px 4px 6px -1px #00000033, inset 0px 2px 4px -2px #0000001a');
		// One it cannot draw is named, not guessed.
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
		const list = await readTokens(memoryReads({ 'tokens/more.tokens.json': more }));
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
		const list = await readTokens(memoryReads({ 'tokens/more.tokens.json': more }));
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
		const list = await readTokens(memoryReads({ 'tokens.json': studio }));
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
		const list = await readTokens(memoryReads({ 'tokens/base.tokens.json': TOKENS }));
		expect(find(list, 'font.body.fontFamily')).toMatchObject({ kind: 'font', category: 'Typography', group: 'Family', value: 'Inter' });
	});

	it('name a file that is not JSON, and read the others', async () => {
		const list = await readTokens(memoryReads({ 'tokens/base.tokens.json': TOKENS, 'tokens/broken.tokens.json': '{ not json' }));
		expect(find(list, 'color.red.500')).toBeDefined();
		expect(list.problems).toEqual([{ file: 'tokens/broken.tokens.json', reason: expect.stringContaining('not JSON') }]);
	});
});

describe('the order they are tried in', () => {
	it('takes the first way that finds tokens, theme files first, so one library is never read two ways at once', async () => {
		const list = await readTokens(
			memoryReads({
				'src/colors/tones.ts': "export const blue = {\n  50: '#0000FF',\n  40: '#0000AA',\n};\n",
				'src/styles/globals.css': ':root {\n  --primary: #ff0000;\n}\n',
			}),
		);
		expect(list.source).toBe('theme files');
		expect(list.tokens.some((t) => t.path.startsWith('css.'))).toBe(false);
	});
});
