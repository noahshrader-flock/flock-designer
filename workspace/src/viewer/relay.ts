import type { BaseBehind, CommentAnchor, CommentRef, DesignSystemBuild, Result, ReviewComment, SignInState } from '../shared/contract';
import { isObjectId } from '../shared/sha';
import { ASK_PATH, type EditorTheme, KEY_FRAGMENT, KEY_HEADER, type RelayAsk, type RelayCall, isKey, readRelayTell } from '../shared/reviewRelay';
import type { CommentStore } from './comments/surfaces';
import { isThisMachine } from '../shared/thisMachine';

export interface Relay {
	ask(name: RelayCall, args: unknown[]): Promise<Result<unknown>>;
}

type PageWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'> & {
	parent: { postMessage(message: unknown, origin: string): void };
};

const WEBVIEW = 'vscode-webview://';
/** Only a page served from this machine is a review DSNR frames or opens. */
export const isServedHere = (location: Pick<Location, 'hostname'>): boolean => isThisMachine(location.hostname);

/**
 * The tab is the VS Code parent that said hello first: from then on only it is asked, and only its well-formed answers
 * (and its word of VS Code's theme) are taken.
 */
export const listenForDsnr = (win: PageWindow, onRelay: (relay: Relay) => void, onTheme?: (theme: EditorTheme) => void): (() => void) => {
	if ((win.parent as unknown) === win || !isThisMachine(win.location.hostname)) return () => undefined;
	let tab: string | null = null;
	let next = 0;
	const waiting = new Map<number, (result: Result<unknown>) => void>();
	const ask = (name: RelayCall, args: unknown[]): Promise<Result<unknown>> =>
		new Promise((resolve) => {
			const id = ++next;
			waiting.set(id, resolve);
			win.parent.postMessage({ dsnr: 'ask', id, name, args } satisfies RelayAsk, tab as string);
		});
	const heard = (e: MessageEvent) => {
		if (e.source !== win.parent || !e.origin.startsWith(WEBVIEW) || (tab !== null && e.origin !== tab)) return;
		const tell = readRelayTell(e.data);
		if (tell === null) return;
		if (tell.dsnr === 'hello') {
			if (tab !== null) return;
			tab = e.origin;
			onRelay({ ask });
			return;
		}
		if (tell.dsnr === 'scheme') {
			if (tab !== null) onTheme?.(tell.theme);
			return;
		}
		waiting.get(tell.id)?.(tell.result);
		waiting.delete(tell.id);
	};
	win.addEventListener('message', heard);
	return () => win.removeEventListener('message', heard);
};

// This tab only, on the bar's own address, which no prototype's page is on.
const KEPT = 'dsnr.review-key';

type OpenedWindow = {
	location: Pick<Location, 'hostname' | 'hash' | 'pathname' | 'search'>;
	history: Pick<History, 'replaceState'>;
	sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
};

/**
 * In the link's fragment the first time, then kept for this tab, since moving to another version loses the fragment. Taken
 * out of the address once kept, so it is in no address that is copied or kept.
 */
export const keyFromAddress = (win: OpenedWindow): string | null => {
	if (!isServedHere(win.location)) return null;
	const given = win.location.hash.startsWith(`#${KEY_FRAGMENT}`) ? win.location.hash.slice(KEY_FRAGMENT.length + 1) : null;
	if (isKey(given)) {
		try {
			win.sessionStorage.setItem(KEPT, given);
		} catch {
			// A browser that keeps nothing: the key is still this page's, until it moves to another version.
		}
		win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}`);
		return given;
	}
	let kept: string | null = null;
	try {
		kept = win.sessionStorage.getItem(KEPT);
	} catch {
		kept = null;
	}
	return isKey(kept) ? kept : null;
};

const NOT_ANSWERED = {
	refused: 'DSNR in VS Code no longer knows this page: VS Code was reloaded since it was opened. Use Open in browser on the prototype again.',
	closed: 'DSNR in VS Code is not answering: it may have been closed. Open VS Code, then use Open in browser on the prototype again.',
	garbled: 'DSNR in VS Code answered with something this page cannot read.',
};

/** Answered with VS Code's sign-in, so no token is ever here. Each answer is taken only if it is exactly the answer to that ask. */
export const serverRelay = (key: string, fetcher: typeof fetch = fetch): Relay => {
	let next = 0;
	return {
		ask: async (name, args) => {
			const id = ++next;
			let res: Response;
			try {
				res = await fetcher(ASK_PATH, {
					method: 'POST',
					headers: { 'content-type': 'application/json', [KEY_HEADER]: key },
					body: JSON.stringify({ dsnr: 'ask', id, name, args } satisfies RelayAsk),
				});
			} catch {
				return { ok: false, error: NOT_ANSWERED.closed };
			}
			if (res.status === 403) return { ok: false, error: NOT_ANSWERED.refused };
			if (!res.ok) return { ok: false, error: `${NOT_ANSWERED.garbled} (${res.status})` };
			const tell = readRelayTell(await res.json().catch(() => null));
			return tell?.dsnr === 'answer' && tell.id === id ? tell.result : { ok: false, error: NOT_ANSWERED.garbled };
		},
	};
};

export const loginIn = (answer: Result<unknown>): string | null => {
	const state = answer.ok ? (answer.value as SignInState) : null;
	return state?.state === 'signedIn' ? state.user.login : null;
};

/** Taken only in exactly its shape, and only when it is behind: anything else shows nothing. */
export const behindIn = (answer: Result<unknown>): BaseBehind | null => {
	const v = (answer.ok ? answer.value : null) as Partial<BaseBehind> | null;
	return v !== null &&
		typeof v === 'object' &&
		typeof v.branch === 'string' &&
		isObjectId(v.commit) &&
		isObjectId(v.latest) &&
		typeof v.behind === 'number' &&
		Number.isSafeInteger(v.behind) &&
		v.behind > 0
		? { branch: v.branch, commit: v.commit, latest: v.latest, behind: v.behind }
		: null;
};

/** Taken only in exactly its shape: anything else shows no switch. */
export const designSystemBuildIn = (answer: Result<unknown>): DesignSystemBuild | null => {
	const v = (answer.ok ? answer.value : null) as Partial<DesignSystemBuild> | null;
	if (v === null || typeof v !== 'object' || (v.from !== 'installed' && v.from !== 'clone') || typeof v.pkg !== 'string') return null;
	const installed = typeof v.installed === 'string' ? v.installed : null;
	const c = v.clone as Partial<NonNullable<DesignSystemBuild['clone']>> | null | undefined;
	const clone =
		c && typeof c === 'object' && (typeof c.branch === 'string' || c.branch === null) && Number.isSafeInteger(c.changed)
			? { branch: c.branch ?? null, changed: c.changed as number }
			: null;
	return { from: v.from, pkg: v.pkg, installed, clone };
};

/** `branch` is the version's key. */
export const relayComments = (
	relay: Relay,
	{ projectId, branch, page }: { projectId: string; branch: string; page?: string | undefined },
): CommentStore => ({
	read: () => relay.ask('readComments', [projectId, branch]) as Promise<Result<ReviewComment[]>>,
	// No picture of the spot: a page cannot take one of itself.
	post: (body: string, anchor: CommentAnchor | null) =>
		relay.ask('postComment', [projectId, branch, body, anchor, null]) as Promise<Result<ReviewComment>>,
	resolve: (comment: CommentRef, resolved: boolean) => relay.ask('resolveComment', [comment, resolved]) as Promise<Result<ReviewComment>>,
	move: (comment: CommentRef, anchor: CommentAnchor) => relay.ask('moveComment', [comment, anchor]) as Promise<Result<ReviewComment>>,
	remove: (comment: CommentRef) => relay.ask('deleteComment', [comment]) as Promise<Result<null>>,
	viewer: async () => loginIn(await relay.ask('signInState', [])),
	// A prototype has no commit: what a comment was made against is its version, which the thread says, and its page.
	...(page ? { page } : {}),
});
