import { describe, expect, it } from 'vitest';
import { CSS_OF, allParts, asTried, isFull, partsIn, shortParts, shortValue } from '../src/shared/valueParts';

/** How a component's drawn value is written, one way for the page, the analysis and the control (adjusting a component). */
describe('a value’s parts', () => {
	it('are each longhand a property is read from and tried on: four sides, four corners, a row and a column, else one', () => {
		expect([partsIn('padding'), partsIn('radius'), partsIn('gap'), partsIn('fontSize'), partsIn('height'), partsIn('border')]).toEqual([
			4, 4, 2, 1, 1, 1,
		]);
		// A border's colour is one part, set on every side.
		expect(CSS_OF.border.names).toHaveLength(4);
	});

	it('are written in full from a value written short, as CSS reads one to four parts', () => {
		expect(allParts('8px', 4)).toEqual(['8px', '8px', '8px', '8px']);
		expect(allParts('0px 10px', 4)).toEqual(['0px', '10px', '0px', '10px']);
		expect(allParts('1px 2px 3px', 4)).toEqual(['1px', '2px', '3px', '2px']);
		expect(allParts('4px', 2)).toEqual(['4px', '4px']);
		// One part is the value as it is, spaces and all.
		expect(allParts('rgb(16, 128, 98)', 1)).toEqual(['rgb(16, 128, 98)']);
	});

	it('are written as short as CSS writes them, and a value said so', () => {
		expect(shortParts(['8px', '8px', '8px', '8px'])).toEqual(['8px']);
		expect(shortParts(['0px', '10px', '0px', '10px'])).toEqual(['0px', '10px']);
		expect(shortParts(['1px', '2px', '3px', '2px'])).toEqual(['1px', '2px', '3px']);
		expect(shortParts(['1px', '2px', '3px', '4px'])).toEqual(['1px', '2px', '3px', '4px']);
		expect(shortParts(['4px', '4px'])).toEqual(['4px']);
		expect(shortValue('padding', '0px 10px 0px 10px')).toBe('0px 10px');
		expect(shortValue('gap', 'normal normal')).toBe('normal');
		expect(shortValue('fontSize', '16px')).toBe('16px');
	});
});

describe('a radius that makes its ends round (Phase 5.5)', () => {
	it('is said as full, as a pill’s 9999px and an infinite one drawn (Tailwind’s rounded-full) are, and a radius that is a size is not', () => {
		expect(shortValue('radius', '3.35544e+07px 3.35544e+07px 3.35544e+07px 3.35544e+07px')).toBe('full');
		expect(shortValue('radius', '9999px 9999px 0px 0px')).toBe('full full 0px 0px');
		expect(shortValue('radius', '8px 8px 8px 8px')).toBe('8px');
		expect(['9999px', '3.35544e+07px', '9998px', '0.5rem', 'full'].map(isFull)).toEqual([true, true, false, false, false]);
		// Only a radius: a padding as large is a size.
		expect(shortValue('padding', '9999px')).toBe('9999px');
	});
});

describe('a value as a control writes it when it is tried', () => {
	it('is a colour’s hex, and every part of a length in pixels, which is what the writer writes; nothing else', () => {
		expect(asTried('background', 'rgb(16, 128, 98)')).toBe('#108062');
		expect(asTried('text', '#aa0000')).toBe('#AA0000');
		expect(asTried('padding', '8px  12px')).toBe('8px 12px 8px 12px');
		expect(asTried('radius', '6px')).toBe('6px 6px 6px 6px');
		expect(asTried('height', '30px')).toBe('30px');
		expect([asTried('height', '1.5rem'), asTried('height', 'tall'), asTried('border', 'red'), asTried('gap', '4px 2em')]).toEqual([
			null,
			null,
			null,
			null,
		]);
	});
});
