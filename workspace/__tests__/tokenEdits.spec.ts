import { describe, expect, it } from 'vitest';
import { readTokens } from '../src/core/services/designSystem/designTokens';
import { editProblem, editedFiles, tokenEditsOf } from '../src/core/services/designSystem/tokenEdits';
import type { DesignToken, TokenEdit } from '../src/shared/contract';
import { contrastPartner, contrastRatio, fitsKind, pointingAt, sameChange, withEdits } from '../src/shared/tokens';
import { CONTRAST_TEXT } from '../src/shared/wcag';
import { memoryReads } from './fixtures';

/**
 * A change to the library's tokens (T3 of the design system plan, decisions 19, 26 and 27): what it does to the list,
 * worked out once; and how it is written into the library's files, by each source in its own way, read back and checked
 * against that. Against fixtures of each way a library keeps its tokens.
 */

/** A theme as FUI keeps one: tone files, a palette pointing at them (one role with an opacity), the spacing and radius. */
const THEME = {
	'src/colors/tones/pineGreen.ts': "export const pineGreen = {\n  100: '#FFFFFF',\n  50: '#108062',\n  20: '#18372F',\n};\n",
	'src/colors/theme/light.ts': `import { pineGreen } from '../tones';

export const lightPalette = {
  mode: 'light',
  primary: { main: pineGreen[50], contrastText: pineGreen[100] }, // the brand
  primaryBorder: {
    main: \`\${pineGreen[20]}66\`,
  },
  surface: {
    main: '#FAFAFA',
  },
};
`,
	'src/utils/theme.ts': 'const spacing = 8;\nexport const theme = createTheme({\n  shape: { borderRadius: 4 },\n});\n',
};

/** The files a change writes, and the tokens as the library would then read. */
const change = async (files: Record<string, string>, edits: TokenEdit[]) => {
	const written = await editedFiles(memoryReads(files), edits);
	const after = await readTokens(memoryReads({ ...files, ...Object.fromEntries(written) }));
	return { written, find: (path: string) => after.tokens.find((t) => t.path === path) as DesignToken };
};

describe('what a change does to the list', () => {
	const tone = (step: string, value: string): DesignToken => ({
		path: `tone.g.${step}`,
		kind: 'color',
		category: 'Color',
		group: 'Tones',
		set: 'g',
		name: step,
		value,
		source: { file: 'g.ts', line: 1 },
	});
	const role = (path: string, ref: string, value: string, alpha?: string): DesignToken => ({
		...tone('x', value),
		path,
		group: 'Light',
		set: 'primary',
		name: path.split('.').pop() as string,
		ref: alpha ? { path: ref, alpha } : { path: ref },
	});
	const TOKENS = [
		tone('50', '#108062'),
		tone('60', '#20A080'),
		role('palette.light.primary.main', 'tone.g.50', '#108062'),
		role('palette.light.primary.border', 'tone.g.50', '#10806266', '66'),
	];

	it('moves every token that points at a changed one, keeping each one’s opacity', () => {
		const after = withEdits(TOKENS, [{ path: 'tone.g.50', value: '#000000' }]);
		expect(after.map((t) => t.value)).toEqual(['#000000', '#20A080', '#000000', '#00000066']);
	});

	it('points a token elsewhere and keeps the link, and a value of its own ends the pointer', () => {
		const [, , main, border] = withEdits(TOKENS, [
			{ path: 'palette.light.primary.main', ref: 'tone.g.60' },
			{ path: 'palette.light.primary.border', value: '#123456' },
		]);
		expect(main).toMatchObject({ value: '#20A080', ref: { path: 'tone.g.60' } });
		expect(border?.value).toBe('#123456');
		expect(border?.ref).toBeUndefined();
	});

	it('is the same change whatever the order of its edits, and not when one token is pointed or given differently', () => {
		const a = [
			{ path: 'tone.g.50', value: '#000000' },
			{ path: 'palette.light.primary.main', ref: 'tone.g.60' },
		];
		expect(sameChange(a, [...a].reverse())).toBe(true);
		expect(sameChange(a, [a[0] as TokenEdit])).toBe(false);
		expect(sameChange([{ path: 'x', value: 'tone.g.60' }], [{ path: 'x', ref: 'tone.g.60' }])).toBe(false);
		expect(sameChange([], [])).toBe(true);
	});

	it('says what points at a token: what a change to it moves', () => {
		expect(pointingAt(TOKENS, 'tone.g.50').map((t) => t.path)).toEqual(['palette.light.primary.main', 'palette.light.primary.border']);
		expect(pointingAt(TOKENS, 'tone.g.60')).toEqual([]);
	});
});

describe('contrast', () => {
	it('is the WCAG ratio, rounded down so a ratio shown as passing does pass', () => {
		expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
		expect(contrastRatio('#FFFFFF', '#000000')).toBe(21);
		// #777777 on white is 4.48:1: shown as 4.4, under AA's 4.5, never rounded up to look like it passes.
		expect(contrastRatio('#777777', '#FFFFFF')).toBe(4.4);
		expect(contrastRatio('#108062', '#FFFFFF')!).toBeGreaterThanOrEqual(CONTRAST_TEXT.ratio);
	});

	it('is not said for a color something shows through, or one that is not a hex', () => {
		expect(contrastRatio('#10806266', '#FFFFFF')).toBeNull();
		expect(contrastRatio('#108062FF', '#FFFFFF')).toBe(contrastRatio('#108062', '#FFFFFF'));
		expect(contrastRatio('oklch(0.2 0 0)', '#FFFFFF')).toBeNull();
	});

	it('pairs a role’s main with its contrastText, and a variable with its -foreground, in the same mode', async () => {
		const theme = (await readTokens(memoryReads(THEME))).tokens;
		const main = theme.find((t) => t.path === 'palette.light.primary.main') as DesignToken;
		expect(contrastPartner(main, theme)?.path).toBe('palette.light.primary.contrastText');
		const css = (
			await readTokens(
				memoryReads({ 'a.css': ':root { --primary: #000000; --primary-foreground: #ffffff; }\n.dark { --primary-foreground: #eeeeee; }' }),
			)
		).tokens;
		expect(contrastPartner(css.find((t) => t.path === 'css.light.primary') as DesignToken, css)?.path).toBe('css.light.primary-foreground');
		// A color with no pair says nothing.
		expect(contrastPartner(theme.find((t) => t.path === 'palette.light.surface.main') as DesignToken, theme)).toBeUndefined();
	});
});

describe('writing a change into theme files', () => {
	it('writes a tone step’s new hex in its place, and moves the roles that point at it', async () => {
		const { written, find } = await change(THEME, [{ path: 'tone.pineGreen.50', value: '#0a6b52' }]);
		expect(written.get('src/colors/tones/pineGreen.ts')).toBe(
			"export const pineGreen = {\n  100: '#FFFFFF',\n  50: '#0A6B52',\n  20: '#18372F',\n};\n",
		);
		expect([...written.keys()]).toEqual(['src/colors/tones/pineGreen.ts']);
		expect(find('palette.light.primary.main').value).toBe('#0A6B52');
	});

	it('points a role at another step of its tone, as the library writes it, and leaves the rest of the line alone', async () => {
		const { written, find } = await change(THEME, [{ path: 'palette.light.primary.main', ref: 'tone.pineGreen.20' }]);
		expect(written.get('src/colors/theme/light.ts')).toContain('  primary: { main: pineGreen[20], contrastText: pineGreen[100] }, // the brand\n');
		expect(find('palette.light.primary.main')).toMatchObject({ value: '#18372F', ref: { path: 'tone.pineGreen.20' } });
	});

	it('keeps a role’s opacity when it is pointed elsewhere', async () => {
		const { written, find } = await change(THEME, [{ path: 'palette.light.primaryBorder.main', ref: 'tone.pineGreen.50' }]);
		expect(written.get('src/colors/theme/light.ts')).toContain('    main: `${pineGreen[50]}66`,\n');
		expect(find('palette.light.primaryBorder.main')).toMatchObject({ value: '#10806266', ref: { path: 'tone.pineGreen.50', alpha: '66' } });
	});

	it('gives a role a color of its own, which replaces its pointer', async () => {
		const { written, find } = await change(THEME, [{ path: 'palette.light.primary.main', value: '#123456' }]);
		expect(written.get('src/colors/theme/light.ts')).toContain("primary: { main: '#123456', contrastText");
		expect(find('palette.light.primary.main').ref).toBeUndefined();
	});

	it('writes the spacing and the radius as their numbers of pixels, wherever the theme sets them', async () => {
		const { written, find } = await change(THEME, [
			{ path: 'spacing', value: '6px' },
			{ path: 'radius', value: '12px' },
		]);
		expect(written.get('src/utils/theme.ts')).toBe('const spacing = 6;\nexport const theme = createTheme({\n  shape: { borderRadius: 12 },\n});\n');
		expect([find('spacing').value, find('radius').value]).toEqual(['6px', '12px']);
	});

	it('changes both modes of a role written once in a palette both spread in, and refuses editing them apart', async () => {
		const shared = {
			'src/colors/tones/pineGreen.ts': THEME['src/colors/tones/pineGreen.ts'],
			'src/colors/theme/shared.ts': "export const sharedPalette = {\n  info: { main: '#0000FF' },\n};\n",
			'src/colors/theme/modes.ts':
				"export const lightPalette = { mode: 'light', ...sharedPalette };\nexport const darkPalette = { mode: 'dark', ...sharedPalette };\n",
		};
		const { find } = await change(shared, [{ path: 'palette.light.info.main', value: '#00FF00' }]);
		expect([find('palette.light.info.main').value, find('palette.dark.info.main').value]).toEqual(['#00FF00', '#00FF00']);
		const apart = [
			{ path: 'palette.light.info.main', value: '#00FF00' },
			{ path: 'palette.dark.info.main', value: '#FF0000' },
		];
		await expect(editedFiles(memoryReads(shared), apart)).rejects.toThrow('each token once');
	});

	it('refuses what the theme cannot say: a radius in rem, or a role pointed at something not a tone step', async () => {
		await expect(editedFiles(memoryReads(THEME), [{ path: 'radius', value: '0.5rem' }])).rejects.toThrow('whole number of pixels');
		await expect(editedFiles(memoryReads(THEME), [{ path: 'palette.light.primary.main', ref: 'palette.light.surface.main' }])).rejects.toThrow(
			'only at a tone step',
		);
	});
});

describe('writing a change into CSS variables', () => {
	it('writes a color kept as bare HSL channels as channels, as shadcn uses them inside hsl()', async () => {
		const { written, find } = await change({ 'src/globals.css': ':root {\n  --primary: 222.2 47.4% 11.2%;\n}\n' }, [
			{ path: 'css.light.primary', value: '#222222' },
		]);
		expect(written.get('src/globals.css')).toBe(':root {\n  --primary: 0 0% 13.33%;\n}\n');
		expect(find('css.light.primary').value).toBe('#222222');
	});

	const CSS = {
		'src/globals.css':
			':root {\n  /* --primary: #000000; */ --primary: #111111;\n  --ring: var(--primary);\n  --accent: #333333;\n  --radius: 0.5rem;\n}\n',
	};

	it('writes a variable’s new value in its own declaration, past a commented-out one on the same line', async () => {
		const { written, find } = await change(CSS, [{ path: 'css.light.primary', value: '#222222' }]);
		expect(written.get('src/globals.css')).toContain('  /* --primary: #000000; */ --primary: #222222;\n');
		// The variable that points at it follows.
		expect(find('css.light.ring')).toMatchObject({ value: '#222222', ref: { path: 'css.light.primary' } });
	});

	it('points a variable at another, and changes a radius', async () => {
		const { written, find } = await change(CSS, [
			{ path: 'css.light.ring', ref: 'css.light.accent' },
			{ path: 'css.light.radius', value: '0.75rem' },
		]);
		expect(written.get('src/globals.css')).toContain('  --ring: var(--accent);\n');
		expect(written.get('src/globals.css')).toContain('  --radius: 0.75rem;\n');
		expect(find('css.light.ring').value).toBe('#333333');
	});
});

describe('writing a change into a variable a package declares (Phase 5.5)', () => {
	const FILES = {
		'node_modules/theme-kit/package.json': JSON.stringify({ name: 'theme-kit', style: 'theme.css' }),
		'node_modules/theme-kit/theme.css': ':root {\n  --radius-md: 0.375rem;\n  --spacing: 0.25rem;\n}\n.dark {\n  --radius-md: 0.5rem;\n}\n',
		'src/globals.css': "@import 'theme-kit';\n\n:root {\n  --brand: #108062;\n}\n",
	};

	it('declares it again in the library’s stylesheet that imports it, in a rule of the package’s kind, never in the package', async () => {
		const { written, find } = await change(FILES, [
			{ path: 'css.light.radius-md', value: '9px' },
			{ path: 'css.light.spacing', value: '0.3rem' },
			{ path: 'css.dark.radius-md', value: '10px' },
		]);
		expect([...written.keys()]).toEqual(['src/globals.css']);
		expect(written.get('src/globals.css')).toBe(
			"@import 'theme-kit';\n\n:root {\n  --brand: #108062;\n  --radius-md: 9px;\n  --spacing: 0.3rem;\n}\n\n.dark {\n  --radius-md: 10px;\n}\n",
		);
		// Read back as the library's own from then on, and as the change says.
		expect(find('css.light.radius-md')).toMatchObject({ value: '9px', source: { file: 'src/globals.css', line: 5 } });
		expect(find('css.light.radius-md').source.from).toBeUndefined();
		expect(find('css.dark.radius-md').value).toBe('10px');
	});
});

describe('writing a change into token files', () => {
	const JSON_FILE = {
		'tokens/color.json': `{
  "color": {
    "$type": "color",
    "red": { "500": { "$value": "#ff0000" } },
    "blue": { "500": { "$value": "#0000ff" } },
    "danger": { "$value": "{color.red.500}" }
  },
  "radius": {
    "$type": "dimension",
    "md": { "$value": { "value": 4, "unit": "px" } }
  }
}
`,
	};

	it('reads each token’s line exactly, not by where its name first appears', async () => {
		const list = await readTokens(memoryReads(JSON_FILE));
		expect(list.tokens.find((t) => t.path === 'color.blue.500')?.source.line).toBe(5);
		expect(list.tokens.find((t) => t.path === 'radius.md')?.source.line).toBe(10);
		expect(list.tokens.find((t) => t.path === 'color.danger')?.ref).toEqual({ path: 'color.red.500' });
	});

	it('writes a token’s $value as it was shaped, and points one elsewhere as a reference', async () => {
		const { written, find } = await change(JSON_FILE, [
			{ path: 'color.red.500', value: '#ee0000' },
			{ path: 'color.danger', ref: 'color.blue.500' },
			{ path: 'radius.md', value: '6px' },
		]);
		const text = written.get('tokens/color.json') as string;
		expect(text).toContain('"red": { "500": { "$value": "#ee0000" } },');
		expect(text).toContain('"danger": { "$value": "{color.blue.500}" }');
		expect(text).toContain('"md": { "$value": { "value": 6, "unit": "px" } }');
		expect(find('color.danger').value).toBe('#0000ff');
	});
});

describe('what is refused', () => {
	it('a token the library does not have, a value not of the token’s kind, and a token edited twice', async () => {
		await expect(editedFiles(memoryReads(THEME), [{ path: 'tone.nope.1', value: '#000000' }])).rejects.toThrow('no token tone.nope.1');
		await expect(editedFiles(memoryReads(THEME), [{ path: 'tone.pineGreen.50', value: 'red' }])).rejects.toThrow('not a hex color');
		await expect(editedFiles(memoryReads(THEME), [{ path: 'spacing', value: '#000000' }])).rejects.toThrow('not a length');
		const twice = [
			{ path: 'spacing', value: '4px' },
			{ path: 'spacing', value: '6px' },
		];
		await expect(editedFiles(memoryReads(THEME), twice)).rejects.toThrow('each token once');
	});

	it('anything that would put code into a file: only a hex or a length is ever written', async () => {
		await expect(editedFiles(memoryReads(THEME), [{ path: 'tone.pineGreen.50', value: "#108062', evil(), '" }])).rejects.toThrow('not a hex color');
		await expect(editedFiles(memoryReads(THEME), [{ path: 'spacing', value: '8px; evil()' }])).rejects.toThrow('not a length');
	});

	it('pointing a token that has a value of its own: it is given a value instead', async () => {
		await expect(editedFiles(memoryReads(THEME), [{ path: 'tone.pineGreen.50', ref: 'tone.pineGreen.20' }])).rejects.toThrow('a value of its own');
	});

	it('a change that would not read back as it says: nothing is written', async () => {
		// In dark mode, `var(--accent)` is dark's own --accent, so the light one cannot be pointed at from there in CSS.
		const css = { 'a.css': ':root {\n  --accent: #111111;\n}\n.dark {\n  --accent: #222222;\n  --ring: var(--accent);\n}\n' };
		await expect(editedFiles(memoryReads(css), [{ path: 'css.dark.ring', ref: 'css.light.accent' }])).rejects.toThrow(
			/The change was not made, because written into the library's files css\.dark\.ring would be #222222, not #111111/,
		);
	});

	it('anything from the window that is not a list of edits', () => {
		expect(tokenEditsOf(undefined)).toEqual([]);
		expect(
			tokenEditsOf([
				{ path: 'a', value: '#000000' },
				{ path: 'b', ref: 'c' },
			]),
		).toEqual([
			{ path: 'a', value: '#000000' },
			{ path: 'b', ref: 'c' },
		]);
		expect(() => tokenEditsOf('a')).toThrow();
		expect(() => tokenEditsOf([{ path: 'a' }])).toThrow();
		expect(() => tokenEditsOf(['a', null])).toThrow('A token edit names a token');
		expect(() => tokenEditsOf([{ path: 'a', ref: 'b', value: '#000000' }])).toThrow();
		expect(() => tokenEditsOf([{ path: 'a', value: 7 }])).toThrow();
		expect(() => tokenEditsOf(Array.from({ length: 501 }, () => ({ path: 'a', value: '#000000' })))).toThrow();
	});
});

describe('a token that is not a color or a length', () => {
	const font = (path: string, value: string): DesignToken => ({
		path,
		kind: 'font',
		category: 'Typography',
		group: 'Family',
		set: 'font',
		name: path,
		value,
		source: { file: 'a.css', line: 1 },
	});
	const byPath = new Map([font('font.sans', 'Inter'), font('font.mono', 'Menlo')].map((t) => [t.path, t]));

	it('fits no value, however much one looks like a length', () => {
		expect(fitsKind('dimension', '8px')).toBe(true);
		expect(fitsKind('color', '#108062')).toBe(true);
		expect(fitsKind('font', '8px')).toBe(false);
		expect(fitsKind('font', '#108062')).toBe(false);
	});

	it('is refused as a change when it is a length of a primitive that is only shown: a breakpoint', () => {
		const breakpoint: DesignToken = {
			path: 'breakpoints.md',
			kind: 'dimension',
			category: 'Breakpoints',
			group: 'Breakpoints',
			set: 'breakpoints',
			name: 'md',
			value: '900px',
			source: { file: 'a.ts', line: 1 },
		};
		expect(editProblem({ path: 'breakpoints.md', value: '800px' }, new Map([[breakpoint.path, breakpoint]]))).toMatch(
			/breakpoints\.md is shown, not changed/,
		);
	});

	it('is refused as a change, given a value or pointed at another of its kind: it is shown, not changed', () => {
		expect(editProblem({ path: 'font.sans', value: '8px' }, byPath)).toMatch(/font\.sans is shown, not changed/);
		expect(editProblem({ path: 'font.sans', ref: 'font.mono' }, byPath)).toMatch(/font\.sans is shown, not changed/);
	});
});

describe('writing a change into a library laid out otherwise', () => {
	it('writes a Tokens Studio value in its value, with no $', async () => {
		const studio = JSON.stringify({ colors: { blue: { value: '#0000ff', type: 'color' } } }, null, 2);
		const { written, find } = await change({ 'tokens.json': studio }, [{ path: 'colors.blue', value: '#00FF00' }]);
		expect(written.get('tokens.json')).toContain('"value": "#00FF00"');
		expect(find('colors.blue').value).toBe('#00FF00');
	});

	it('keeps a length with no unit as it is written, a number of pixels', async () => {
		const studio = JSON.stringify({ borderRadius: { lg: { value: '8', type: 'borderRadius' } } }, null, 2);
		const { written, find } = await change({ 'tokens.json': studio }, [{ path: 'borderRadius.lg', value: '12px' }]);
		expect(written.get('tokens.json')).toContain('"value": "12"');
		expect(find('borderRadius.lg').value).toBe('12px');
	});

	it('writes a role of a palette set in createTheme itself', async () => {
		const theme = "export const theme = createTheme({\n  palette: {\n    primary: { main: '#1976D2' },\n  },\n});\n";
		const { written, find } = await change({ 'src/theme.ts': theme }, [{ path: 'palette.light.primary.main', value: '#000000' }]);
		expect(written.get('src/theme.ts')).toContain("primary: { main: '#000000' }");
		expect(find('palette.light.primary.main').value).toBe('#000000');
	});
});
