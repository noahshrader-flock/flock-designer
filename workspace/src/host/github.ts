import type { DeviceCodeStart, GitHubUser } from '../shared/contract';
import { asRecord } from '../shared/json';
import { errorText } from '../shared/result';
import { HostError } from './hostError';
import { HOST } from '../shared/vocabulary';

/**
 * GitHub's device flow, and the slice of the REST API the app uses.
 *
 * Device flow because this is a desktop app: it needs no client secret, so there
 * is no server of ours anywhere in the design. Verified against the real app on
 * 2026-10-05 -- sign-in, issue creation, commenting, and that the token cannot
 * see a repository the app is not installed on.
 *
 * Tokens last 8 hours and arrive with a refresh token. That is the reason
 * `withToken` exists rather than callers holding a token: a reviewer part way
 * through a session must not be thrown back to a sign-in screen.
 */

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';

/**
 * All the app needs of the host's API: a signed-in call to its API. The app's session is one; so is `gh` on the command line, and a
 * token in a browser on the published site.
 */
export interface GitHubApi {
	api(path: string, init?: { method?: string; body?: unknown }): Promise<unknown>;
}

/** Who `api` is signed in as, by their login, or null when it does not say. Throws when it cannot be asked. */
export const loginOf = async (api: GitHubApi): Promise<string | null> => {
	const login = asRecord(await api.api('/user')).login;
	return typeof login === 'string' ? login : null;
};

/** Raised when the person must sign in again -- the refresh token is spent or revoked. */
export class ReauthRequired extends HostError {
	constructor(message = `Sign in to ${HOST} again.`) {
		super(message, undefined, 'reauth');
		this.name = 'ReauthRequired';
	}
}

export interface StoredToken {
	accessToken: string;
	/** Epoch ms. */
	expiresAt: number;
	refreshToken?: string;
	refreshExpiresAt?: number;
}

export interface Fetcher {
	(
		url: string,
		init?: { method?: string; headers?: Record<string, string>; body?: string },
	): Promise<{
		status: number;
		/** Present on a real response; GitHub puts the id support asks for in `x-github-request-id`. */
		headers?: { get(name: string): string | null };
		json(): Promise<unknown>;
		text(): Promise<string>;
	}>;
}

/** The real fetch, as the session uses it: every call to GitHub given up on after 30 seconds rather than left to hang. */
export const networkFetch: Fetcher = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }) as ReturnType<Fetcher>;

/** Step one: ask GitHub for a code the person types into github.com/login/device. */
export const startDeviceFlow = async (clientId: string, fetcher: Fetcher): Promise<DeviceCodeStart> => {
	const res = await fetcher(DEVICE_CODE_URL, {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({ client_id: clientId }),
	});
	const body = asRecord(await res.json());
	if (typeof body.device_code !== 'string' || typeof body.user_code !== 'string') {
		throw new HostError(
			typeof body.error_description === 'string'
				? body.error_description
				: `${HOST} did not return a device code. Check the client ID, and that device flow is enabled on the app.`,
			res.status,
		);
	}
	return {
		deviceCode: body.device_code,
		userCode: body.user_code,
		verificationUri: typeof body.verification_uri === 'string' ? body.verification_uri : 'https://github.com/login/device',
		expiresInSeconds: typeof body.expires_in === 'number' ? body.expires_in : 900,
		intervalSeconds: typeof body.interval === 'number' ? body.interval : 5,
	};
};

const tokenFromResponse = (body: Record<string, unknown>, now: number): StoredToken => ({
	accessToken: String(body.access_token),
	// GitHub returns 8 hours today. Trust the response rather than the number.
	expiresAt: now + (typeof body.expires_in === 'number' ? body.expires_in : 8 * 3600) * 1000,
	...(typeof body.refresh_token === 'string' ? { refreshToken: body.refresh_token } : {}),
	...(typeof body.refresh_token_expires_in === 'number' ? { refreshExpiresAt: now + body.refresh_token_expires_in * 1000 } : {}),
});

/**
 * Step two: poll until the person authorizes, or the attempt ends.
 *
 * `authorization_pending` is the normal case and means keep waiting;
 * `slow_down` means GitHub wants a longer interval and is not an error.
 */
export const pollForToken = async (
	clientId: string,
	start: DeviceCodeStart,
	fetcher: Fetcher,
	deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<StoredToken> => {
	const now = deps.now ?? (() => Date.now());
	const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	const deadline = now() + start.expiresInSeconds * 1000;
	let interval = start.intervalSeconds;

	while (now() < deadline) {
		await sleep(interval * 1000);
		const res = await fetcher(TOKEN_URL, {
			method: 'POST',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_id: clientId,
				device_code: start.deviceCode,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			}),
		});
		const body = asRecord(await res.json());

		if (typeof body.access_token === 'string') {
			return tokenFromResponse(body, now());
		}
		switch (body.error) {
			case 'authorization_pending':
				continue;
			case 'slow_down':
				interval = typeof body.interval === 'number' ? body.interval : interval + 5;
				continue;
			case 'expired_token':
				throw new HostError('The sign-in code expired. Start again.');
			case 'access_denied':
				throw new HostError(`Sign-in was canceled on ${HOST}.`);
			default:
				throw new HostError(typeof body.error_description === 'string' ? body.error_description : `${HOST} refused the sign-in.`, res.status);
		}
	}
	throw new HostError('The sign-in code expired. Start again.');
};

export const refreshToken = async (
	clientId: string,
	token: StoredToken,
	fetcher: Fetcher,
	now: () => number = () => Date.now(),
): Promise<StoredToken> => {
	if (!token.refreshToken) {
		throw new ReauthRequired();
	}
	const res = await fetcher(TOKEN_URL, {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			grant_type: 'refresh_token',
			refresh_token: token.refreshToken,
		}),
	});
	const body = asRecord(await res.json());
	if (typeof body.access_token !== 'string') {
		// An OAuth error (`bad_refresh_token`, and the like) means the refresh token is no good: sign in again. Anything
		// else, a server error or a proxy's page, may pass, so it must not end the session.
		if (typeof body.error === 'string') {
			throw new ReauthRequired();
		}
		throw new HostError(`${HOST} could not renew the sign-in just now. Try again in a moment.`, res.status);
	}
	return tokenFromResponse(body, now());
};

/** Refreshed a minute early, so a call cannot start on a token that expires mid-flight. */
export const isExpired = (token: StoredToken, now: number): boolean => token.expiresAt - 60_000 <= now;

export interface ApiCall {
	path: string;
	method?: string;
	body?: unknown;
}

/**
 * Reads kept with the tag GitHub gave them (`ETag`), so the same read asked again sends the tag and, when nothing changed,
 * gets "not modified" back, which GitHub does not count against the hourly limit. Kept per token, so one person's reads
 * never answer another's; bounded, the oldest dropped first. Writes are never kept.
 */
export class ReadCache {
	private readonly reads = new Map<string, { etag: string; body: unknown }>();
	constructor(private readonly most = 2000) {}
	private key = (token: string, path: string) => `${token}\u0000${path}`;
	get(token: string, path: string): { etag: string; body: unknown } | undefined {
		return this.reads.get(this.key(token, path));
	}
	put(token: string, path: string, etag: string, body: unknown): void {
		const key = this.key(token, path);
		this.reads.delete(key);
		this.reads.set(key, { etag, body });
		if (this.reads.size > this.most) this.reads.delete(this.reads.keys().next().value as string);
	}
}

/** When GitHub says to come back, in words: a time of day for the hourly limit, a short while for a slowdown. */
const rateLimited = (status: number, message: string, headers?: { get(name: string): string | null }): HostError | null => {
	const remaining = headers?.get('x-ratelimit-remaining');
	const retryAfter = Number(headers?.get('retry-after'));
	const limited = status === 429 || (status === 403 && (remaining === '0' || /rate limit/i.test(message)));
	if (!limited) return null;
	if (Number.isFinite(retryAfter) && retryAfter > 0) {
		const minutes = Math.max(1, Math.round(retryAfter / 60));
		return new HostError(
			`${HOST} is slowing requests down for a moment. Try again in about ${minutes === 1 ? 'a minute' : `${minutes} minutes`}.`,
			status,
			'rateLimited',
		);
	}
	const reset = Number(headers?.get('x-ratelimit-reset'));
	const at = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
	return new HostError(
		`${HOST}'s hourly limit for your account is used up. ${at ? `It comes back at ${at}.` : 'It comes back within the hour.'}`,
		status,
		'rateLimited',
	);
};

export const callApi = async (token: string, call: ApiCall, fetcher: Fetcher, cache?: ReadCache): Promise<unknown> => {
	const reading = (call.method ?? 'GET') === 'GET';
	const kept = reading ? cache?.get(token, call.path) : undefined;
	// A call that never reached GitHub (offline, a proxy that hung up) is said as one, in its own words.
	const res = await fetcher(`${API}${call.path}`, {
		method: call.method ?? 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...(kept ? { 'If-None-Match': kept.etag } : {}),
			...(call.body === undefined ? {} : { 'Content-Type': 'application/json' }),
		},
		...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
	}).catch((err: unknown) => {
		throw new HostError(errorText(err), undefined, 'unreachable');
	});
	if (res.status === 401) {
		throw new ReauthRequired();
	}
	// Not modified: what was read before, unchanged, and free.
	if (res.status === 304 && kept) return kept.body;
	if (res.status >= 400) {
		// Read once as text: a body is read a single time, and when it is not JSON (a bare 500, a proxy's page) what
		// it says is all there is to go on.
		const raw = (await res.text().catch(() => '')).trim();
		let detail: Record<string, unknown> = {};
		try {
			detail = asRecord(JSON.parse(raw));
		} catch {
			// Not JSON: `raw` is kept for the message below.
		}
		const message = typeof detail.message === 'string' ? detail.message : '';
		const limit = rateLimited(res.status, message, res.headers);
		if (limit) throw limit;

		// GitHub's own wording for a missing permission is "Resource not accessible
		// by integration", which tells you nothing about which permission or where
		// to set it. Name both -- this cost a round trip the first time it happened.
		if (res.status === 403 && /not accessible by integration/i.test(message)) {
			const writing = call.method !== undefined && call.method !== 'GET';
			const needed =
				call.path.includes('/contents/') || call.path.includes('/branches')
					? writing
						? 'Contents (read and write)'
						: 'Contents (read-only)'
					: call.path.includes('/issues')
						? 'Issues (read and write)'
						: 'an additional repository permission';
			throw new HostError(
				`The ${HOST} App is missing the ${needed} permission. Add it under the app's ` +
					'Permissions & events, then approve the update on the installation.',
				res.status,
			);
		}
		if (res.status === 404) {
			// Indistinguishable from a repository that does not exist, so say both.
			throw new HostError(`Not found, or this app is not installed on it: ${call.path}`, res.status);
		}
		// With no message of its own, say which call it was (saving one comment can take several), what came back,
		// and the request id, so a failure that is GitHub's can be reported to them and one that is ours can be found.
		const id = res.headers?.get('x-github-request-id');
		const what = raw ? `: ${raw.replace(/\s+/g, ' ').slice(0, 200)}` : '';
		const which = `${call.method ?? 'GET'} ${call.path.replace(/\?.*$/, '')}`;
		throw new HostError(message || `${HOST} returned ${res.status} for ${which}${what}${id ? ` (request ${id})` : ''}`, res.status);
	}
	// "No Content": a delete worked and there is nothing to read. Parsing it would fail a call that succeeded.
	if (res.status === 204) return null;
	const body = await res.json();
	const etag = reading ? res.headers?.get('etag') : null;
	if (cache && etag) cache.put(token, call.path, etag, body);
	return body;
};

export const readUser = async (token: string, fetcher: Fetcher): Promise<GitHubUser> => {
	const me = asRecord(await callApi(token, { path: '/user' }, fetcher));
	return {
		login: String(me.login ?? ''),
		name: typeof me.name === 'string' ? me.name : null,
		avatarUrl: typeof me.avatar_url === 'string' ? me.avatar_url : null,
	};
};
