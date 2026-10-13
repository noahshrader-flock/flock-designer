import { type Fetcher, type GitHubApi, callApi, loginOf } from '../host/github';
import type { PinEvent } from '../shared/contract';
import {
	CANCEL_PICK_SCRIPT,
	PICK_SCRIPT,
	ROUTE_SCRIPT,
	SINGLE_PAGE,
	focusScript,
	readMarkers,
	readPick,
	readPinMessage,
	resolveScript,
} from '../shared/pageScripts';
import type { CommentStore, PageSurface } from '../renderer/comments/surfaces';
import { toResult } from '../shared/result';
import type { RepoRef } from '../shared/repoRef';
import { ReviewThreads } from '../host/reviewThreads';

/**
 * The comments experience on a prototype's published page: the browser's side of what the app does through its main
 * process. GitHub is reached with the app's own code (`ReviewThreads`, `callApi`), given a token instead of the app's
 * sign-in, so a thread is found, made and written exactly as the app does it. The page is the frame the prototype is
 * in, and the same pick and pin scripts run in it.
 */

/** GitHub's API, as the person whose token this is. */
export const tokenApi = (token: string, fetcher: Fetcher = fetch as unknown as Fetcher): GitHubApi => ({
	api: (path, init = {}) => callApi(token, { path, ...init }, fetcher),
});

/** One iteration's comments, on GitHub. `branch` is its key, `prototype/<project>/<name>`, which names its thread. */
export const browserComments = (github: GitHubApi, ref: RepoRef, { projectId, branch }: { projectId: string; branch: string }): CommentStore => {
	const threads = new ReviewThreads(github, ref);
	return {
		read: () => toResult(threads.readComments(branch)),
		// No picture of the spot: a page cannot take one of itself.
		post: (body, anchor) => toResult(threads.postComment(projectId, branch, body, anchor, null)),
		resolve: (comment, resolved) => toResult(threads.setResolved(comment, resolved)),
		remove: (comment) => toResult(threads.deleteComment(comment).then(() => null)),
		move: (comment, anchor) => toResult(threads.moveComment(comment, anchor)),
		viewer: async () => {
			return loginOf(github).catch(() => null);
		},
		// A prototype has no commit; what it was made against is its iteration, which the thread already says.
		version: async () => '',
	};
};

type FrameWindow = Window & { eval(code: string): unknown; console: Console; __fdHeard?: boolean };

/**
 * The prototype's frame, as the page the comments are left on. It is served from the same site as this, so the scripts
 * run in it directly; the pins report through its console, as they do in the app, and are listened for here.
 */
export const framePage = (frame: HTMLIFrameElement): PageSurface & { route(): Promise<string> } => {
	const nonce = crypto.randomUUID();
	const listeners = new Set<(e: PinEvent) => void>();
	const win = (): FrameWindow | null => frame.contentWindow as FrameWindow | null;
	/** The pins' reports, heard from the frame's console. Once per document: a reload is a new one. */
	const listen = (w: FrameWindow) => {
		if (w.__fdHeard) return;
		w.__fdHeard = true;
		const original = w.console.debug.bind(w.console);
		w.console.debug = (...args: unknown[]) => {
			const event = typeof args[0] === 'string' ? readPinMessage(args[0], nonce) : null;
			if (event) for (const l of listeners) l(event);
			else original(...args);
		};
	};
	const run = async <T>(code: string): Promise<T | undefined> => {
		const w = win();
		if (!w) return undefined;
		listen(w);
		try {
			return (await w.eval(SINGLE_PAGE + code)) as T;
		} catch {
			return undefined;
		}
	};
	return {
		pick: () =>
			toResult(
				run<unknown>(PICK_SCRIPT)
					.then((raw) => readPick(raw))
					.then((spot) => (spot ? { ...spot, picture: null } : null)),
			),
		cancelPick: () => run(CANCEL_PICK_SCRIPT),
		showMarkers: (items) => toResult(run<unknown>(resolveScript(items, nonce)).then((raw) => readMarkers(raw, items))),
		focusMarker: (id) => run(focusScript(id)),
		onPinEvent: (listener) => {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},
		/** Where the frame is now: when it changes, the pins are drawn again. */
		route: async () => String((await run<unknown>(ROUTE_SCRIPT)) ?? ''),
	};
};

/** Where the token is kept: this browser only, for this site. */
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
