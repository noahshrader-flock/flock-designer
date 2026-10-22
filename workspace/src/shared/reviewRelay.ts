import type { InvokeName, Result } from './contract';
import { isVersionName } from './versionNames';
import { hasExactly } from './validate';

/**
 * A review page framed in VS Code comments through the extension's sign-in, not a token of its own. Only these calls can be
 * asked, and each side reads the other in exactly its shape; one renamed or removed in the contract fails the build here.
 */
const REVIEW_CALLS = [
	'signInState',
	'readComments',
	'postComment',
	'moveComment',
	'resolveComment',
	'deleteComment',
] as const satisfies readonly InvokeName[];
/** `baseBehind` and `refresh`: how far the version's base is behind its branch, and Refresh to latest. */
const EXTENSION_CALLS = ['signIn', 'address', 'baseBehind', 'refresh'] as const;
export const RELAY_CALLS = [...REVIEW_CALLS, ...EXTENSION_CALLS] as const;
export type RelayCall = (typeof RELAY_CALLS)[number];

export interface RelayAsk {
	dsnr: 'ask';
	id: number;
	name: RelayCall;
	args: unknown[];
}

/** By the class VS Code puts on a page's body. */
export const THEME_KINDS = ['vscode-light', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light'] as const;
export type ThemeKind = (typeof THEME_KINDS)[number];

/** Colours by their variables' names (`--vscode-foreground`). */
export interface EditorTheme {
	kind: ThemeKind;
	colors: Record<string, string>;
}

export const isDarkTheme = (kind: ThemeKind): boolean => kind === 'vscode-dark' || kind === 'vscode-high-contrast';

/**
 * `hello` tells the page it is framed by DSNR; `scheme` comes then and whenever the theme changes; `page` that a version's
 * page was saved, and the site rebuilt with it.
 */
export type RelayTell =
	| { dsnr: 'hello' }
	| { dsnr: 'scheme'; theme: EditorTheme }
	| { dsnr: 'page'; name: string }
	| { dsnr: 'answer'; id: number; result: Result<unknown> };

const CALLS = new Set<string>(RELAY_CALLS);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const isResult = (v: unknown): v is Result<unknown> =>
	typeof v === 'object' &&
	v !== null &&
	((v as { ok?: unknown }).ok === true ? 'value' in v : (v as { ok?: unknown }).ok === false && typeof (v as { error?: unknown }).error === 'string');

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

/**
 * What the bar says to its tab as it starts listening, so it is told hello whenever it starts: the tab says hello as its
 * frame loads, which a bar reloaded quickly can start listening after. It carries nothing.
 */
export const LISTENING = { dsnr: 'listening' } as const;
export const isListening = (raw: unknown): boolean =>
	typeof raw === 'object' &&
	raw !== null &&
	(raw as { dsnr?: unknown }).dsnr === LISTENING.dsnr &&
	hasExactly(raw as Record<string, unknown>, ['dsnr']);

/** The tab sends only these. */
export const isThemeColor = (name: string, value: unknown): value is string =>
	/^--vscode-[\w-]+$/.test(name) && typeof value === 'string' && value.length <= 400;

const isColors = (v: unknown): v is Record<string, string> =>
	typeof v === 'object' &&
	v !== null &&
	!Array.isArray(v) &&
	Object.keys(v).length <= 2000 &&
	Object.entries(v).every(([name, value]) => isThemeColor(name, value));

const isTheme = (v: unknown): v is EditorTheme =>
	typeof v === 'object' &&
	v !== null &&
	hasExactly(v as Record<string, unknown>, ['kind', 'colors']) &&
	(THEME_KINDS as readonly unknown[]).includes((v as { kind?: unknown }).kind) &&
	isColors((v as { colors?: unknown }).colors);

export const readRelayTell = (raw: unknown): RelayTell | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.dsnr === 'hello') return hasExactly(m, ['dsnr']) ? { dsnr: 'hello' } : null;
	if (m.dsnr === 'scheme') return hasExactly(m, ['dsnr', 'theme']) && isTheme(m.theme) ? { dsnr: 'scheme', theme: m.theme } : null;
	if (m.dsnr === 'page')
		return hasExactly(m, ['dsnr', 'name']) && typeof m.name === 'string' && isVersionName(m.name) ? { dsnr: 'page', name: m.name } : null;
	return m.dsnr === 'answer' && hasExactly(m, ['dsnr', 'id', 'result']) && isId(m.id) && isResult(m.result)
		? { dsnr: 'answer', id: m.id, result: m.result }
		: null;
};

/**
 * A review opened in the browser asks through this machine's server: a `POST` at `ASK_PATH` with the key its link's
 * fragment carried in `KEY_HEADER`. A key is base64url, 128 bits or more: only characters no link is ever re-encoded in.
 */
export const ASK_PATH = '/_dsnr/ask';
export const KEY_HEADER = 'x-dsnr-key';
export const KEY_FRAGMENT = 'dsnr-key-';
export const isKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(v);
