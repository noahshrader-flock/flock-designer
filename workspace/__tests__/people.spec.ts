import { describe, expect, it } from 'vitest';
import { asPeople, mergePeople } from '../src/shared/people';

describe('asPeople', () => {
	it('reads old records that held bare names, and drops junk', () => {
		expect(asPeople(['Ada', { name: 'Grace', login: 'g' }, 7, '', null])).toEqual([
			{ name: 'Ada', login: null },
			{ name: 'Grace', login: 'g' },
		]);
	});
});

describe('mergePeople', () => {
	it('joins a name with the same name carrying a login, keeping the login', () => {
		expect(mergePeople([{ name: 'Ada Lovelace', login: null }], [{ name: 'ada lovelace', login: 'ada' }])).toEqual([
			{ name: 'Ada Lovelace', login: 'ada' },
		]);
	});
	it('joins two names that turn out to be one account', () => {
		expect(
			mergePeople([
				{ name: 'Ada L', login: 'ada' },
				{ name: 'Ada Lovelace', login: 'ada' },
			]),
		).toHaveLength(1);
	});
	it('orders by what is shown', () => {
		expect(
			mergePeople([
				{ name: 'Zed', login: null },
				{ name: 'Amy', login: 'bob' },
			]).map((p) => p.login ?? p.name),
		).toEqual(['bob', 'Zed']);
	});
});
