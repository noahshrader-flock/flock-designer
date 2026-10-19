import type { GitHubUser, SignInState } from '../shared/contract';
import { asRecord } from '../shared/json';
import { errorText } from '../shared/result';
import { HostError } from './hostError';
import { HOST } from '../shared/vocabulary';

/** The person signs in through their shell (VS Code's own GitHub sign-in); nothing here holds a token or asks for one. */

const API = 'https://api.github.com';

export interface GitHubApi {
	api(path: string, init?: { method?: string; body?: unknown }): Promise<unknown>;
}

export interface GitHubAccount extends GitHubApi {
	restore(): Promise<SignInState>;
	state(): SignInState;
	signOut(): void;
}

const userFrom = (me: Record<string, unknown>): GitHubUser => ({
	login: String(me.login ?? ''),
	name: typeof me.name === 'string' ? me.name : null,
	avatarUrl: typeof me.avatar_url === 'string' ? me.avatar_url : null,
});

export const userOf = async (api: GitHubApi): Promise<GitHubUser> => userFrom(asRecord(await api.api('/user')));

export const loginOf = async (api: GitHubApi): Promise<string | null> => (await userOf(api)).login || null;

export class ReauthRequired extends HostError {
	constructor(message = `Sign in to ${HOST} again.`) {
		super(message, undefined, 'reauth');
		this.name = 'ReauthRequired';
	}
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

/** Given up on after 30 seconds rather than left to hang. */
export const networkFetch: Fetcher = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }) as ReturnType<Fetcher>;

export interface ApiCall {
	path: string;
	method?: string;
	body?: unknown;
}

/**
 * A "not modified" answer to a read sent with its `ETag` is not counted against GitHub's hourly limit. Kept per token, so
 * one person's reads never answer another's.
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

		// GitHub's own wording for a missing permission, "Resource not accessible by integration", says nothing about which
		// permission or where to set it, so name both.
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
	return userFrom(asRecord(await callApi(token, { path: '/user' }, fetcher)));
};
