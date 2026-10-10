import { describe, expect, it } from 'vitest';
import { titleCase } from '../src/shared/titleCase';

describe('title case', () => {
	it('begins each word with a capital, and keeps the small words in the middle small', () => {
		expect(titleCase('Voice and tone')).toBe('Voice and Tone');
		expect(titleCase('voice and tone')).toBe('Voice and Tone');
		expect(titleCase('design system')).toBe('Design System');
		expect(titleCase('state of the art')).toBe('State of the Art');
	});

	it('capitalizes a small word that begins or ends the label', () => {
		expect(titleCase('the tokens')).toBe('The Tokens');
		expect(titleCase('what to look at')).toBe('What to Look At');
	});

	it('leaves single words, names capitalized inside, and the empty label as they are', () => {
		expect(titleCase('Color')).toBe('Color');
		expect(titleCase('color')).toBe('Color');
		expect(titleCase('FSButton')).toBe('FSButton');
		expect(titleCase('')).toBe('');
	});
});
