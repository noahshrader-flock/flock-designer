import type { CommentAnchor, CommentRef, Result, ReviewComment, SignInState } from '../shared/contract';
import { ASK_PATH, type EditorTheme, KEY_FRAGMENT, KEY_HEADER, type RelayAsk, type RelayCall, isKey, readRelayTell } from '../shared/reviewRelay';
import type { CommentStore } from './comments/surfaces';
import { isPrototypeName } from '../shared/prototypeNames';
import { isThisMachine } from '../shared/thisMachine';

/** DSNR's review tab in VS Code, as the page asks it: a call by name, answered with its Result. */
export interface Relay {
	ask(name: RelayCall, args: unknown[]): Promise<Result<unknown>>;
}

type PageWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'> & {
	parent: { postMessage(message: unknown, origin: string): void };
};

/** A VS Code webview's origin: where DSNR's review tab is. */
const WEBVIEW = 'vscode-webview://';
/** Served from this machine: only such a page is a review DSNR frames or opens; a published page never is. */
export const isServedHere = (location: Pick<Location, 'hostname'>): boolean => isThisMachine(location.hostname);

/**
 * Listens for DSNR's review tab, when this page is served from this machine and in a frame, and gives `onRelay` the way
 * to ask it once it says hello. The tab is the parent, from VS Code, that said hello first: from then on only it is
 * asked, and only its answers, in their shape, are taken; so is its word of VS Code's theme, to `onTheme`. Returns how
 * to stop listening.
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
		// VS Code's theme: only from the tab that said hello.
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

/** Where a page opened in the browser keeps its key: this tab only, on the bar's own address, which no prototype's page is on. */
const KEPT = 'dsnr.review-key';

type OpenedWindow = {
	location: Pick<Location, 'hostname' | 'hash' | 'pathname' | 'search'>;
	history: Pick<History, 'replaceState'>;
	sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
};

/**
 * The key a review opened in the browser from DSNR carries (BROWSER_COMMENTS_PLAN 2.1), or null: in its link's fragment
 * the first time, then kept for this tab, since moving to another version loses the fragment. Taken out of the address
 * once kept, so it is in no address that is copied or kept. Only on a page served from this machine.
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

/** What a page opened in the browser says when DSNR did not answer it, by why. */
const NOT_ANSWERED = {
	refused: 'DSNR in VS Code no longer knows this page: VS Code was reloaded since it was opened. Use Open in browser on the prototype again.',
	closed: 'DSNR in VS Code is not answering: it may have been closed. Open VS Code, then use Open in browser on the prototype again.',
	garbled: 'DSNR in VS Code answered with something this page cannot read.',
};

/**
 * DSNR, asked through this machine's server by a page opened in the browser from it (BROWSER_COMMENTS_PLAN 2.1), as a
 * review tab asks it through VS Code: the same asks, by the same names, answered with VS Code's sign-in, so no token is
 * ever here. Each answer is taken only if it is exactly the answer to that ask; anything else is said, in words.
 */
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

/**
 * Where a page in the browser goes after Address (BROWSER_COMMENTS_PLAN 3.2): the version it showed its change in, as the
 * site lays them out under the project (`projectHref`, from this page, `here`); this page again when the change is in it;
 * null for what is not a version's name.
 */
export const versionAddress = (projectHref: string, name: string, here: string): string | null =>
	isPrototypeName(name) ? new URL(`${projectHref}${name}/`, here).href : null;

/** Who a sign-in answer says is signed in: their login, or null. */
export const loginIn = (answer: Result<unknown>): string | null => {
	const state = answer.ok ? (answer.value as SignInState) : null;
	return state?.state === 'signedIn' ? state.user.login : null;
};

/**
 * One version's comments through DSNR (`CommentStore`): the core's own comment calls, made with the extension's
 * sign-in, so a comment is found, made and written exactly it. `branch` is the version's key.
 */
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
