import { describe, expect, it } from 'vitest';
import type { DesignToken } from '../src/shared/contract';
import { PREVIEW_SPECIMEN, specimenAddress } from '../src/shared/catalog';
import { PRIMITIVES, TYPE_PARTS, byPrimitive, isEditable, missingParts, primitiveOf } from '../src/shared/primitives';
import { typeSpecimens } from '../src/shared/specimens';

/**
 * The vocabulary of primitives (R1 of the design system plan): the kinds of primitive DSNR knows, in one place, as data.
 * The tokens panel's tabs, the readers' categories, and later the Primitives page all read it, so there is no second list.
 */

const token = (category: string, path = category.toLowerCase()): DesignToken => ({
	path,
	kind: category === 'Color' ? 'color' : 'dimension',
	category,
	group: category,
	set: path,
	name: path,
	value: category === 'Color' ? '#000000' : '8px',
	source: { file: 'a.ts', line: 1 },
});

describe('the vocabulary', () => {
	it('is Color, Typography, Spacing and Shape, in that order, until a reader can read another kind', () => {
		expect(PRIMITIVES.map((p) => p.category)).toEqual(['Color', 'Typography', 'Spacing', 'Shape']);
	});

	it('says typography has a family, a size, a weight and a line height, so a design system with some is seen to lack the rest', () => {
		expect(PRIMITIVES.find((p) => p.category === 'Typography')?.parts).toEqual(['Family', 'Size', 'Weight', 'Line height']);
		expect(Object.values(TYPE_PARTS)).toEqual(['Family', 'Size', 'Weight', 'Line height']);
	});
});

describe('which primitive a token is', () => {
	it('is Color for a color, Shape for a radius, Spacing for spacing, and nothing for a size it cannot place', () => {
		expect(primitiveOf('color', 'primary')).toBe('Color');
		expect(primitiveOf('dimension', 'radius-md')).toBe('Shape');
		expect(primitiveOf('dimension', 'rounded')).toBe('Shape');
		expect(primitiveOf('dimension', 'spacing')).toBe('Spacing');
		expect(primitiveOf('dimension', 'space.4')).toBe('Spacing');
		expect(primitiveOf('dimension', 'gap-2')).toBe('Spacing');
		// Not a guess: a font size, a width or a breakpoint is not spacing.
		expect(primitiveOf('dimension', 'font-size-sm')).toBeNull();
		expect(primitiveOf('dimension', 'breakpoint-md')).toBeNull();
	});

	it('is Typography for a font, whatever its name says', () => {
		expect(primitiveOf('font', 'fontFamily')).toBe('Typography');
		expect(primitiveOf('font', 'spacing')).toBe('Typography');
	});

	it('is nothing for a kind no primitive in the vocabulary is yet, whatever its name says', () => {
		expect(primitiveOf('shadow', 'radius')).toBeNull();
		expect(primitiveOf('duration', 'spacing')).toBeNull();
	});
});

describe('the order the primitives are shown in', () => {
	it('is the vocabulary’s, whatever order the tokens came in, and a category it does not know after, as it came', () => {
		const tokens = [token('Shape'), token('Elsewhere'), token('Color'), token('Spacing'), token('Color', 'other')];
		expect(byPrimitive(tokens).map(([category, list]) => [category, list.length])).toEqual([
			['Color', 2],
			['Spacing', 1],
			['Shape', 1],
			['Elsewhere', 1],
		]);
	});
});

describe('what can be changed', () => {
	it('is a color or a length, and nothing else: every other kind is shown, never edited, written or tagged', () => {
		expect(isEditable('color')).toBe(true);
		expect(isEditable('dimension')).toBe(true);
		for (const kind of ['font', 'shadow', 'duration', 'easing', 'number'] as const) expect(isEditable(kind)).toBe(false);
	});
});

/** A typography token: its part is its group, and the style it belongs to is its set. */
const type = (group: string, set: string, name: string, value: string): DesignToken => ({
	path: `type.${set}.${name}`,
	kind: 'font',
	category: 'Typography',
	group,
	set,
	name,
	value,
	source: { file: 'a.css', line: 1 },
});

describe('the parts a primitive is missing', () => {
	it('are those of its parts it has no token for, in the vocabulary’s order', () => {
		const typography = PRIMITIVES.find((p) => p.category === 'Typography')!;
		expect(missingParts(typography, [type('Family', 'base', 'fontFamily', '"Inter",sans-serif')])).toEqual(['Size', 'Weight', 'Line height']);
		expect(missingParts(typography, [type('Family', 'base', 'fontFamily', 'Inter'), type('Size', 'h1', 'fontSize', '96px'), type('Weight', 'h1', 'fontWeight', '300'), type('Line height', 'h1', 'lineHeight', '1.2')])).toEqual([]);
	});

	it('are none for a primitive that is not made of parts', () => {
		expect(missingParts(PRIMITIVES.find((p) => p.category === 'Color')!, [])).toEqual([]);
	});
});

describe('the type specimens', () => {
	it('are each family, each style that has a size (with its own weight, line height and family), and each weight with no size', () => {
		const tokens = [
			type('Family', 'base', 'fontFamily', '"Inter",sans-serif'),
			type('Family', 'code', 'fontFamily', 'Menlo, monospace'),
			type('Size', 'h1', 'fontSize', '96px'),
			type('Weight', 'h1', 'fontWeight', '300'),
			type('Line height', 'h1', 'lineHeight', '1.167'),
			type('Size', 'code', 'fontSize', '14px'),
			type('Weight', 'weight', 'bold', '700'),
		];
		expect(typeSpecimens(tokens)).toEqual([
			{ key: 'type.base.fontFamily', label: 'base fontFamily', family: '"Inter",sans-serif' },
			{ key: 'type.code.fontFamily', label: 'code fontFamily', family: 'Menlo, monospace' },
			{ key: 'h1', label: 'h1', family: '"Inter",sans-serif', size: '96px', weight: '300', lineHeight: '1.167' },
			{ key: 'code', label: 'code', family: 'Menlo, monospace', size: '14px' },
			{ key: 'type.weight.bold', label: 'weight bold', family: '"Inter",sans-serif', weight: '700' },
		]);
	});

	it('are none when there is no typography', () => {
		expect(typeSpecimens([])).toEqual([]);
	});

	it('are drawn by a preview page given them in its address', () => {
		const lines = [{ key: 'h1', label: 'h1', size: '96px' }];
		const address = specimenAddress('http://127.0.0.1:1/previews/abc/', lines);
		const url = new URL(address);
		expect(url.searchParams.get(PREVIEW_SPECIMEN)).toBe(JSON.stringify(lines));
	});
});
