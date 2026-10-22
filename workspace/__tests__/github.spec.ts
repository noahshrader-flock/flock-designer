import { describe, expect, it } from 'vitest';
import { type Fetcher, ReadCache, ReauthRequired, callApi } from '../src/codeHost/github';
import { HostError } from '../src/codeHost/hostError';

const stub = (responses: Array<{ status?: number; body: unknown }>) => {
	const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = [];
	const fetcher: Fetcher = async (url, init) => {
		calls.push({ url, ...(init ? { init } : {}) });
		const next = responses.shift() ?? { body: {} };
		return {
			status: next.status ?? 200,
			json: async () => next.body,
			text: async () => JSON.stringify(next.body),
		};
	};
	return { fetcher, calls };
};

describe('callApi', () => {
	it('sends the token and the API version, and no secret', async () => {
		const { fetcher, calls } = stub([{ body: { ok: true } }]);
		await callApi('tok', { path: '/user' }, fetcher);
		expect(calls[0]?.init?.headers?.Authorization).toBe('Bearer tok');
		expect(calls[0]?.init?.headers?.['X-GitHub-Api-Version']).toBe('2022-11-28');
	});

	it('turns 401 into a re-sign-in rather than a generic failure', async () => {
		const { fetcher } = stub([{ status: 401, body: { message: 'Bad credentials' } }]);
		await expect(callApi('tok', { path: '/user' }, fetcher)).rejects.toThrow(ReauthRequired);
	});

	it('says a 404 may mean the app is not installed, because GitHub cannot tell them apart', async () => {
		const { fetcher } = stub([{ status: 404, body: { message: 'Not Found' } }]);
		await expect(callApi('tok', { path: '/repos/x/y' }, fetcher)).rejects.toThrow(/not installed/);
	});

	it('names the missing permission and where to set it, which GitHub does not', async () => {
		const { fetcher } = stub([{ status: 403, body: { message: 'Resource not accessible by integration' } }]);
		await expect(callApi('tok', { path: '/repos/a/b/contents/prototypes' }, fetcher)).rejects.toThrow(
			/Contents \(read-only\).*Permissions & events/s,
		);
	});

	it('names the Issues permission when that is the one missing', async () => {
		const { fetcher } = stub([{ status: 403, body: { message: 'Resource not accessible by integration' } }]);
		await expect(callApi('tok', { path: '/repos/a/b/issues' }, fetcher)).rejects.toThrow(/Issues \(read and write\)/);
	});

	it('treats 204 No Content as a success with nothing to read, instead of failing to parse an empty body', async () => {
		const fetcher: Fetcher = async () => ({
			status: 204,
			json: async () => {
				throw new SyntaxError('Unexpected end of JSON input');
			},
			text: async () => '',
		});
		await expect(callApi('tok', { path: '/repos/a/b/issues/comments/9', method: 'DELETE' }, fetcher)).resolves.toBeNull();
	});

	it('says what a bare failure returned and its request id, since there is no message to pass on', async () => {
		const fetcher: Fetcher = async () => ({
			status: 500,
			headers: { get: (n: string) => (n === 'x-github-request-id' ? 'AB12:34CD' : null) },
			json: async () => {
				throw new Error('not json');
			},
			text: async () => '<html>\n  Server Error\n</html>',
		});
		await expect(callApi('tok', { path: '/x', method: 'POST', body: {} }, fetcher)).rejects.toThrow(
			'GitHub returned 500 for POST /x: <html> Server Error </html> (request AB12:34CD)',
		);
	});

	it("passes GitHub's own message through for other failures", async () => {
		const { fetcher } = stub([{ status: 422, body: { message: 'Validation failed' } }]);
		await expect(callApi('tok', { path: '/x' }, fetcher)).rejects.toThrow(HostError);
	});
});

const withHeaders = (responses: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>) => {
	const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = [];
	const fetcher: Fetcher = async (url, init) => {
		calls.push({ url, ...(init ? { init } : {}) });
		const next = responses.shift() ?? { body: {} };
		const headers = Object.fromEntries(Object.entries(next.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
		return {
			status: next.status ?? 200,
			headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
			json: async () => next.body,
			text: async () => (next.body === undefined ? '' : JSON.stringify(next.body)),
		};
	};
	return { fetcher, calls };
};

describe('a read asked again (conditional requests)', () => {
	it('sends what GitHub tagged it with, and takes "not modified" as what it read before, which costs nothing of the hourly limit', async () => {
		const cache = new ReadCache();
		const { fetcher, calls } = withHeaders([
			{ body: { name: 'first' }, headers: { ETag: '"abc"' } },
			{ status: 304, headers: { ETag: '"abc"' } },
		]);
		expect(await callApi('tok', { path: '/repos/a/b/contents/prototypes' }, fetcher, cache)).toEqual({ name: 'first' });
		expect(calls[0]?.init?.headers?.['If-None-Match']).toBeUndefined();
		expect(await callApi('tok', { path: '/repos/a/b/contents/prototypes' }, fetcher, cache)).toEqual({ name: 'first' });
		expect(calls[1]?.init?.headers?.['If-None-Match']).toBe('"abc"');
	});

	it('takes a changed answer as the new one, and keeps its tag', async () => {
		const cache = new ReadCache();
		const { fetcher, calls } = withHeaders([
			{ body: { v: 1 }, headers: { ETag: '"one"' } },
			{ body: { v: 2 }, headers: { ETag: '"two"' } },
			{ status: 304 },
		]);
		await callApi('tok', { path: '/x' }, fetcher, cache);
		expect(await callApi('tok', { path: '/x' }, fetcher, cache)).toEqual({ v: 2 });
		expect(await callApi('tok', { path: '/x' }, fetcher, cache)).toEqual({ v: 2 });
		expect(calls[2]?.init?.headers?.['If-None-Match']).toBe('"two"');
	});

	it('never tags a write, keeps nothing without a tag, and keeps reads apart by who asked', async () => {
		const cache = new ReadCache();
		const { fetcher, calls } = withHeaders([
			{ body: { id: 1 }, headers: { ETag: '"w"' } },
			{ body: { a: 1 } },
			{ body: { a: 1 }, headers: { ETag: '"t"' } },
			{ body: { a: 2 } },
		]);
		await callApi('tok', { path: '/x', method: 'POST', body: {} }, fetcher, cache);
		await callApi('tok', { path: '/y' }, fetcher, cache);
		await callApi('tok', { path: '/z' }, fetcher, cache);
		await callApi('other', { path: '/z' }, fetcher, cache);
		expect(calls[1]?.init?.headers?.['If-None-Match']).toBeUndefined();
		expect(calls[3]?.init?.headers?.['If-None-Match']).toBeUndefined();
	});

	it('keeps a bounded number of reads, the oldest dropped first', () => {
		const cache = new ReadCache(2);
		cache.put('t', '/a', '"1"', 1);
		cache.put('t', '/b', '"2"', 2);
		cache.put('t', '/c', '"3"', 3);
		expect(cache.get('t', '/a')).toBeUndefined();
		expect(cache.get('t', '/c')).toEqual({ etag: '"3"', body: 3 });
	});
});

describe('the hourly limit', () => {
	it('says plainly that it is used up and when it comes back, not GitHub’s own wording', async () => {
		const reset = Math.floor(Date.UTC(2026, 9, 15, 4, 44, 44) / 1000);
		const { fetcher } = withHeaders([
			{
				status: 403,
				body: { message: 'API rate limit exceeded for user ID 314084935. If you reach out to GitHub Support...' },
				headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
			},
		]);
		const err = (await callApi('tok', { path: '/repos/a/b/issues' }, fetcher).catch((e: unknown) => e)) as HostError;
		expect(err).toBeInstanceOf(HostError);
		expect(err.kind).toBe('rateLimited');
		expect(err.message).toMatch(/^GitHub's hourly limit for your account is used up\. It comes back at /);
		expect(err.message).not.toMatch(/user ID|Support|scraping/);
	});

	it('says to wait a moment when GitHub slows requests down for a short while', async () => {
		const { fetcher } = withHeaders([
			{ status: 429, body: { message: 'You have exceeded a secondary rate limit.' }, headers: { 'retry-after': '60' } },
		]);
		const err = (await callApi('tok', { path: '/x' }, fetcher).catch((e: unknown) => e)) as HostError;
		expect(err.kind).toBe('rateLimited');
		expect(err.message).toBe('GitHub is slowing requests down for a moment. Try again in about a minute.');
	});

	it('is not mistaken for a missing permission or anything else that is a 403', async () => {
		const { fetcher } = withHeaders([
			{ status: 403, body: { message: 'Resource not accessible by integration' }, headers: { 'x-ratelimit-remaining': '4000' } },
		]);
		await expect(callApi('tok', { path: '/repos/a/b/issues' }, fetcher)).rejects.toThrow(/Issues \(read and write\)/);
	});
});
