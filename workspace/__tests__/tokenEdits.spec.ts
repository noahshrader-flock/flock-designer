import { describe, expect, it } from 'vitest';
import type { CatalogReads } from '../src/main/services/componentCatalog';
import { readTokens } from '../src/main/services/designTokens';
import { editedFiles, tokenEditsOf } from '../src/main/services/tokenEdits';
import type { DesignToken, TokenEdit } from '../src/shared/contract';
import { contrastPartner, contrastRatio, pointingAt, sameChange, withEdits } from '../src/shared/tokens';
import { CONTRAST_TEXT } from '../src/shared/wcag';

/**
 * A change to the library's tokens (T3 of the design system plan, decisions 19, 26 and 27): what it does to the list,
 * worked out once; and how it is written into the library's files, by each source in its own way, read back and checked
 * against that. Against fixtures of each way a library keeps its tokens.
 */

const reads = (files: Record<string, string>): CatalogReads => ({
	listFiles: async (dir) => Object.keys(files).filter((f) => dir === '' || f.startsWith(`${dir}/`)),
	readFile: async (path) => {
		const text = files[path];
		if (text === undefined) throw new Error(`no ${path}`);
		return text;
	},
});

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
	const written = await editedFiles(reads(files), edits);
	const after = await readTokens(reads({ ...files, ...Object.fromEntries(written) }));
	return { written, find: (path: string) => after.tokens.find((t) => t.path === path) as DesignToken };
};

describe('what a change does to the list', () => {
	const tone = (step: string, value: string): DesignToken => ({ path: `tone.g.${step}`, kind: 'color', category: 'Color', group: 'Tones', set: 'g', name: step, value, source: { file: 'g.ts', line: 1 } });
	const role = (path: string, ref: string, value: string, alpha?: string): DesignToken => ({
		...tone('x', value),
		path,
		group: 'Light',
		set: 'primary',
		name: path.split('.').pop() as string,
		ref: alpha ? { path: ref, alpha } : { path: ref },
	});
	const TOKENS = [tone('50', '#108062'), tone('60', '#20A080'), role('palette.light.primary.main', 'tone.g.50', '#108062'), role('palette.light.primary.border', 'tone.g.50', '#10806266', '66')];

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
		const theme = (await readTokens(reads(THEME))).tokens;
		const main = theme.find((t) => t.path === 'palette.light.primary.main') as DesignToken;
		expect(contrastPartner(main, theme)?.path).toBe('palette.light.primary.contrastText');
		const css = (await readTokens(reads({ 'a.css': ':root { --primary: #000000; --primary-foreground: #ffffff; }\n.dark { --primary-foreground: #eeeeee; }' })))
			.tokens;
		expect(contrastPartner(css.find((t) => t.path === 'css.light.primary') as DesignToken, css)?.path).toBe('css.light.primary-foreground');
		// A color with no pair says nothing.
		expect(contrastPartner(theme.find((t) => t.path === 'palette.light.surface.main') as DesignToken, theme)).toBeUndefined();
	});
});

describe('writing a change into theme files', () => {
	it('writes a tone step’s new hex in its place, and moves the roles that point at it', async () => {
		const { written, find } = await change(THEME, [{ path: 'tone.pineGreen.50', value: '#0a6b52' }]);
		expect(written.get('src/colors/tones/pineGreen.ts')).toBe("export const pineGreen = {\n  100: '#FFFFFF',\n  50: '#0A6B52',\n  20: '#18372F',\n};\n");
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
			'src/colors/theme/modes.ts': "export const lightPalette = { mode: 'light', ...sharedPalette };\nexport const darkPalette = { mode: 'dark', ...sharedPalette };\n",
		};
		const { find } = await change(shared, [{ path: 'palette.light.info.main', value: '#00FF00' }]);
		expect([find('palette.light.info.main').value, find('palette.dark.info.main').value]).toEqual(['#00FF00', '#00FF00']);
		const apart = [{ path: 'palette.light.info.main', value: '#00FF00' }, { path: 'palette.dark.info.main', value: '#FF0000' }];
		await expect(editedFiles(reads(shared), apart)).rejects.toThrow('each token once');
	});

	it('refuses what the theme cannot say: a radius in rem, or a role pointed at something not a tone step', async () => {
		await expect(editedFiles(reads(THEME), [{ path: 'radius', value: '0.5rem' }])).rejects.toThrow('whole number of pixels');
		await expect(editedFiles(reads(THEME), [{ path: 'palette.light.primary.main', ref: 'palette.light.surface.main' }])).rejects.toThrow('only at a tone step');
	});
});

describe('writing a change into CSS variables', () => {
	const CSS = { 'src/globals.css': ':root {\n  /* --primary: #000000; */ --primary: #111111;\n  --ring: var(--primary);\n  --accent: #333333;\n  --radius: 0.5rem;\n}\n' };

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
		const list = await readTokens(reads(JSON_FILE));
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
		await expect(editedFiles(reads(THEME), [{ path: 'tone.nope.1', value: '#000000' }])).rejects.toThrow('no token tone.nope.1');
		await expect(editedFiles(reads(THEME), [{ path: 'tone.pineGreen.50', value: 'red' }])).rejects.toThrow('not a hex color');
		await expect(editedFiles(reads(THEME), [{ path: 'spacing', value: '#000000' }])).rejects.toThrow('not a length');
		const twice = [{ path: 'spacing', value: '4px' }, { path: 'spacing', value: '6px' }];
		await expect(editedFiles(reads(THEME), twice)).rejects.toThrow('each token once');
	});

	it('anything that would put code into a file: only a hex or a length is ever written', async () => {
		await expect(editedFiles(reads(THEME), [{ path: 'tone.pineGreen.50', value: "#108062', evil(), '" }])).rejects.toThrow('not a hex color');
		await expect(editedFiles(reads(THEME), [{ path: 'spacing', value: '8px; evil()' }])).rejects.toThrow('not a length');
	});

	it('pointing a token that has a value of its own: it is given a value instead', async () => {
		await expect(editedFiles(reads(THEME), [{ path: 'tone.pineGreen.50', ref: 'tone.pineGreen.20' }])).rejects.toThrow('a value of its own');
	});

	it('a change that would not read back as it says: nothing is written', async () => {
		// In dark mode, `var(--accent)` is dark's own --accent, so the light one cannot be pointed at from there in CSS.
		const css = { 'a.css': ':root {\n  --accent: #111111;\n}\n.dark {\n  --accent: #222222;\n  --ring: var(--accent);\n}\n' };
		await expect(editedFiles(reads(css), [{ path: 'css.dark.ring', ref: 'css.light.accent' }])).rejects.toThrow(
			/The change was not made, because written into the library's files css\.dark\.ring would be #222222, not #111111/,
		);
	});

	it('anything from the window that is not a list of edits', () => {
		expect(tokenEditsOf(undefined)).toEqual([]);
		expect(tokenEditsOf([{ path: 'a', value: '#000000' }, { path: 'b', ref: 'c' }])).toEqual([{ path: 'a', value: '#000000' }, { path: 'b', ref: 'c' }]);
		expect(() => tokenEditsOf('a')).toThrow();
		expect(() => tokenEditsOf([{ path: 'a' }])).toThrow();
		expect(() => tokenEditsOf(['a', null])).toThrow('A token edit names a token');
		expect(() => tokenEditsOf([{ path: 'a', ref: 'b', value: '#000000' }])).toThrow();
		expect(() => tokenEditsOf([{ path: 'a', value: 7 }])).toThrow();
		expect(() => tokenEditsOf(Array.from({ length: 501 }, () => ({ path: 'a', value: '#000000' })))).toThrow();
	});
});
