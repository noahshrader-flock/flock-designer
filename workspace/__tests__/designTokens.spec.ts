import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { designSystemOf } from '../src/shared/catalog';
import { libraryReads } from '../src/main/services/designLibrary';
import { readTokens } from '../src/main/services/designTokens';
import { editedFiles } from '../src/main/services/tokenEdits';
import type { CatalogReads } from '../src/main/services/componentCatalog';

/**
 * T1 of the design system plan: the library's tokens as one list, found and not listed. Read from the library's own theme
 * files as text, never by running them: the tone families its index exports, the palette roles of each mode (each
 * pointing at a tone, sometimes with an opacity), and the theme's spacing and radius. Against fixtures, then the real
 * library.
 */

const reads = (files: Record<string, string>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === undefined) throw new Error(`no ${path}`);
		return text;
	},
});

/** A tone file, its steps in the order given (an object would sort its number keys). */
const tone = (name: string, steps: [string, string][]) =>
	`/** ${name} primitives. */\nexport const ${name} = {\n${steps.map(([k, v]) => `  ${k}: '${v}',`).join('\n')}\n};\n`;

const LIBRARY: Record<string, string> = {
	'src/colors/tones/index.ts': "export { pineGreen } from './pineGreen';\nexport { red } from './red';\n",
	'src/colors/tones/pineGreen.ts': tone('pineGreen', [
		['100', '#FFFFFF'],
		['50', '#108062'],
		['20', '#18372F'],
	]),
	'src/colors/tones/red.ts': tone('red', [
		['40', '#BA1A1A'],
		['0', '#000000'],
	]),
	'src/colors/theme/light.ts': `import { PaletteMode, PaletteOptions } from '@mui/material';
import { pineGreen } from '../tones';
import { sharedPalette } from './shared';

/** Light. */
export const lightPalette = {
  mode: 'light' as PaletteMode,
  primary: {
    main: pineGreen[50],
    contrastText: pineGreen[100],
  },
  primaryBorder: {
    // Translucent: the tone with an opacity.
    main: \`\${pineGreen[20]}66\`,
  },
  ...sharedPalette,
} satisfies PaletteOptions;
`,
	'src/colors/theme/dark.ts': `import { PaletteMode } from '@mui/material';
import { pineGreen } from '../tones';
import { sharedPalette } from './shared';

export const darkPalette = {
  mode: 'dark' as PaletteMode,
  primary: {
    main: pineGreen[100],
  },
  ...sharedPalette,
};
`,
	'src/colors/theme/shared.ts': `import { red } from '../tones';

export const sharedPalette = {
  priority0: {
    main: red[40],
  },
};
`,
	'src/utils/theme.ts': `export const createFSTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
    const spacing = 8;

    const shape: Shape = {
      borderRadius: 8,
    };
    return createTheme({ spacing, shape });
};
`,
};

const find = (list: Awaited<ReturnType<typeof readTokens>>, path: string) => list.tokens.find((t) => t.path === path);

describe('the tones', () => {
	it('are every family the index exports, each step with its color, in the file’s order', async () => {
		const list = await readTokens(reads(LIBRARY));
		const tones = list.tokens.filter((t) => t.group === 'Tones');
		expect(tones.map((t) => t.path)).toEqual(['tone.pineGreen.100', 'tone.pineGreen.50', 'tone.pineGreen.20', 'tone.red.40', 'tone.red.0']);
		expect(find(list, 'tone.pineGreen.50')).toEqual({
			path: 'tone.pineGreen.50',
			kind: 'color',
			category: 'Color',
			group: 'Tones',
			set: 'pineGreen',
			name: '50',
			value: '#108062',
			source: { file: 'src/colors/tones/pineGreen.ts', line: 4 },
		});
	});

	it('include a family added to the library, with nothing listed here', async () => {
		const list = await readTokens(
			reads({
				...LIBRARY,
				'src/colors/tones/index.ts': `${LIBRARY['src/colors/tones/index.ts']}export { coral } from './coral';\n`,
				'src/colors/tones/coral.ts': tone('coral', [['50', '#FF7F50']]),
			}),
		);
		expect(find(list, 'tone.coral.50')?.value).toBe('#FF7F50');
	});
});

describe('the palette roles', () => {
	it('are each mode’s, pointing at the tone they use, with its color', async () => {
		const list = await readTokens(reads(LIBRARY));
		expect(find(list, 'palette.light.primary.main')).toEqual({
			path: 'palette.light.primary.main',
			kind: 'color',
			category: 'Color',
			group: 'Light',
			set: 'primary',
			name: 'main',
			value: '#108062',
			ref: { path: 'tone.pineGreen.50' },
			source: { file: 'src/colors/theme/light.ts', line: 9 },
		});
		expect(find(list, 'palette.dark.primary.main')).toMatchObject({ group: 'Dark', value: '#FFFFFF', ref: { path: 'tone.pineGreen.100' } });
	});

	it('keep a tone’s opacity, written after it', async () => {
		const list = await readTokens(reads(LIBRARY));
		expect(find(list, 'palette.light.primaryBorder.main')).toMatchObject({ value: '#18372F66', ref: { path: 'tone.pineGreen.20', alpha: '66' } });
	});

	it('include the roles both modes share, read from where they are written', async () => {
		const list = await readTokens(reads(LIBRARY));
		for (const mode of ['light', 'dark']) {
			expect(find(list, `palette.${mode}.priority0.main`)).toMatchObject({
				value: '#BA1A1A',
				source: { file: 'src/colors/theme/shared.ts', line: 5 },
			});
		}
	});
});

describe('spacing and radius', () => {
	it('are the theme’s, as dimensions in pixels', async () => {
		const list = await readTokens(reads(LIBRARY));
		expect(find(list, 'spacing')).toEqual({
			path: 'spacing',
			kind: 'dimension',
			category: 'Spacing',
			group: 'Spacing',
			set: 'spacing',
			name: 'base',
			value: '8px',
			source: { file: 'src/utils/theme.ts', line: 2 },
		});
		expect(find(list, 'radius')).toEqual({
			path: 'radius',
			kind: 'dimension',
			category: 'Shape',
			group: 'Radius',
			set: 'radius',
			name: 'base',
			value: '8px',
			source: { file: 'src/utils/theme.ts', line: 5 },
		});
	});
});

describe('typography (R3)', () => {
	const THEME = `export const createFSTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
    const spacing = 8;
    const shape: Shape = { borderRadius: 8 };
    const typography: ThemeOptions['typography'] = {
      fontFamily: '"Inter",sans-serif',
      fontSize: 14,
      fontWeightBold: 700,
      h1: { fontSize: '6rem', fontWeight: 300, lineHeight: 1.167 },
      h2: { fontSize: pxToRem(60) },
    };
    return createTheme({ spacing, shape, typography });
};
`;
	const library = { ...LIBRARY, 'src/utils/theme.ts': THEME };
	const typography = async () =>
		(await readTokens(reads(library))).tokens
			.filter((t) => t.category === 'Typography')
			.map(({ path, kind, group, set, name, value, source }) => ({ path, kind, group, set, name, value, line: source.line }));

	it('is the theme’s typography: its family, its base size in pixels, its weights, and each style’s size, weight and line height', async () => {
		expect(await typography()).toEqual([
			{ path: 'typography.fontFamily', kind: 'font', group: 'Family', set: 'base', name: 'fontFamily', value: '"Inter",sans-serif', line: 5 },
			{ path: 'typography.fontSize', kind: 'font', group: 'Size', set: 'base', name: 'fontSize', value: '14px', line: 6 },
			{ path: 'typography.fontWeightBold', kind: 'font', group: 'Weight', set: 'weight', name: 'bold', value: '700', line: 7 },
			{ path: 'typography.h1.fontSize', kind: 'font', group: 'Size', set: 'h1', name: 'fontSize', value: '6rem', line: 8 },
			{ path: 'typography.h1.fontWeight', kind: 'font', group: 'Weight', set: 'h1', name: 'fontWeight', value: '300', line: 8 },
			{ path: 'typography.h1.lineHeight', kind: 'font', group: 'Line height', set: 'h1', name: 'lineHeight', value: '1.167', line: 8 },
		]);
	});

	it('names a value it cannot read, with its line, and reads the rest', async () => {
		const list = await readTokens(reads(library));
		expect(list.problems).toContainEqual({
			file: 'src/utils/theme.ts',
			line: 9,
			reason: 'typography.h2.fontSize is pxToRem(60), not a value, so it is not read',
		});
	});

	it('is only the family for a theme that sets only that, as Flock’s does', async () => {
		const only = THEME.replace(/fontSize: 14,[\s\S]*?\n    \};/, '};');
		const list = await readTokens(reads({ ...LIBRARY, 'src/utils/theme.ts': only }));
		expect(list.tokens.filter((t) => t.category === 'Typography').map((t) => t.path)).toEqual(['typography.fontFamily']);
	});
});

describe('elevation (R4)', () => {
	const THEME = `export const createFSTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
    const spacing = 8;
    const shape: Shape = { borderRadius: 8 };
    const shadows: Shadows = [
      'none',
      '0px 2px 1px -1px rgba(0,0,0,0.2)',
      "0px 3px 3px -2px rgba(0,0,0,0.2)",
      createShadow(1, 2),
    ];
    return createTheme({ spacing, shape, shadows });
};
`;
	const read = () => readTokens(reads({ ...LIBRARY, 'src/utils/theme.ts': THEME }));

	it('is the theme’s shadows, each at its level, with the first, none, left out', async () => {
		const shadows = (await read()).tokens
			.filter((t) => t.category === 'Elevation')
			.map(({ path, kind, group, set, name, value, source }) => ({ path, kind, group, set, name, value, line: source.line }));
		expect(shadows).toEqual([
			{ path: 'shadows.1', kind: 'shadow', group: 'Shadows', set: 'shadows', name: '1', value: '0px 2px 1px -1px rgba(0,0,0,0.2)', line: 6 },
			{ path: 'shadows.2', kind: 'shadow', group: 'Shadows', set: 'shadows', name: '2', value: '0px 3px 3px -2px rgba(0,0,0,0.2)', line: 7 },
		]);
	});

	it('names a shadow it cannot read, with its line', async () => {
		expect((await read()).problems).toContainEqual({
			file: 'src/utils/theme.ts',
			line: 8,
			reason: 'shadows[3] is createShadow(1, 2), not a value, so it is not read',
		});
	});

	it('is nothing for a theme that sets none, as Flock’s does not', async () => {
		expect((await readTokens(reads(LIBRARY))).tokens.filter((t) => t.category === 'Elevation')).toEqual([]);
	});
});

describe('breakpoints and motion (R5)', () => {
	const THEME = `export const createFSTheme = (mode: 'light' | 'dark' = 'light'): Theme => {
    const spacing = 8;
    const shape: Shape = { borderRadius: 8 };
    const breakpoints: ThemeOptions['breakpoints'] = {
      values: {
        xs: 0,
        md: 900,
        desktopNav: 1050,
      },
    };
    const transitions = {
      duration: { short: 250, complex: theme.duration },
      easing: { easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)' },
    };
    return createTheme({ spacing, shape, breakpoints, transitions });
};
`;
	const read = () => readTokens(reads({ ...LIBRARY, 'src/utils/theme.ts': THEME }));
	const of = async (category: string) =>
		(await read()).tokens
			.filter((t) => t.category === category)
			.map(({ path, kind, group, set, name, value, source }) => ({ path, kind, group, set, name, value, line: source.line }));

	it('is the theme’s breakpoints, each in pixels, the custom ones as well as MUI’s', async () => {
		expect(await of('Breakpoints')).toEqual([
			{ path: 'breakpoints.xs', kind: 'dimension', group: 'Breakpoints', set: 'breakpoints', name: 'xs', value: '0px', line: 6 },
			{ path: 'breakpoints.md', kind: 'dimension', group: 'Breakpoints', set: 'breakpoints', name: 'md', value: '900px', line: 7 },
			{ path: 'breakpoints.desktopNav', kind: 'dimension', group: 'Breakpoints', set: 'breakpoints', name: 'desktopNav', value: '1050px', line: 8 },
		]);
	});

	it('is the theme’s transitions: each duration in milliseconds, and each easing', async () => {
		expect(await of('Motion')).toEqual([
			{ path: 'transitions.duration.short', kind: 'duration', group: 'Duration', set: 'duration', name: 'short', value: '250ms', line: 12 },
			{
				path: 'transitions.easing.easeOut',
				kind: 'easing',
				group: 'Easing',
				set: 'easing',
				name: 'easeOut',
				value: 'cubic-bezier(0.0, 0, 0.2, 1)',
				line: 13,
			},
		]);
		expect((await read()).problems).toContainEqual({
			file: 'src/utils/theme.ts',
			line: 12,
			reason: 'transitions.duration.complex is theme.duration, not a value, so it is not read',
		});
	});

	it('is read from where the theme sets them, not from a style that uses them first', async () => {
		const styled = THEME.replace(
			'    const breakpoints',
			"    const card = { [theme.breakpoints.up('md')]: { padding: 8 } };\n    const breakpoints",
		);
		const list = await readTokens(reads({ ...LIBRARY, 'src/utils/theme.ts': styled }));
		expect(list.tokens.filter((t) => t.category === 'Breakpoints').map((t) => t.name)).toEqual(['xs', 'md', 'desktopNav']);
	});

	it('is nothing for a theme that sets neither', async () => {
		const list = await readTokens(reads(LIBRARY));
		expect(list.tokens.filter((t) => t.category === 'Breakpoints' || t.category === 'Motion')).toEqual([]);
	});
});

describe('the categories', () => {
	it('say which tab a token belongs on: every color is Color, spacing is Spacing, and radius is Shape', async () => {
		const list = await readTokens(reads(LIBRARY));
		const categories = new Map(list.tokens.map((t) => [t.group, t.category]));
		// The semantic ones first (what a color is for, in each mode), the raw tones they point at last.
		expect([...categories]).toEqual([
			['Light', 'Color'],
			['Dark', 'Color'],
			['Tones', 'Color'],
			['Spacing', 'Spacing'],
			['Radius', 'Shape'],
		]);
	});
});

describe('what it cannot read', () => {
	it('is named, with its file and line, and the rest still read', async () => {
		const list = await readTokens(
			reads({
				...LIBRARY,
				'src/colors/theme/light.ts': LIBRARY['src/colors/theme/light.ts']!.replace('main: pineGreen[50],', 'main: darken(pineGreen[50]),'),
			}),
		);
		expect(find(list, 'palette.light.primary.main')).toBeUndefined();
		expect(find(list, 'palette.light.primary.contrastText')?.value).toBe('#FFFFFF');
		expect(list.problems).toEqual([{ file: 'src/colors/theme/light.ts', line: 9, reason: expect.stringContaining('darken(pineGreen[50])') }]);
	});

	it('names a role that points at a tone or step the library does not have, once, though both modes share it', async () => {
		const list = await readTokens(
			reads({ ...LIBRARY, 'src/colors/theme/shared.ts': LIBRARY['src/colors/theme/shared.ts']!.replace('red[40]', 'red[45]') }),
		);
		expect(list.problems).toEqual([{ file: 'src/colors/theme/shared.ts', line: 5, reason: expect.stringContaining('red[45]') }]);
		expect(find(list, 'palette.light.priority0.main')).toBeUndefined();
	});

	it('names a step whose color is not a hex, with what is written, and reads the rest', async () => {
		const list = await readTokens(
			reads({
				...LIBRARY,
				'src/colors/tones/red.ts': tone('red', [
					['40', '#BA1A1A'],
					['0', '000000'],
				]),
			}),
		);
		expect(find(list, 'tone.red.0')).toBeUndefined();
		expect(find(list, 'tone.red.40')?.value).toBe('#BA1A1A');
		expect(list.problems).toEqual([
			{ file: 'src/colors/tones/red.ts', line: 4, reason: "red 0 is '000000', not a hex color, so this step is not read" },
		]);
	});
});

describe('a library laid out differently', () => {
	it('finds tone families, palettes and the theme wherever the library keeps them, by their shape and not their folder', async () => {
		const list = await readTokens(
			reads({
				'src/tokens/brand.ts': tone('brand', [
					['50', '#336699'],
					['10', '#001122'],
				]),
				'src/tokens/modes.ts': "export const light = {\n  mode: 'light',\n  primary: { main: brand[50] },\n};\n",
				'src/theme/index.ts': 'export const theme = createTheme({\n  spacing: 4,\n  shape: { borderRadius: 6 },\n});\n',
			}),
		);
		expect(list.source).toBe('theme files');
		expect(find(list, 'tone.brand.50')?.value).toBe('#336699');
		expect(find(list, 'palette.light.primary.main')).toMatchObject({ value: '#336699', ref: { path: 'tone.brand.50' } });
		expect(find(list, 'spacing')?.value).toBe('4px');
		expect(find(list, 'radius')?.value).toBe('6px');
	});

	it('reads a MUI theme written all in createTheme, with no tone files: its palette, typography as a function, its breakpoints', async () => {
		const theme = `import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#1976D2', contrastText: '#FFFFFF' },
  },
  typography: (palette) => ({
    fontFamily: 'Roboto, sans-serif',
  }),
  breakpoints: { values: { sm: 600 } },
  shape: { borderRadius: 4 },
});
`;
		const list = await readTokens(reads({ 'src/theme.ts': theme }));
		expect(list.source).toBe('theme files');
		expect(find(list, 'palette.light.primary.main')).toMatchObject({
			kind: 'color',
			category: 'Color',
			group: 'Light',
			value: '#1976D2',
			source: { line: 5 },
		});
		expect(find(list, 'typography.fontFamily')).toMatchObject({ category: 'Typography', value: 'Roboto, sans-serif' });
		expect(find(list, 'breakpoints.sm')).toMatchObject({ category: 'Breakpoints', value: '600px' });
		expect(find(list, 'radius')?.value).toBe('4px');
	});

	it('reads a MUI theme whose palette is worked out when it runs for what it writes as values: its typography', async () => {
		const theme = "export const theme = createTheme({\n  palette: paletteFor(mode),\n  typography: { fontFamily: 'Public Sans' },\n});\n";
		const list = await readTokens(reads({ 'src/theme/create-theme.ts': theme }));
		expect(list.source).toBe('theme files');
		expect(list.tokens.map((t) => t.path)).toEqual(['typography.fontFamily']);
	});

	it('leaves alone what is neither tones nor a palette, and does not call it a problem', async () => {
		const list = await readTokens(
			reads({ ...LIBRARY, 'src/colors/customPalette.ts': "export const customPalette = { brandName: 'Flock', shades: 3 };\n" }),
		);
		expect(list.problems).toEqual([]);
		expect(list.tokens.some((t) => t.source.file === 'src/colors/customPalette.ts')).toBe(false);
	});

	it('does not read tests, stories or built files as the library’s tokens', async () => {
		const list = await readTokens(
			reads({
				...LIBRARY,
				'src/colors/tones/pineGreen.stories.tsx': tone('storyGreen', [['50', '#00FF00']]),
				'dist/colors.js': tone('builtGreen', [['50', '#00FF00']]),
			}),
		);
		expect(list.tokens.some((t) => t.set === 'storyGreen' || t.set === 'builtGreen')).toBe(false);
	});

	it('gives no tokens, says what it looked for, and nothing is guessed', async () => {
		const list = await readTokens(reads({ 'src/index.ts': 'export {};\n' }));
		expect(list).toEqual({ source: null, tokens: [], problems: [], looked: ['theme files', 'CSS variables', 'token files'] });
	});

	it('says which way it read them when it does', async () => {
		expect((await readTokens(reads(LIBRARY))).source).toBe('theme files');
	});
});

/** The reader against the real library's `develop`, as the app reads it. Skipped, loudly, when it is not checked out. */
const REAL = '/Users/noah.shrader/Documents/GitHub/flock-react-component-lib';
const FUI = designSystemOf({ repository: 'flocksafety/flock-react-component-lib', branch: 'develop' });
const hasBranch = (() => {
	if (!existsSync(`${REAL}/.git`)) return false;
	try {
		execFileSync('git', ['-C', REAL, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${FUI.branch}`]);
		return true;
	} catch {
		return false;
	}
})();

describe.skipIf(!hasBranch)('against the real library', () => {
	const real = libraryReads(REAL, `refs/remotes/origin/${FUI.branch}`);

	it('reads every tone, both palettes, spacing and radius; all it cannot read is a tone step written wrong in the library', async () => {
		const list = await readTokens(real);
		// On 2026-10-09, three of neutral's steps: 94 is '@ECEEEB', 70 'AEB0B2' and 4 '0B0F0D'. The library's to fix; never guessed here.
		expect(list.problems.map((p) => p.reason)).toEqual(list.problems.map(() => expect.stringMatching(/not a hex color/)));
		expect(list.problems.every((p) => p.file.startsWith('src/colors/tones/'))).toBe(true);
		expect(new Set(list.tokens.filter((t) => t.group === 'Tones').map((t) => t.set)).size).toBeGreaterThanOrEqual(11);
		expect(find(list, 'tone.pineGreen.50')?.value).toBe('#108062');
		expect(find(list, 'palette.light.primary.main')).toMatchObject({ value: '#108062', ref: { path: 'tone.pineGreen.50' } });
		expect(find(list, 'palette.dark.primary.main')?.ref?.path).toMatch(/^tone\.pineGreen\./);
		expect(find(list, 'palette.light.primaryBorder.main')?.ref?.alpha).toBe('66');
		expect(find(list, 'palette.light.priority0.main')?.source.file).toBe('src/colors/theme/shared.ts');
		expect(find(list, 'spacing')?.value).toBe('8px');
		expect(find(list, 'radius')?.value).toBe('8px');
	});

	it('puts the semantic colors, light and dark, before the raw tones they are made from', async () => {
		const list = await readTokens(real);
		const groups = [...new Set(list.tokens.filter((t) => t.category === 'Color').map((t) => t.group))];
		expect(groups).toEqual(['Light', 'Dark', 'Tones']);
	});

	it('gives every color as a hex, every token once', async () => {
		const list = await readTokens(real);
		for (const t of list.tokens.filter((x) => x.kind === 'color')) expect(t.value, t.path).toMatch(/^#([0-9A-F]{6}|[0-9A-F]{8})$/i);
		expect(new Set(list.tokens.map((t) => t.path)).size).toBe(list.tokens.length);
	});
});

describe.skipIf(!hasBranch)('changing the real library’s tokens (T3)', () => {
	it('writes a tone, a role pointed at another step, a role’s own color, and the spacing, each reading back exactly', async () => {
		const real = libraryReads(REAL, `refs/remotes/origin/${FUI.branch}`);
		const written = await editedFiles(real, [
			{ path: 'tone.pineGreen.50', value: '#0A6B52' },
			{ path: 'palette.dark.primary.main', ref: 'tone.pineGreen.60' },
			{ path: 'palette.light.priority0.main', value: '#123456' },
			{ path: 'spacing', value: '6px' },
		]);
		// The tone, the dark palette, the palette both modes share (so Light and Dark priority0 change together), the theme.
		expect([...written.keys()]).toEqual(
			expect.arrayContaining(['src/colors/tones/pineGreen.ts', 'src/colors/theme/dark.ts', 'src/colors/theme/shared.ts']),
		);
		expect(written.size).toBe(4);
		// Only the token's own text changes: one line in each file.
		for (const [file, text] of written) {
			const before = (await real.readFile(file)).split('\n');
			expect(text.split('\n').filter((line, i) => line !== before[i])).toHaveLength(1);
		}
	});
});

describe.skipIf(!hasBranch)('reading the real library’s files exactly', () => {
	it('gives each file as committed, white space at its ends and all, read alone or with the stories', async () => {
		const real = libraryReads(REAL, `refs/remotes/origin/${FUI.branch}`);
		const files = await real.listFiles('');
		const story = files.find((f) => /FSButton\.stories\.tsx$/.test(f)) as string;
		for (const path of ['src/colors/tones/neutral.ts', story]) {
			const exact = execFileSync('git', ['-C', REAL, 'show', `refs/remotes/origin/${FUI.branch}:${path}`], { encoding: 'utf8' });
			expect(await real.readFile(path)).toBe(exact);
		}
	});
});
