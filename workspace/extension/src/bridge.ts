import type * as VsCode from 'vscode';
import type { EventSink, Route } from '../../src/main/handle';
import type { EventName, InvokeName, Result, WorkspaceApi } from '../../src/shared/contract';
import { createApi } from '../../src/shared/workspaceApi';
import type { HostMessage, PanelMessage } from './messages';

type Webview = Pick<VsCode.Webview, 'postMessage'>;
type Call = Extract<PanelMessage, { type: 'call' }>;

/**
 * Answers a call the panel made (already read, `readMessage`) from the core's table, as Electron's IPC answers the app's
 * window: the core's own Result, back by the call's id.
 */
export const answerCall = async (webview: Webview, routes: ReadonlyMap<InvokeName, Route>, call: Call): Promise<void> => {
	await webview.postMessage({ type: 'answer', id: call.id, result: await callRoute(routes, call.name, call.args) } satisfies HostMessage);
};

/** A call to the core's table by its name, as the window makes one: its Result, or that nothing answers it here. */
export const callRoute = async (routes: ReadonlyMap<InvokeName, Route>, name: InvokeName, args: unknown[]): Promise<Result<unknown>> => {
	const route = routes.get(name);
	return route ? await route(...args) : { ok: false, error: `${name} is not answered in VS Code yet.` };
};

/**
 * The panels open now: each is told every event the core sends (`sink`), and whatever the shell says to all of them. The
 * extension itself hears the core's events here too (`listen`), as its own flows need them (an agent's log).
 */
export class Panels {
	private readonly open = new Set<Webview>();
	/** The pages that have said they listen, and what is for them until one does (`show`). */
	private readonly listening = new Set<Webview>();
	private held: HostMessage[] = [];
	private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

	add(webview: Webview): VsCode.Disposable {
		this.open.add(webview);
		return {
			dispose: () => {
				this.open.delete(webview);
				this.listening.delete(webview);
			},
		};
	}

	/**
	 * Something for the panel to show (a dialog): sent to a page that is listening, else held for the first that does, as
	 * a message posted before then is lost. The view is shown first by whoever asks.
	 */
	show(message: HostMessage): void {
		if (this.listening.size === 0) this.held.push(message);
		else for (const w of this.listening) void w.postMessage(message);
	}

	/** A page said it listens: what was held for it is sent. */
	ready(webview: Webview): void {
		this.listening.add(webview);
		const held = this.held;
		this.held = [];
		for (const message of held) void webview.postMessage(message);
	}

	/** A page is gone (its view was hidden, and loads again when shown): nothing is sent until it says it listens. */
	unready(webview: Webview): void {
		this.listening.delete(webview);
	}

	post(message: HostMessage): void {
		for (const w of this.open) void w.postMessage(message);
	}

	listen(name: EventName, listener: (payload: unknown) => void): () => void {
		const set = this.listeners.get(name) ?? new Set();
		set.add(listener);
		this.listeners.set(name, set);
		return () => void set.delete(listener);
	}

	readonly sink: EventSink = (name, payload) => {
		for (const l of this.listeners.get(name) ?? []) l(payload);
		this.post({ type: 'event', name, payload });
	};
}

/**
 * The window's API in the extension itself: the app's own `createApi` over the core's table (`routes`) and its events
 * (`events.listen`), so a flow the extension runs (starting a prototype) calls the core exactly as a page does.
 */
export const hostApi = (routes: () => ReadonlyMap<InvokeName, Route>, events: Pick<Panels, 'listen'>): WorkspaceApi =>
	createApi(
		(name, args) => callRoute(routes(), name, args),
		(name, listener) => events.listen(name, listener),
	);
