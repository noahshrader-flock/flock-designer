/**
 * Signing in to comment on a published prototype with GitHub's own page, one redirect each way (PKCE). The `state` and
 * verifier are kept in this tab, on the bar's own origin, which a prototype framed with no origin cannot reach. GitHub
 * comes back to the App's one redirect address, the site's front page, which sends the person on to where they started.
 */

import type { SignInConfig } from '../shared/signInConfig';

export type { SignInConfig };

/** What a finished sign-in says, kept for the page the person comes back to. */
export type SignInNote = 'cancelled' | 'refused' | 'failed' | 'ended';

/** What is kept in the tab between leaving for GitHub and coming back. */
const PENDING = 'dsnr.sign-in';
/** What the page the person comes back to says about how it went, when it did not go. */
const NOTE = 'dsnr.sign-in-note';
/** When the last sign-in finished: an ended token goes through GitHub again only when that was not just now. */
const AT = 'dsnr.signed-in-at';

export const NOTE_WORDS: Record<SignInNote, string> = {
	cancelled: 'Signing in was cancelled.',
	refused: 'That sign-in was not started from this page, so it was not used. Sign in again.',
	failed: 'GitHub could not sign you in just now. Try again.',
	ended: 'Your sign-in has ended. Sign in again to comment.',
};

/** What signing in uses of the page's window: its address, its tab's storage, and how to leave. */
export interface SignInWindow {
	location: { href: string; assign(url: string): void; replace(url: string): void };
	history: { replaceState(data: unknown, unused: string, url: string): void };
	sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
	crypto: Pick<Crypto, 'getRandomValues' | 'subtle'>;
}

const base64url = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

const random = (win: SignInWindow, length: number): string => base64url(win.crypto.getRandomValues(new Uint8Array(length)));

/** The verifier's hash, as GitHub is told it (`S256`). */
export const challengeOf = async (win: SignInWindow, verifier: string): Promise<string> =>
	base64url(new Uint8Array(await win.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

/** Sends the person to GitHub to sign in, to come back to the page they are on. */
export const startSignIn = async (config: SignInConfig, win: SignInWindow): Promise<void> => {
	const state = random(win, 24);
	// 48 bytes is 64 characters: inside PKCE's 43 to 128.
	const verifier = random(win, 48);
	win.sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier, back: win.location.href }));
	const to = new URL(config.authorize);
	to.searchParams.set('client_id', config.clientId);
	to.searchParams.set('redirect_uri', config.redirect);
	to.searchParams.set('state', state);
	to.searchParams.set('code_challenge', await challengeOf(win, verifier));
	to.searchParams.set('code_challenge_method', 'S256');
	win.location.assign(to.toString());
};

const readPending = (win: SignInWindow): { state: string; verifier: string; back: string } | null => {
	try {
		const kept = JSON.parse(win.sessionStorage.getItem(PENDING) ?? 'null') as unknown;
		if (kept === null || typeof kept !== 'object') return null;
		const { state, verifier, back } = kept as Record<string, unknown>;
		return typeof state === 'string' && typeof verifier === 'string' && typeof back === 'string' ? { state, verifier, back } : null;
	} catch {
		return null;
	}
};

/** Only a page of this site is gone back to: a kept address on any other is not followed. */
const sameSite = (back: string, config: SignInConfig): boolean => {
	try {
		const at = new URL(back);
		const site = new URL(config.redirect);
		return at.origin === site.origin && at.pathname.startsWith(site.pathname);
	} catch {
		return false;
	}
};

/**
 * Finishes a sign-in GitHub has sent the person back from, if it has: the token, kept by `keep`, then back to the page they
 * started on; or, when it did not go, a note for that page. Null when the address is not GitHub coming back.
 */
export const finishSignIn = async (
	config: SignInConfig,
	win: SignInWindow,
	keep: (token: string) => void,
	fetcher: typeof fetch = fetch,
): Promise<'signed-in' | SignInNote | null> => {
	const at = new URL(win.location.href);
	const code = at.searchParams.get('code');
	const state = at.searchParams.get('state');
	const error = at.searchParams.get('error');
	if (code === null && error === null) return null;
	// Out of the address at once, whatever comes of it: a code is used once, and is nobody's to copy from the address bar.
	for (const name of ['code', 'state', 'error', 'error_description', 'error_uri']) at.searchParams.delete(name);
	win.history.replaceState(null, '', at.toString());
	const pending = readPending(win);
	win.sessionStorage.removeItem(PENDING);
	const outcome = await (async (): Promise<'signed-in' | SignInNote> => {
		if (error !== null) return 'cancelled';
		if (pending === null || state === null || state !== pending.state) return 'refused';
		try {
			const response = await fetcher(config.exchange, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code, verifier: pending.verifier }),
			});
			const reply = (await response.json()) as { access_token?: unknown };
			if (typeof reply.access_token !== 'string') return 'failed';
			keep(reply.access_token);
			win.sessionStorage.setItem(AT, String(Date.now()));
			return 'signed-in';
		} catch {
			return 'failed';
		}
	})();
	if (outcome !== 'signed-in') win.sessionStorage.setItem(NOTE, outcome);
	if (pending !== null && sameSite(pending.back, config)) win.location.replace(pending.back);
	return outcome;
};

/** What the last sign-in left to say, said once. */
export const takeNote = (win: Pick<SignInWindow, 'sessionStorage'>): SignInNote | null => {
	const note = win.sessionStorage.getItem(NOTE);
	win.sessionStorage.removeItem(NOTE);
	return note === 'cancelled' || note === 'refused' || note === 'failed' || note === 'ended' ? note : null;
};

/** How long after a sign-in an ended token is said rather than sent through GitHub again, so a token GitHub keeps refusing never loops. */
const JUST_NOW_MS = 60_000;

/** Whether the last sign-in was just now, so a token that ends at once is not sent through GitHub again and again. */
export const signedInJustNow = (win: Pick<SignInWindow, 'sessionStorage'>, now = Date.now()): boolean =>
	now - Number(win.sessionStorage.getItem(AT) ?? 0) < JUST_NOW_MS;
