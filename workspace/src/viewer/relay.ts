import type { CommentAnchor, CommentRef, Result, ReviewComment, SignInState } from '../shared/contract';
import { type RelayAsk, type RelayCall, readRelayTell } from '../shared/reviewRelay';
import type { CommentStore } from '../renderer/comments/surfaces';

/** DSNR's review tab in VS Code, as the page asks it: a call by name, answered with its Result. */
export interface Relay {
	ask(name: RelayCall, args: unknown[]): Promise<Result<unknown>>;
}

type PageWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'> & {
	parent: { postMessage(message: unknown, origin: string): void };
};

/** A VS Code webview's origin: where DSNR's review tab is. */
const WEBVIEW = 'vscode-webview://';
/** Served from this machine: only such a page is a review DSNR frames; a published page never is. */
const LOCAL = new Set(['127.0.0.1', 'localhost']);

/**
 * Listens for DSNR's review tab, when this page is served from this machine and in a frame, and gives `onRelay` the way
 * to ask it once it says hello. The tab is the parent, from VS Code, that said hello first: from then on only it is
 * asked, and only its answers, in their shape, are taken. Returns how to stop listening.
 */
export const listenForDsnr = (win: PageWindow, onRelay: (relay: Relay) => void): (() => void) => {
	if ((win.parent as unknown) === win || !LOCAL.has(win.location.hostname)) return () => undefined;
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
		waiting.get(tell.id)?.(tell.result);
		waiting.delete(tell.id);
	};
	win.addEventListener('message', heard);
	return () => win.removeEventListener('message', heard);
};

/** Who a sign-in answer says is signed in: their login, or null. */
export const loginIn = (answer: Result<unknown>): string | null => {
	const state = answer.ok ? (answer.value as SignInState) : null;
	return state?.state === 'signedIn' ? state.user.login : null;
};

/**
 * One iteration's comments through DSNR (`CommentStore`): the core's own comment calls, made with the extension's
 * sign-in, so a comment is found, made and written exactly as the app does it. `branch` is the iteration's key.
 */
export const relayComments = (relay: Relay, { projectId, branch }: { projectId: string; branch: string }): CommentStore => ({
	read: () => relay.ask('readComments', [projectId, branch]) as Promise<Result<ReviewComment[]>>,
	// No picture of the spot: a page cannot take one of itself.
	post: (body: string, anchor: CommentAnchor) => relay.ask('postComment', [projectId, branch, body, anchor, null]) as Promise<Result<ReviewComment>>,
	resolve: (comment: CommentRef, resolved: boolean) => relay.ask('resolveComment', [comment, resolved]) as Promise<Result<ReviewComment>>,
	move: (comment: CommentRef, anchor: CommentAnchor) => relay.ask('moveComment', [comment, anchor]) as Promise<Result<ReviewComment>>,
	remove: (comment: CommentRef) => relay.ask('deleteComment', [comment]) as Promise<Result<null>>,
	viewer: async () => loginIn(await relay.ask('signInState', [])),
	// A prototype has no commit; what it was made against is its iteration, which the thread already says.
	version: async () => '',
});
