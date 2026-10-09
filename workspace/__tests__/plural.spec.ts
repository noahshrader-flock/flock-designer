import { describe, expect, it } from 'vitest';
import { plural } from '../src/shared/plural';

describe('a count and what it counts', () => {
	it('is singular for one, and plural for none and for many', () => {
		expect(plural(1, 'version')).toBe('1 version');
		expect(plural(0, 'comment')).toBe('0 comments');
		expect(plural(12, 'change')).toBe('12 changes');
	});
});
