import { describe, expect, it } from 'vitest';
import { windowSources } from './windowSources';

describe('a comment’s card', () => {
	it('stops no clicks: choosing a comment is a button of its own, so nothing on the card has to keep from choosing it', () => {
		const own = windowSources().filter(({ path, text }) => path.includes('/comments/') && /stopPropagation/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});
