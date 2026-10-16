import { describe, expect, it } from 'vitest';
import type { DesignToken } from '../src/shared/contract';
import { colorAsRead, hexOf, labelOf, lengthSpan, nameOf, paletteFamilies, semanticTable, tokenTitle } from '../src/shared/tokens';

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

describe('a token’s name', () => {
	/** A token as a reader gives it: where it is written is its path, which says how its set and name were joined. */
	const named = (path: string, set: string, name: string) => nameOf(color(path, 'Light', set, name, '#000000'));

	it('is its set and its step as a person says them, when the library writes them as separate things', () => {
		expect(named('tone.pineGreen.50', 'pineGreen', '50')).toBe('pineGreen 50');
		expect(named('palette.light.primary.main', 'primary', 'main')).toBe('primary main');
	});

	it('is as the library wrote it when it joins them in one name: a dash, an underscore, or nothing', () => {
		expect(named('css.light.pine-green-50', 'pine-green', '50')).toBe('pine-green-50');
		expect(named('css.light.pine_green_50', 'pine_green', '50')).toBe('pine_green_50');
		expect(named('css.light.pineGreen50', 'pineGreen', '50')).toBe('pineGreen50');
	});

	it('is not said twice when the set is the name', () => {
		expect(named('css.light.background', 'background', 'background')).toBe('background');
	});
});

describe('a token’s label', () => {
	it('says its group, then its name, without a word twice', () => {
		expect(labelOf(color('palette.light.primary.main', 'Light', 'primary', 'main', '#000000'))).toBe('Light primary main');
		expect(labelOf(color('shape.base', 'Radius', 'radius', 'base', '8px'))).toBe('Radius base');
		expect(labelOf(color('radius', 'Radius', 'radius', 'radius', '8px'))).toBe('Radius');
	});
});

describe('a value as its control edits it', () => {
	it('reads a color as the browser computes it as its hex, with an opacity less than whole as two more digits', () => {
		expect(hexOf('rgb(16, 128, 98)')).toBe('#108062');
		expect(hexOf('rgba(0, 0, 0, 0.5)')).toBe('#00000080');
		expect(hexOf('rgba(16, 128, 98, 1)')).toBe('#108062');
		expect(hexOf('#abcdef')).toBe('#ABCDEF');
		expect(hexOf('none')).toBeNull();
		expect(hexOf('oklch(0.5 0.1 120)')).toBeNull();
	});

	it('says a color as a token’s is: its hex, and an opacity less than whole after it', () => {
		expect(colorAsRead('rgb(16, 128, 98)')).toBe('#108062');
		expect(colorAsRead('rgba(0, 0, 0, 0.12)')).toBe('#000000 · 12%');
		expect(colorAsRead('#12345680')).toBe('#123456 · 50%');
		expect(colorAsRead('none')).toBe('none');
	});

	it('gives a length a slider from nothing to twice what it was, a useful span at least and never short of what it is now, in whole pixels or eighths of a rem', () => {
		expect(lengthSpan('28px', '28px')).toEqual({ number: 28, unit: 'px', max: 56, step: 1 });
		expect(lengthSpan('4px', '8px')).toEqual({ number: 4, unit: 'px', max: 32, step: 1 });
		expect(lengthSpan('40px', '8px')).toEqual({ number: 40, unit: 'px', max: 40, step: 1 });
		expect(lengthSpan('0.5rem', '0.5rem')).toEqual({ number: 0.5, unit: 'rem', max: 2, step: 0.125 });
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
