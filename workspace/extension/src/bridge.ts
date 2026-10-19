import type * as VsCode from 'vscode';
import { type EventSink, type Route, served } from '../../src/core/handle';
import type { EventName, InvokeName, Result, WorkspaceApi } from '../../src/shared/contract';
import { createApi } from '../../src/shared/workspaceApi';
import { type AskName, type HostMessage, type PanelMessage, type SharedName, type SharedValues, isAsk, readMessage } from './messages';
import { Shared } from './sharedValues';

type Webview = Pick<VsCode.Webview, 'postMessage'>;
type Call = Extract<PanelMessage, { type: 'call' }>;

/** An ask that failed is said (`failed`), as the extension's own flows are; a call's failure is the page's to show. */
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

export const callRoute = async <N extends string>(routes: ReadonlyMap<N, Route>, name: N, args: unknown[]): Promise<Result<unknown>> => {
	const route = routes.get(name);
	return route ? await route(...args) : { ok: false, error: `${name} is not answered in VS Code.` };
};

export class Panels {
	private readonly open = new Set<Webview>();
	private readonly listening = new Set<Webview>();
	private held: HostMessage | null = null;
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
	 * Hidden is not gone (`PANEL_VIEW_OPTIONS` keeps it): it still listens until disposed, since a kept page never loads
	 * again to say it listens.
	 */
	attach(view: { webview: Webview; onDidDispose(listener: () => void): unknown }): void {
		const listening = this.add(view.webview);
		view.onDidDispose(() => listening.dispose());
	}

	share<K extends SharedName>(name: K, value: SharedValues[K], kept?: (value: SharedValues[K]) => void): Shared<K> {
		const made = new Shared(name, value, (m) => this.post(m), kept);
		this.shared.push(() => made.message());
		return made;
	}

	/**
	 * Held for the first page that listens when none does, as a message posted before then is lost; a later one replaces
	 * it, since only the latest is wanted. Whoever asks shows the view first.
	 */
	show(message: HostMessage): void {
		if (this.listening.size === 0) this.held = message;
		else for (const w of this.listening) void w.postMessage(message);
	}

	async ready(webview: Webview): Promise<void> {
		this.listening.add(webview);
		for (const message of this.shared) await webview.postMessage(message());
		const held = this.held;
		this.held = null;
		if (held) await webview.postMessage(held);
	}

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

/** The same `createApi` the pages use, so a flow the extension runs calls the core exactly as a page does. */
export const hostApi = (routes: () => ReadonlyMap<InvokeName, Route>, events: Pick<Panels, 'listen'>): WorkspaceApi =>
	createApi(
		(name, args) => callRoute(routes(), name, args),
		(name, listener) => events.listen(name, listener),
	);
