import { describe, expect, it, vi } from 'vitest';
import { MAX_BODY, handleExchange } from '../functions/sign-in/lib/exchange.mjs';

/** The function that trades a page's one-time code for a person's token. */

const SITE = 'https://noahshrader-flock.github.io';
const ENV = { GITHUB_CLIENT_ID: 'Iv1.abc', ALLOWED_ORIGIN: SITE, REDIRECT_URI: `${SITE}/flock-designer/` };
const VERIFIER = 'a'.repeat(43);
const GOOD = JSON.stringify({ code: 'abcdef0123456789abcd', verifier: VERIFIER });

/** A stand-in GitHub that records what it was asked and answers as given. */
const github = (reply: unknown) => vi.fn(async () => ({ json: async () => reply }) as Response);
const post = (body: string, over: Partial<{ method: string; origin: string | undefined }> = {}) => ({ method: 'POST', origin: SITE, body, ...over });

describe('the sign-in function', () => {
	it('trades the code and verifier for the access token, and sends GitHub our own redirect address', async () => {
		const gh = github({ access_token: 'ghu_x', expires_in: 28800, refresh_token: 'ghr_secret', scope: '', token_type: 'bearer' });
		const r = await handleExchange(post(GOOD), ENV, gh);
		expect(r.status).toBe(200);
		expect(JSON.parse(r.body)).toEqual({ access_token: 'ghu_x', token_type: 'bearer', expires_in: 28800 });
		const [url, init] = gh.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://github.com/login/oauth/access_token');
		expect(JSON.parse(init.body as string)).toEqual({
			client_id: 'Iv1.abc',
			code: 'abcdef0123456789abcd',
			code_verifier: VERIFIER,
			redirect_uri: `${SITE}/flock-designer/`,
		});
	});

	it('never hands back GitHub’s refresh token, or anything else it said', async () => {
		const r = await handleExchange(post(GOOD), ENV, github({ access_token: 'ghu_x', refresh_token: 'ghr_secret', refresh_token_expires_in: 1 }));
		expect(r.body).not.toContain('ghr_secret');
		expect(Object.keys(JSON.parse(r.body)).sort()).toEqual(['access_token', 'expires_in', 'token_type']);
	});

	it('holds the App’s secret only when it is given one, and sends it to GitHub alone', async () => {
		const gh = github({ access_token: 'ghu_x' });
		const r = await handleExchange(post(GOOD), { ...ENV, GITHUB_CLIENT_SECRET: 's3cret' }, gh);
		expect(JSON.parse((gh.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).client_secret).toBe('s3cret');
		expect(r.body).not.toContain('s3cret');
	});

	it('refuses a request that does not come from our site, with no CORS header to read the refusal by', async () => {
		for (const origin of ['https://evil.example', undefined, `${SITE}.evil.example`, 'http://noahshrader-flock.github.io']) {
			const gh = github({ access_token: 'x' });
			const r = await handleExchange(post(GOOD, { origin }), ENV, gh);
			expect(r.status).toBe(403);
			expect(r.headers['access-control-allow-origin']).toBeUndefined();
			expect(gh).not.toHaveBeenCalled();
		}
		expect((await handleExchange(post(GOOD), { ...ENV, ALLOWED_ORIGIN: undefined }, github({}))).status).toBe(403);
	});

	it('answers the browser’s preflight for our site alone, and refuses every method but POST', async () => {
		const pre = await handleExchange({ method: 'OPTIONS', origin: SITE, body: '' }, ENV, github({}));
		expect(pre.status).toBe(204);
		expect(pre.headers['access-control-allow-origin']).toBe(SITE);
		expect(pre.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
		for (const method of ['GET', 'PUT', 'DELETE']) expect((await handleExchange(post(GOOD, { method }), ENV, github({}))).status).toBe(405);
	});

	it('refuses a body of the wrong shape: extra fields, missing ones, wrong types, a bad code or verifier, or not JSON', async () => {
		const bad = [
			'not json',
			'[]',
			'null',
			JSON.stringify({ code: 'abcdef0123456789abcd' }),
			JSON.stringify({ verifier: VERIFIER }),
			JSON.stringify({ code: 'abcdef0123456789abcd', verifier: VERIFIER, redirect_uri: 'https://evil.example' }),
			JSON.stringify({ code: 12, verifier: VERIFIER }),
			JSON.stringify({ code: 'has space', verifier: VERIFIER }),
			JSON.stringify({ code: 'abcdef0123456789abcd', verifier: 'short' }),
			JSON.stringify({ code: 'abcdef0123456789abcd', verifier: 'a'.repeat(129) }),
		];
		for (const body of bad) {
			const gh = github({ access_token: 'x' });
			expect((await handleExchange(post(body), ENV, gh)).status, body).toBe(400);
			expect(gh).not.toHaveBeenCalled();
		}
	});

	it('refuses a body that is too long, before reading it', async () => {
		const r = await handleExchange(post('x'.repeat(MAX_BODY + 1)), ENV, github({}));
		expect(r.status).toBe(413);
	});

	it('says only "refused" when GitHub refuses, and only "unreachable" when it cannot be reached', async () => {
		const refused = await handleExchange(post(GOOD), ENV, github({ error: 'bad_verification_code', error_description: 'the code is wrong' }));
		expect(refused.status).toBe(400);
		expect(JSON.parse(refused.body)).toEqual({ error: 'refused' });
		const down = await handleExchange(
			post(GOOD),
			ENV,
			vi.fn(async () => Promise.reject(new Error('socket hang up'))),
		);
		expect(down.status).toBe(502);
		expect(JSON.parse(down.body)).toEqual({ error: 'unreachable' });
		const odd = await handleExchange(
			post(GOOD),
			ENV,
			vi.fn(async () => ({ json: async () => Promise.reject(new Error('not json')) }) as unknown as Response),
		);
		expect(odd.status).toBe(502);
	});

	it('says it is misconfigured, without saying what is missing, and never asks GitHub', async () => {
		const gh = github({});
		const r = await handleExchange(post(GOOD), { ...ENV, GITHUB_CLIENT_ID: undefined }, gh);
		expect(r.status).toBe(500);
		expect(r.body).not.toContain('GITHUB_CLIENT_ID');
		expect(gh).not.toHaveBeenCalled();
	});

	it('logs nothing of the code or the token, and tells no cache to keep a reply', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const r = await handleExchange(post(GOOD), ENV, github({ access_token: 'ghu_x' }));
		expect(log).not.toHaveBeenCalled();
		expect(err).not.toHaveBeenCalled();
		expect(r.headers['cache-control']).toBe('no-store');
		log.mockRestore();
		err.mockRestore();
	});
});
