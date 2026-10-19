import type * as VsCode from 'vscode';
import { type EventSink, type Route, served } from '../../src/core/handle';
import type { EventName, InvokeName, Result, WorkspaceApi } from '../../src/shared/contract';
import { createApi } from '../../src/shared/workspaceApi';
import { type AskName, type HostMessage, type PanelMessage, type SharedName, type SharedValues, isAsk, readMessage } from './messages';
import { Shared } from './sharedValues';

type Webview = Pick<VsCode.Webview, 'postMessage'>;
type Call = Extract<PanelMessage, { type: 'call' }>;

/**
 * Answers a call a page made (already read, `readMessage`), back by the call's id: the core's from its table, an ask of
 * the extension's from its own (`asks`, `askRoutes`). An ask that failed is said (`failed`), as the extension's own flows
 * say what went wrong; a call's failure is the page's to show.
 */
export const answerCall = async (
	webview: Webview,
	tables: { core: ReadonlyMap<InvokeName, Route>; asks: ReadonlyMap<AskName, Route> },
	call: Call,
	failed: (err: unknown) => void,
): Promise<void> => {
	const result = isAsk(call.name) ? await callRoute(tables.asks, call.name, call.args) : await callRoute(tables.core, call.name, call.args);
	if (isAsk(call.name) && !result.ok) failed(new Error(result.error));
	await webview.postMessage({ type: 'answer', id: call.id, result } satisfies HostMessage);
};

/** A call to a table by its name, as a page makes one: its Result, or that nothing answers it here. */
export const callRoute = async <N extends string>(routes: ReadonlyMap<N, Route>, name: N, args: unknown[]): Promise<Result<unknown>> => {
	const route = routes.get(name);
	return route ? await route(...args) : { ok: false, error: `${name} is not answered in VS Code.` };
};

/**
 * The pages open now, the panel and each design system's tab: each is told every event the core sends (`sink`), every
 * value they share (`share`), and whatever the shell says to all of them. The extension itself hears the core's events
 * here too (`listen`), as its own flows need them (an agent's log).
 */
export class Panels {
	private readonly open = new Set<Webview>();
	/** The pages that have said they listen, and what is for them until one does (`show`). */
	private readonly listening = new Set<Webview>();
	private held: HostMessage | null = null;
	/** What a page is told, once it listens, of each value every page shows the same. */
	private readonly shared: (() => HostMessage)[] = [];
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
	 * A panel view's page, from when VS Code makes it until it throws it away. Hidden is not gone (`PANEL_VIEW_OPTIONS`
	 * keeps it): it still listens and is sent what is asked for meanwhile, since a kept page never loads again to say it
	 * listens.
	 */
	attach(view: { webview: Webview; onDidDispose(listener: () => void): unknown }): void {
		const listening = this.add(view.webview);
		view.onDidDispose(() => listening.dispose());
	}

	/** A value every page shows the same, starting at `value`: kept here, and told to every page (`Shared`). */
	share<K extends SharedName>(name: K, value: SharedValues[K], kept?: (value: SharedValues[K]) => void): Shared<K> {
		const made = new Shared(name, value, (m) => this.post(m), kept);
		this.shared.push(() => made.message());
		return made;
	}

	/**
	 * Something for the panel to show (a dialog): sent to a page that is listening, else held for the first that does, as
	 * a message posted before then is lost. A later request replaces one held that no page saw: only the latest is wanted.
	 * The view is shown first by whoever asks.
	 */
	show(message: HostMessage): void {
		if (this.listening.size === 0) this.held = message;
		else for (const w of this.listening) void w.postMessage(message);
	}

	/** A page said it listens: every value they share, then what was held for it. */
	async ready(webview: Webview): Promise<void> {
		this.listening.add(webview);
		for (const message of this.shared) await webview.postMessage(message());
		const held = this.held;
		this.held = null;
		if (held) await webview.postMessage(held);
	}

	/** A page is reloading (a rebuild while developing): nothing is sent until it says it listens again. */
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
 * What any DSNR page sends, the panel or a design system's tab, answered the one way: that it listens (`ready`), or a call,
 * the core's or an ask of the extension's. Anything else is not one, and is dropped.
 */
export const receivePage = async (
	panels: Pick<Panels, 'ready'>,
	webview: Webview,
	raw: unknown,
	asks: ReadonlyMap<AskName, Route>,
	failed: (err: unknown) => void,
): Promise<void> => {
	const message = readMessage(raw);
	if (!message) return;
	try {
		if (message.type === 'ready') await panels.ready(webview);
		else await answerCall(webview, { core: served(), asks }, message, failed);
	} catch (err) {
		failed(err);
	}
};

/**
 * The window's API in the extension itself: the same `createApi` the pages use, over the core's table (`routes`) and its events
 * (`events.listen`), so a flow the extension runs (starting a prototype) calls the core exactly as a page does.
 */
export const hostApi = (routes: () => ReadonlyMap<InvokeName, Route>, events: Pick<Panels, 'listen'>): WorkspaceApi =>
	createApi(
		(name, args) => callRoute(routes(), name, args),
		(name, listener) => events.listen(name, listener),
	);
