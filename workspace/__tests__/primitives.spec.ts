import { describe, expect, it } from 'vitest';
import type { DesignToken } from '../src/shared/contract';
import { PRIMITIVES, byPrimitive, isEditable, primitiveOf } from '../src/shared/primitives';

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
	it('is Color, Spacing and Shape, in that order, until a reader can read another kind', () => {
		expect(PRIMITIVES.map((p) => p.category)).toEqual(['Color', 'Spacing', 'Shape']);
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

	it('is nothing for a kind no primitive in the vocabulary is yet, whatever its name says', () => {
		expect(primitiveOf('font', 'spacing')).toBeNull();
		expect(primitiveOf('shadow', 'radius')).toBeNull();
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
