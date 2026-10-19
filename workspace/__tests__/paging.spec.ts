import { describe, expect, it } from 'vitest';
import { readPages } from '../src/codeHost/paging';
import { fakeGitHub } from './fakes/github';

const listOf = (total: number) => {
	let running = 0;
	let most = 0;
	const host = fakeGitHub({
		'/list*': async ({ query }) => {
			running++;
			most = Math.max(most, running);
			await new Promise((r) => setTimeout(r, 2));
			running--;
			const page = Number(query.get('page'));
			expect(query.get('per_page')).toBe('100');
			return Array.from({ length: Math.max(0, Math.min(100, total - (page - 1) * 100)) }, (_, i) => (page - 1) * 100 + i);
		},
	});
	return { ...host, most: () => most };
};

describe('a list the host pages', () => {
	it('is read up to the first page that is not full, in order', async () => {
		const list = listOf(250);
		expect(await readPages(list.github, '/list?state=all', { maxPages: 10 })).toEqual(Array.from({ length: 250 }, (_, i) => i));
		expect(list.calls.map((c) => c.path)).toEqual([1, 2, 3].map((n) => `/list?state=all&per_page=100&page=${n}`));
	});

	it('fails rather than stop short when it is longer than it will read, unless asked to stop there', async () => {
		await expect(readPages(listOf(500).github, '/list', { maxPages: 3 })).rejects.toThrow(/more than 300/);
		expect(await readPages(listOf(500).github, '/list', { maxPages: 3, atMost: 'stop' })).toHaveLength(300);
	});

	it('asks for the rest at once after a full first page, when asked to, and still stops at the first short one', async () => {
		const list = listOf(250);
		expect(await readPages(list.github, '/list', { maxPages: 10, together: true, atMost: 'stop' })).toHaveLength(250);
		expect(list.calls).toHaveLength(10);
		expect(list.most()).toBe(9);
		const short = listOf(30);
		expect(await readPages(short.github, '/list', { maxPages: 10, together: true })).toHaveLength(30);
		expect(short.calls).toHaveLength(1);
	});
});
