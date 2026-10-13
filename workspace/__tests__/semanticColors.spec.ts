import { describe, expect, it } from 'vitest';
import type { DesignToken } from '../src/shared/contract';
import { paletteFamilies, semanticTable, tokenTitle } from '../src/shared/tokens';

/**
 * Which colors are the design system's palette and which are semantic, and the semantic ones lined up by theme: worked out
 * from the tokens as any library gives them, never from the names of one library's.
 */

const color = (path: string, group: string, set: string, name: string, value: string, ref?: string): DesignToken => ({
	path,
	kind: 'color',
	category: 'Color',
	group,
	set,
	name,
	value,
	...(ref ? { ref: { path: ref } } : {}),
	source: { file: 'src/theme.ts', line: 1 },
});

/** A theme as MUI-style libraries keep one: tone families, and roles in each mode pointing into them. */
const MUI = [
	color('tone.pine.50', 'Tones', 'pine', '50', '#108062'),
	color('tone.pine.20', 'Tones', 'pine', '20', '#18372F'),
	color('tone.red.40', 'Tones', 'red', '40', '#BA1A1A'),
	color('palette.light.primary.main', 'Light', 'primary', 'main', '#108062', 'tone.pine.50'),
	color('palette.light.primary.dark', 'Light', 'primary', 'dark', '#18372F', 'tone.pine.20'),
	color('palette.light.border.main', 'Light', 'border', 'main', '#CCCCCC'),
	color('palette.dark.primary.main', 'Dark', 'primary', 'main', '#18372F', 'tone.pine.20'),
	color('palette.dark.primary.dark', 'Dark', 'primary', 'dark', '#108062', 'tone.pine.50'),
];

describe('what is the palette', () => {
	it('is the families the library groups as its palette, used or not, and those the roles point into', () => {
		expect([...paletteFamilies(MUI)].sort()).toEqual(['Tones/pine', 'Tones/red']);
	});

	it('is, in a library with no palette group, the scales whose steps roles point at: found by the pointers', () => {
		const css = [
			color('css.light.red-500', 'Light', 'red', '500', '#EF4444'),
			color('css.light.red-100', 'Light', 'red', '100', '#FEE2E2'),
			color('css.light.gray-500', 'Light', 'gray', '500', '#6B7280'),
			color('css.light.danger', 'Light', 'danger', 'danger', '#EF4444', 'css.light.red-500'),
			color('css.light.background', 'Light', 'background', 'background', '#FFFFFF'),
		];
		// Red is pointed into, so it is the palette, with its other step; gray is not, so it is a role that has a value.
		expect([...paletteFamilies(css)]).toEqual(['Light/red']);
	});

	it('is never a role that points elsewhere, however many point at it', () => {
		const chain = [
			color('a.pine.50', 'Tones', 'pine', '50', '#108062'),
			color('a.brand.main', 'Light', 'brand', 'main', '#108062', 'a.pine.50'),
			color('a.primary.main', 'Light', 'primary', 'main', '#108062', 'a.brand.main'),
		];
		expect([...paletteFamilies(chain)]).toEqual(['Tones/pine']);
	});

	it('is nothing in a library whose colors are all literal', () => {
		expect(paletteFamilies([color('c.bg', 'Color', 'bg', 'bg', '#FFFFFF'), color('c.fg', 'Color', 'fg', 'fg', '#000000')]).size).toBe(0);
	});
});

describe('the semantic colors by theme', () => {
	const semantic = MUI.filter((t) => t.group !== 'Tones');

	it('line up by their group and name, a column for each theme in the order they come', () => {
		const table = semanticTable(semantic);
		expect(table.themes).toEqual(['Light', 'Dark']);
		expect(table.sets.map((s) => s.set)).toEqual(['primary', 'border']);
		const primary = table.sets[0]!;
		expect(primary.rows.map((r) => r.name)).toEqual(['main', 'dark']);
		expect(primary.rows[0]!.cells.map((c) => c?.path)).toEqual(['palette.light.primary.main', 'palette.dark.primary.main']);
	});

	it('leave a theme’s cell empty where it has no such token, rather than showing another’s', () => {
		const border = semanticTable(semantic).sets[1]!;
		expect(border.rows[0]!.cells.map((c) => c?.path)).toEqual(['palette.light.border.main', undefined]);
	});

	it('are as many columns as there are themes: three, or one', () => {
		const three = [...semantic, color('palette.contrast.primary.main', 'Contrast', 'primary', 'main', '#000000')];
		expect(semanticTable(three).themes).toEqual(['Light', 'Dark', 'Contrast']);
		expect(semanticTable(three).sets[0]!.rows[0]!.cells).toHaveLength(3);
		expect(semanticTable(semantic.filter((t) => t.group === 'Light')).themes).toEqual(['Light']);
	});

	it('keep a role whose name is its set apart, as a plain row, so a flat list is not a heading for each', () => {
		const flat = [
			color('css.light.background', 'Light', 'background', 'background', '#FFFFFF'),
			color('css.dark.background', 'Dark', 'background', 'background', '#000000'),
			color('css.light.primary', 'Light', 'primary', 'primary', '#111111'),
			...semantic,
		];
		const table = semanticTable(flat);
		expect(table.flat.map((r) => r.name)).toEqual(['background', 'primary']);
		expect(table.flat[0]!.cells.map((c) => c?.value)).toEqual(['#FFFFFF', '#000000']);
		expect(table.sets.map((s) => s.set)).toEqual(['primary', 'border']);
	});

	it('are nothing, with no themes, when there are no semantic colors', () => {
		expect(semanticTable([])).toEqual({ themes: [], flat: [], sets: [] });
	});
});

describe('a token’s title', () => {
	it('says its theme, then the role and its variant: Light · primary.main', () => {
		expect(tokenTitle(MUI[3]!)).toBe('Light · primary.main');
	});

	it('does not say a role twice when its name is its set', () => {
		expect(tokenTitle(color('css.dark.background', 'Dark', 'background', 'background', '#000'))).toBe('Dark · background');
	});
});
