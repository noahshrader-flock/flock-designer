import { type Fetcher, type GitHubApi, callApi, loginOf } from '../codeHost/github';
import type { PinEvent } from '../shared/contract';
import { type PageCall, readPageTell } from '../shared/pageChannel';
import { readMarkers, readPick, readPinMessage } from './pageReaders';
import type { CommentStore, PageSurface } from './comments/surfaces';
import { toResult } from '../shared/result';
import type { RepoRef } from '../shared/repoRef';
import { ReviewThreads } from '../codeHost/reviewThreads';
import { hostErrorKind } from '../codeHost/hostError';

// GitHub is reached with DSNR's own code (`ReviewThreads`, `callApi`), so a thread is found, made and written exactly as in VS Code.

/** `onEnded` is told when GitHub says the token has ended. */
export const tokenApi = (token: string, fetcher: Fetcher = fetch as unknown as Fetcher, onEnded?: () => void): GitHubApi => ({
	api: (path, init = {}) =>
		callApi(token, { path, ...init }, fetcher).catch((err: unknown) => {
			if (onEnded && hostErrorKind(err) === 'reauth') onEnded();
			throw err;
		}),
});

/** `branch` is the version's key, `prototype/<prototype>/<name>`, which names its thread. */
export const browserComments = (
	github: GitHubApi,
	ref: RepoRef,
	{ prototypeId, branch, page }: { prototypeId: string; branch: string; page?: string | undefined },
): CommentStore => {
	const threads = new ReviewThreads(github, ref);
	const notAllowed = async (err: unknown): Promise<never> => {
		const kind = hostErrorKind(err);
		if (kind !== 'notFound' && kind !== 'forbidden') throw err;
		const who = await loginOf(github).catch(() => null);
		throw new Error(
			`${who ? `Signed in as ${who}, who` : 'This account'} has no access to ${ref.owner}/${ref.repo}, so cannot see or leave comments here. Sign out, and sign in as someone who has.`,
		);
	};
	return {
		read: () => toResult(threads.readComments(branch).catch(notAllowed)),
		// No picture of the spot: a page cannot take one of itself.
		post: (body, anchor) => toResult(threads.postComment(prototypeId, branch, body, anchor, null)),
		resolve: (comment, resolved) => toResult(threads.setResolved(comment, resolved)),
		remove: (comment) => toResult(threads.deleteComment(comment).then(() => null)),
		move: (comment, anchor) => toResult(threads.moveComment(comment, anchor)),
		viewer: async () => {
			return loginOf(github).catch(() => null);
		},
		// A prototype has no commit: what a comment was made against is its version, which the thread says, and its page.
		...(page ? { page } : {}),
	};
};

// Not for a pick, which waits for the person.
const ANSWER_MS = 10_000;

export type FramePage = PageSurface & {
	/** Told on each load, and at once when the page is up already. */
	onReady(listener: (route: string) => void): () => void;
	onRoute(listener: (route: string) => void): () => void;
	stop(): void;
};

/**
 * The frame is asked by message (`src/page/agent.ts`), never reached into. Only the frame's own window and address, with
 * the nonce said in each load's hello, are heard.
 */
export const framePage = (frame: HTMLIFrameElement, win: Window = window): FramePage => {
	const nonce = crypto.randomUUID();
	/**
	 * Such a page's messages come from the origin `null`, and the only address a message to it can name is `*`; its frame's
	 * own window and the nonce still say it is the page.
	 */
	const opaque = (): boolean => {
		const sandbox = frame.getAttribute('sandbox');
		return sandbox !== null && !sandbox.split(/\s+/).includes('allow-same-origin');
	};
	const address = (): string => {
		const src = frame.getAttribute('src');
		try {
			return src ? new URL(src, win.location.href).origin : win.location.origin;
		} catch {
			return win.location.origin;
		}
	};
	const origin = (): string => (opaque() ? 'null' : address());
	const target = (): string => (opaque() ? '*' : address());
	const pins = new Set<(e: PinEvent) => void>();
	const readies = new Set<(route: string) => void>();
	const routes = new Set<(route: string) => void>();
	const waiting = new Map<number, (value: unknown) => void>();
	let ready = false;
	let readyAt = '';
	let next = 1;

	const heard = (e: MessageEvent) => {
		if (e.source !== frame.contentWindow || e.origin !== origin()) return;
		const tell = readPageTell(e.data, nonce);
		if (!tell) return;
		if (tell.dsnr === 'page-ready') {
			ready = true;
			readyAt = tell.route;
			for (const l of readies) l(tell.route);
		} else if (tell.dsnr === 'page-route') for (const l of routes) l(tell.route);
		else if (tell.dsnr === 'page-answer') waiting.get(tell.id)?.(tell.value);
		else {
			const event = readPinMessage(tell.text, nonce);
			if (event) for (const l of pins) l(event);
		}
	};
	const hello = () => frame.contentWindow?.postMessage({ dsnr: 'page-ask', id: 0, call: 'hello', args: [nonce] }, target());
	const loaded = () => {
		// A new document: its agent knows nothing until it is said hello to, and nothing waits on the last one.
		ready = false;
		for (const resolve of waiting.values()) resolve(undefined);
		waiting.clear();
		hello();
	};
	win.addEventListener('message', heard);
	frame.addEventListener('load', loaded);
	// Already up, if it loaded before the bar: said hello to now.
	hello();

	const ask = <T>(call: PageCall, args: unknown[] = [], wait: number | null = ANSWER_MS): Promise<T | undefined> =>
		new Promise((resolve) => {
			const to = frame.contentWindow;
			if (!to || !ready) return resolve(undefined);
			const id = next++;
			waiting.set(id, (value) => {
				waiting.delete(id);
				resolve(value as T);
			});
			to.postMessage({ dsnr: 'page-ask', id, call, args }, target());
			if (wait !== null) setTimeout(() => waiting.get(id)?.(undefined), wait);
		});
	const on =
		<L>(set: Set<L>) =>
		(listener: L) => {
			set.add(listener);
			return () => void set.delete(listener);
		};
	return {
		pick: () =>
			toResult(
				ask<unknown>('pick', [], null)
					.then((raw) => readPick(raw))
					.then((spot) => (spot ? { ...spot, picture: null } : null)),
			),
		cancelPick: () => ask('cancel-pick'),
		showMarkers: (items) => toResult(ask<unknown>('draw-pins', [items]).then((raw) => readMarkers(raw, items))),
		focusMarker: (id) => ask('focus', [id]),
		onPinEvent: on(pins),
		onReady: (listener) => {
			if (ready) listener(readyAt);
			return on(readies)(listener);
		},
		onRoute: on(routes),
		stop: () => {
			win.removeEventListener('message', heard);
			frame.removeEventListener('load', loaded);
		},
	};
};

/**
 * A prototype's page cannot read the bar's storage: on the published site it is framed with no origin of its own
 * (`SANDBOX_BESIDE`), and in VS Code it is on another address.
 */
const TOKEN_KEY = 'dsnr.github-token';
export const savedToken = (): string | null => {
	try {
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
};
export const saveToken = (token: string | null): void => {
	try {
		if (token) localStorage.setItem(TOKEN_KEY, token);
		else localStorage.removeItem(TOKEN_KEY);
	} catch {
		// A browser that keeps nothing: the person signs in again next time.
	}
};
