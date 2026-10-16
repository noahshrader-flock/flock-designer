import { describe, expect, it } from 'vitest';
import { CSS_OF, allParts, partsIn, shortParts, shortValue } from '../src/shared/valueParts';

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
