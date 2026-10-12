import { describe, expect, it } from 'vitest';
import { fakeGitHub, refusal } from './fakes/github';

describe('the fake GitHub every spec uses', () => {
	it('answers a whole path before a start of one, and the longest start first', async () => {
		const { api } = fakeGitHub({ '/repos/a/b': 'repo', '/repos/a/b/*': 'anything', '/repos/a/b/pages*': 'pages', 'POST /repos/a/b/pages': 'made' });
		expect(await api('/repos/a/b')).toBe('repo');
		expect(await api('/repos/a/b/issues?state=all')).toBe('anything');
		expect(await api('/repos/a/b/pages/builds')).toBe('pages');
		expect(await api('/repos/a/b/pages', { method: 'POST' })).toBe('made');
	});

	it('answers with a function of the call, and refuses with the status a transport gives', async () => {
		const { api, writes } = fakeGitHub({
			'PUT /x*': ({ path, body, query }: { path: string; body?: unknown; query: URLSearchParams }) => ({ path, body, ref: query.get('ref') }),
			'/gone': () => {
				throw refusal(404);
			},
		});
		expect(await api('/x?ref=main', { method: 'PUT', body: 1 })).toEqual({ path: '/x?ref=main', body: 1, ref: 'main' });
		await expect(api('/gone')).rejects.toMatchObject({ status: 404, message: 'Not Found' });
		expect(writes).toEqual([{ method: 'PUT', path: '/x?ref=main', body: 1 }]);
	});

	it('fails a call nothing answers, by its method and path', async () => {
		await expect(fakeGitHub({ 'POST /x': 1 }).api('/x')).rejects.toThrow('not faked: GET /x');
	});
});
