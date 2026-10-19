/**
 * Signing in to comment on a published prototype: GitHub's token endpoint takes no calls from a web page, so the page
 * sends its one-time `code` and PKCE `verifier` here to trade for the person's access token (never the refresh token).
 * Stores and logs nothing; plain functions over plain values, so it runs on any host and in a test.
 */

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** A request body is two short strings; anything larger is not one. */
export const MAX_BODY = 2048;

/** GitHub's one-time code is 20 hex characters; this allows its shape with room. */
const CODE = /^[A-Za-z0-9_-]{1,100}$/;
/** A PKCE verifier is 43 to 128 characters of the unreserved set (RFC 7636). */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

const json = (status, body, headers = {}) => ({ status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** The one body shape: exactly `{ code, verifier }`, each valid. Null for anything else. */
const parse = (text) => {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	const keys = Object.keys(value).sort();
	if (keys.length !== 2 || keys[0] !== 'code' || keys[1] !== 'verifier') return null;
	const { code, verifier } = value;
	return typeof code === 'string' && CODE.test(code) && typeof verifier === 'string' && VERIFIER.test(verifier) ? { code, verifier } : null;
};

/**
 * `request`: `{ method, origin, body }`, `body` already cut at `MAX_BODY + 1` by the caller so its length says whether it
 * was too long. `env`: `GITHUB_CLIENT_ID`, `ALLOWED_ORIGIN`, `REDIRECT_URI`, and `GITHUB_CLIENT_SECRET` if PKCE alone is
 * not enough for GitHub. Returns `{ status, headers, body }`.
 */
export const handleExchange = async ({ method, origin, body }, env, fetchImpl = fetch) => {
	const allowed = env.ALLOWED_ORIGIN;
	// Whoever is not our site is refused first, and gets no CORS header to be read by.
	if (!allowed || origin !== allowed) return json(403, { error: 'origin' }, { 'cache-control': 'no-store' });
	const cors = {
		'access-control-allow-origin': allowed,
		'access-control-allow-methods': 'POST, OPTIONS',
		'access-control-allow-headers': 'content-type',
		'access-control-max-age': '600',
		vary: 'Origin',
		'cache-control': 'no-store',
	};
	if (method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
	if (method !== 'POST') return json(405, { error: 'method' }, cors);
	if (body.length > MAX_BODY) return json(413, { error: 'size' }, cors);
	const sent = parse(body);
	if (sent === null) return json(400, { error: 'shape' }, cors);
	if (!env.GITHUB_CLIENT_ID || !env.REDIRECT_URI) return json(500, { error: 'misconfigured' }, cors);
	let reply;
	try {
		const response = await fetchImpl(GITHUB_TOKEN_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				client_id: env.GITHUB_CLIENT_ID,
				...(env.GITHUB_CLIENT_SECRET ? { client_secret: env.GITHUB_CLIENT_SECRET } : {}),
				code: sent.code,
				code_verifier: sent.verifier,
				// Ours, not the caller's: a code can only be traded for the address it was given to.
				redirect_uri: env.REDIRECT_URI,
			}),
			signal: AbortSignal.timeout(8000),
		});
		reply = await response.json();
	} catch {
		return json(502, { error: 'unreachable' }, cors);
	}
	// Only the access token goes back. GitHub's refresh token, its scope and anything else it said stay here, and are dropped.
	if (reply === null || typeof reply !== 'object' || typeof reply.access_token !== 'string') return json(400, { error: 'refused' }, cors);
	return json(
		200,
		{ access_token: reply.access_token, token_type: 'bearer', expires_in: typeof reply.expires_in === 'number' ? reply.expires_in : null },
		cors,
	);
};
