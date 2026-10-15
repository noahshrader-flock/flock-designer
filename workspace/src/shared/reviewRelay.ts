import type { Result } from './contract';
import { hasExactly } from './validate';

/**
 * A prototype's review page, framed in DSNR's review tab in VS Code, comments through the extension's sign-in rather than
 * a token of its own (ELECTRON_MIGRATION_PLAN 2A, 4.2): the page asks the tab, the tab asks the extension, and the answer
 * comes back the same way. The calls are the core's own, by their names in the contract, with their arguments, which the
 * core checks where it answers them; and the extension's own two, signing in and Address. Nothing else can be asked, and
 * each side reads what the other sends in exactly its shape.
 */
export const RELAY_CALLS = [
	'signInState',
	'readComments',
	'postComment',
	'moveComment',
	'resolveComment',
	'deleteComment',
	'signIn',
	'address',
] as const;
export type RelayCall = (typeof RELAY_CALLS)[number];

/** What the page asks: a call by its name, with its arguments, answered by its id. */
export interface RelayAsk {
	dsnr: 'ask';
	id: number;
	name: RelayCall;
	args: unknown[];
}

/**
 * What the tab tells the page: that it is there (`hello`, so the page knows it is framed by DSNR), whether VS Code is dark
 * (`scheme`, once it is there and whenever the theme changes, so the page's bar follows it), or an answer.
 */
export type RelayTell = { dsnr: 'hello' } | { dsnr: 'scheme'; dark: boolean } | { dsnr: 'answer'; id: number; result: Result<unknown> };

const CALLS = new Set<string>(RELAY_CALLS);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const isResult = (v: unknown): v is Result<unknown> =>
	typeof v === 'object' &&
	v !== null &&
	((v as { ok?: unknown }).ok === true ? 'value' in v : (v as { ok?: unknown }).ok === false && typeof (v as { error?: unknown }).error === 'string');

/** What the page asked, or null for anything that is not exactly one of its calls. */
export const readRelayAsk = (raw: unknown): RelayAsk | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	return m.dsnr === 'ask' &&
		hasExactly(m, ['dsnr', 'id', 'name', 'args']) &&
		isId(m.id) &&
		typeof m.name === 'string' &&
		CALLS.has(m.name) &&
		Array.isArray(m.args)
		? { dsnr: 'ask', id: m.id, name: m.name as RelayCall, args: m.args }
		: null;
};

/** What the tab told the page, or null for anything that is not exactly a hello, a scheme or an answer. */
export const readRelayTell = (raw: unknown): RelayTell | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.dsnr === 'hello') return hasExactly(m, ['dsnr']) ? { dsnr: 'hello' } : null;
	if (m.dsnr === 'scheme') return hasExactly(m, ['dsnr', 'dark']) && typeof m.dark === 'boolean' ? { dsnr: 'scheme', dark: m.dark } : null;
	return m.dsnr === 'answer' && hasExactly(m, ['dsnr', 'id', 'result']) && isId(m.id) && isResult(m.result)
		? { dsnr: 'answer', id: m.id, result: m.result }
		: null;
};

/**
 * A review opened in the browser from VS Code asks the same way, through this machine's server (BROWSER_COMMENTS_PLAN):
 * a `POST` at `ASK_PATH` on the bar's own address, with the key its link carried (after `KEY_FRAGMENT` in its fragment)
 * in `KEY_HEADER`. A key is base64url, 128 bits or more: only characters no link is ever re-encoded in.
 */
export const ASK_PATH = '/_dsnr/ask';
export const KEY_HEADER = 'x-dsnr-key';
export const KEY_FRAGMENT = 'dsnr-key-';
export const isKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(v);
