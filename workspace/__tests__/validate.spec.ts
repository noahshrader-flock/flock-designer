import { describe, expect, it } from 'vitest';
import { hasExactly } from '../src/shared/validate';

describe('hasExactly', () => {
	it('takes a message with these keys of its own and no others, in any order', () => {
		expect(hasExactly({ b: 1, a: 2 }, ['a', 'b'])).toBe(true);
		expect(hasExactly({}, [])).toBe(true);
	});

	it('refuses one with a key more, a key less, or a key it only inherits', () => {
		expect(hasExactly({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(false);
		expect(hasExactly({ a: 1 }, ['a', 'b'])).toBe(false);
		expect(hasExactly({ a: 1, c: 3 }, ['a', 'toString'])).toBe(false);
		expect(hasExactly({ a: 1 }, ['a', 'a'])).toBe(false);
	});
});
