import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESIGN_SYSTEMS } from '../src/shared/catalog';
import { libraryReads } from '../src/main/services/designLibrary';
import { readTokens } from '../src/main/services/designTokens';
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
	`/** ${name} primitives. */\nexport const ${name} = {\n${steps
		.map(([k, v]) => `  ${k}: '${v}',`)
		.join('\n')}\n};\n`;

const LIBRARY: Record<string, string> = {
	'src/colors/tones/index.ts': "export { pineGreen } from './pineGreen';\nexport { red } from './red';\n",
	'src/colors/tones/pineGreen.ts': tone('pineGreen', [['100', '#FFFFFF'], ['50', '#108062'], ['20', '#18372F']]),
	'src/colors/tones/red.ts': tone('red', [['40', '#BA1A1A'], ['0', '#000000']]),
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
	it('are every family the index exports, each step with its colour, in the file’s order', async () => {
		const list = await readTokens(reads(LIBRARY));
		const tones = list.tokens.filter((t) => t.group === 'Tones');
		expect(tones.map((t) => t.path)).toEqual(['tone.pineGreen.100', 'tone.pineGreen.50', 'tone.pineGreen.20', 'tone.red.40', 'tone.red.0']);
		expect(find(list, 'tone.pineGreen.50')).toEqual({
			path: 'tone.pineGreen.50',
			kind: 'colour',
			category: 'Colour',
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
	it('are each mode’s, pointing at the tone they use, with its colour', async () => {
		const list = await readTokens(reads(LIBRARY));
		expect(find(list, 'palette.light.primary.main')).toEqual({
			path: 'palette.light.primary.main',
			kind: 'colour',
			category: 'Colour',
			group: 'Light',
			set: 'primary',
			name: 'main',
			value: '#108062',
			ref: { tone: 'pineGreen', step: '50' },
			source: { file: 'src/colors/theme/light.ts', line: 9 },
		});
		expect(find(list, 'palette.dark.primary.main')).toMatchObject({ group: 'Dark', value: '#FFFFFF', ref: { tone: 'pineGreen', step: '100' } });
	});

	it('keep a tone’s opacity, written after it', async () => {
		const list = await readTokens(reads(LIBRARY));
		expect(find(list, 'palette.light.primaryBorder.main')).toMatchObject({ value: '#18372F66', ref: { tone: 'pineGreen', step: '20', alpha: '66' } });
	});

	it('include the roles both modes share, read from where they are written', async () => {
		const list = await readTokens(reads(LIBRARY));
		for (const mode of ['light', 'dark']) {
			expect(find(list, `palette.${mode}.priority0.main`)).toMatchObject({ value: '#BA1A1A', source: { file: 'src/colors/theme/shared.ts', line: 5 } });
		}
	});
});

describe('spacing and radius', () => {
	it('are the theme’s, as dimensions in pixels', async () => {
		const list = await readTokens(reads(LIBRARY));
		expect(find(list, 'spacing')).toEqual({ path: 'spacing', kind: 'dimension', category: 'Spacing', group: 'Spacing', set: 'spacing', name: 'base', value: '8px', source: { file: 'src/utils/theme.ts', line: 2 } });
		expect(find(list, 'radius')).toEqual({ path: 'radius', kind: 'dimension', category: 'Shape', group: 'Radius', set: 'radius', name: 'base', value: '8px', source: { file: 'src/utils/theme.ts', line: 5 } });
	});
});

describe('the categories', () => {
	it('say which tab a token belongs on: every colour is Colour, spacing is Spacing, and radius is Shape', async () => {
		const list = await readTokens(reads(LIBRARY));
		const categories = new Map(list.tokens.map((t) => [t.group, t.category]));
		expect([...categories]).toEqual([
			['Tones', 'Colour'],
			['Light', 'Colour'],
			['Dark', 'Colour'],
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
		const list = await readTokens(reads({ ...LIBRARY, 'src/colors/theme/shared.ts': LIBRARY['src/colors/theme/shared.ts']!.replace('red[40]', 'red[45]') }));
		expect(list.problems).toEqual([{ file: 'src/colors/theme/shared.ts', line: 5, reason: expect.stringContaining('red[45]') }]);
		expect(find(list, 'palette.light.priority0.main')).toBeUndefined();
	});

	it('names a step whose colour is not a hex, with what is written, and reads the rest', async () => {
		const list = await readTokens(reads({ ...LIBRARY, 'src/colors/tones/red.ts': tone('red', [['40', '#BA1A1A'], ['0', '000000']]) }));
		expect(find(list, 'tone.red.0')).toBeUndefined();
		expect(find(list, 'tone.red.40')?.value).toBe('#BA1A1A');
		expect(list.problems).toEqual([{ file: 'src/colors/tones/red.ts', line: 4, reason: "red 0 is '000000', not a hex colour, so this step is not read" }]);
	});

	it('names a tone file it cannot find, and reads the others', async () => {
		const files = { ...LIBRARY };
		delete files['src/colors/tones/red.ts'];
		const list = await readTokens(reads(files));
		expect(find(list, 'tone.pineGreen.50')).toBeDefined();
		expect(list.problems[0]).toEqual({ file: 'src/colors/tones/red.ts', reason: expect.stringContaining('could not be read') });
	});
});

describe('a library laid out differently', () => {
	it('gives no tokens, says where it looked, and nothing is guessed', async () => {
		const list = await readTokens(reads({ 'src/index.ts': 'export {};\n' }));
		expect(list).toEqual({ source: null, tokens: [], problems: [], looked: ['src/colors/tones/index.ts'] });
	});

	it('says which way it read them when it does', async () => {
		expect((await readTokens(reads(LIBRARY))).source).toBe('theme files');
	});
});

/** The reader against the real library's `develop`, as the app reads it. Skipped, loudly, when it is not checked out. */
const REAL = '/Users/noah.shrader/Documents/GitHub/flock-react-component-lib';
const FUI = DESIGN_SYSTEMS[0]!;
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
		expect(list.problems.map((p) => p.reason)).toEqual(list.problems.map(() => expect.stringMatching(/not a hex colour/)));
		expect(list.problems.every((p) => p.file.startsWith('src/colors/tones/'))).toBe(true);
		expect(new Set(list.tokens.filter((t) => t.group === 'Tones').map((t) => t.set)).size).toBeGreaterThanOrEqual(11);
		expect(find(list, 'tone.pineGreen.50')?.value).toBe('#108062');
		expect(find(list, 'palette.light.primary.main')).toMatchObject({ value: '#108062', ref: { tone: 'pineGreen', step: '50' } });
		expect(find(list, 'palette.dark.primary.main')?.ref?.tone).toBe('pineGreen');
		expect(find(list, 'palette.light.primaryBorder.main')?.ref?.alpha).toBe('66');
		expect(find(list, 'palette.light.priority0.main')?.source.file).toBe('src/colors/theme/shared.ts');
		expect(find(list, 'spacing')?.value).toBe('8px');
		expect(find(list, 'radius')?.value).toBe('8px');
	});

	it('gives every colour as a hex, every token once', async () => {
		const list = await readTokens(real);
		for (const t of list.tokens.filter((x) => x.kind === 'colour')) expect(t.value, t.path).toMatch(/^#([0-9A-F]{6}|[0-9A-F]{8})$/i);
		expect(new Set(list.tokens.map((t) => t.path)).size).toBe(list.tokens.length);
	});
});
