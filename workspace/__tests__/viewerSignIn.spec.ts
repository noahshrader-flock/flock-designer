import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { type SignInWindow, challengeOf, finishSignIn, signedInJustNow, startSignIn, takeNote } from '../src/viewer/signIn';

/** Signing in on the published page (PUBLISHED_COMMENTS_PLAN, 3.1): to GitHub with PKCE, and back with a one-time code. */

const SITE = 'https://noahshrader-flock.github.io/flock-designer/';
const CONFIG = {
	clientId: 'Iv23li0GrlmvH5bs6nZy',
	exchange: 'https://dsnr-auth.vercel.app/api/exchange',
	redirect: SITE,
	authorize: 'https://github.com/login/oauth/authorize',
};

/** A tab: its address, its storage, where it was sent, and what its address became. */
const tab = (href: string, kept: Record<string, string> = {}) => {
	const store = new Map(Object.entries(kept));
	const win = {
		location: { href, assign: vi.fn(), replace: vi.fn() },
		history: { replaceState: vi.fn((_d: unknown, _u: string, url: string) => void (win.location.href = url)) },
		sessionStorage: {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
		},
		crypto: webcrypto as unknown as Crypto,
	};
	return { win: win as SignInWindow & typeof win, store };
};

/** A tab that has started a sign-in from `back`, as `startSignIn` leaves it. */
const started = async (back = `${SITE}alert-history/v2/i1/`) => {
	const before = tab(back);
	await startSignIn(CONFIG, before.win);
	const sentTo = new URL(before.win.location.assign.mock.calls[0]?.[0] as string);
	return { kept: Object.fromEntries(before.store), sentTo, pending: JSON.parse(before.store.get('dsnr.sign-in') ?? '{}') };
};

const exchange = (reply: unknown) => vi.fn(async () => ({ json: async () => reply }) as Response);

describe('signing in on the published page', () => {
	it('sends the person to GitHub with the client, the site’s address, a state, and the hash of a verifier kept in the tab', async () => {
		const { sentTo, pending } = await started();
		expect(sentTo.origin + sentTo.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(sentTo.searchParams.get('client_id')).toBe('Iv23li0GrlmvH5bs6nZy');
		expect(sentTo.searchParams.get('redirect_uri')).toBe(SITE);
		expect(sentTo.searchParams.get('code_challenge_method')).toBe('S256');
		expect(sentTo.searchParams.get('state')).toBe(pending.state);
		expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
		// GitHub is told the verifier's hash, never the verifier.
		expect(sentTo.searchParams.get('code_challenge')).toBe(await challengeOf({ crypto: webcrypto } as unknown as SignInWindow, pending.verifier));
		expect(sentTo.toString()).not.toContain(pending.verifier);
		expect(pending.back).toBe(`${SITE}alert-history/v2/i1/`);
	});

	it('makes a new state and verifier each time', async () => {
		const [a, b] = [await started(), await started()];
		expect(a.pending.state).not.toBe(b.pending.state);
		expect(a.pending.verifier).not.toBe(b.pending.verifier);
	});

	it('trades the code and verifier for a token, keeps it, takes both out of the address, and goes back where it started', async () => {
		const { kept, pending } = await started();
		const back = tab(`${SITE}?code=abc123&state=${pending.state}`, kept);
		const keep = vi.fn();
		const fn = exchange({ access_token: 'ghu_token', token_type: 'bearer', expires_in: 28800 });
		expect(await finishSignIn(CONFIG, back.win, keep, fn)).toBe('signed-in');
		expect(keep).toHaveBeenCalledWith('ghu_token');
		const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(CONFIG.exchange);
		expect(JSON.parse(init.body as string)).toEqual({ code: 'abc123', verifier: pending.verifier });
		expect(back.win.location.href).toBe(SITE);
		expect(back.win.location.replace).toHaveBeenCalledWith(`${SITE}alert-history/v2/i1/`);
		// Used once: nothing is left to finish again, and nothing to say.
		expect(back.store.has('dsnr.sign-in')).toBe(false);
		expect(takeNote(back.win)).toBeNull();
		expect(signedInJustNow(back.win)).toBe(true);
	});

	it('refuses a code whose state it did not make, or when it started nothing, and asks no one', async () => {
		const { kept } = await started();
		for (const [href, store] of [
			[`${SITE}?code=abc&state=forged`, kept],
			[`${SITE}?code=abc`, kept],
			[`${SITE}?code=abc&state=anything`, {}],
		] as const) {
			const back = tab(href, store);
			const fn = exchange({ access_token: 'x' });
			const keep = vi.fn();
			expect(await finishSignIn(CONFIG, back.win, keep, fn)).toBe('refused');
			expect(fn).not.toHaveBeenCalled();
			expect(keep).not.toHaveBeenCalled();
			expect(back.win.location.href).toBe(SITE);
			expect(takeNote(back.win)).toBe('refused');
		}
	});

	it('says a cancelled sign-in was cancelled, and goes back', async () => {
		const { kept, pending } = await started();
		const back = tab(`${SITE}?error=access_denied&error_description=denied&state=${pending.state}`, kept);
		expect(await finishSignIn(CONFIG, back.win, vi.fn(), exchange({}))).toBe('cancelled');
		expect(back.win.location.href).toBe(SITE);
		expect(back.win.location.replace).toHaveBeenCalledWith(pending.back);
		expect(takeNote(back.win)).toBe('cancelled');
		// Said once.
		expect(takeNote(back.win)).toBeNull();
	});

	it('says it failed when the function refuses or cannot be reached, and keeps no token', async () => {
		for (const fn of [exchange({ error: 'refused' }), vi.fn(async () => Promise.reject(new Error('offline')))]) {
			const { kept, pending } = await started();
			const back = tab(`${SITE}?code=abc&state=${pending.state}`, kept);
			const keep = vi.fn();
			expect(await finishSignIn(CONFIG, back.win, keep, fn)).toBe('failed');
			expect(keep).not.toHaveBeenCalled();
			expect(takeNote(back.win)).toBe('failed');
		}
	});

	it('goes back only to a page of this site', async () => {
		const { kept, pending } = await started('https://evil.example/');
		const back = tab(`${SITE}?code=abc&state=${pending.state}`, kept);
		await finishSignIn(CONFIG, back.win, vi.fn(), exchange({ access_token: 'x' }));
		expect(back.win.location.replace).not.toHaveBeenCalled();
	});

	it('does nothing on a page GitHub is not sending the person back to', async () => {
		const plain = tab(`${SITE}alert-history/`);
		expect(await finishSignIn(CONFIG, plain.win, vi.fn(), exchange({}))).toBeNull();
		expect(plain.win.history.replaceState).not.toHaveBeenCalled();
	});
});
