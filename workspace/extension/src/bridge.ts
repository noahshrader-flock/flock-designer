import type * as VsCode from 'vscode';
import { type EventSink, type Route, served } from '../../src/main/handle';
import type { EventName, InvokeName, Result, TokenEdit, WorkspaceApi } from '../../src/shared/contract';
import { createApi } from '../../src/shared/workspaceApi';
import type { ComponentLink, HostMessage, PanelMessage } from './messages';

type Webview = Pick<VsCode.Webview, 'postMessage'>;
type Call = Extract<PanelMessage, { type: 'call' }>;

/**
 * Answers a call the panel made (already read, `readMessage`) from the core's table: the core's own Result, back by
 * the call's id.
 */
export const answerCall = async (webview: Webview, routes: ReadonlyMap<InvokeName, Route>, call: Call): Promise<void> => {
	await webview.postMessage({ type: 'answer', id: call.id, result: await callRoute(routes, call.name, call.args) } satisfies HostMessage);
};

/** A call to the core's table by its name, as the window makes one: its Result, or that nothing answers it here. */
export const callRoute = async (routes: ReadonlyMap<InvokeName, Route>, name: InvokeName, args: unknown[]): Promise<Result<unknown>> => {
	const route = routes.get(name);
	return route ? await route(...args) : { ok: false, error: `${name} is not answered in VS Code.` };
};

/**
 * The panels open now: each is told every event the core sends (`sink`), and whatever the shell says to all of them. The
 * extension itself hears the core's events here too (`listen`), as its own flows need them (an agent's log).
 */
export class Panels {
	private readonly open = new Set<Webview>();
	/** The pages that have said they listen, and what is for them until one does (`show`). */
	private readonly listening = new Set<Webview>();
	private held: HostMessage | null = null;
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
	 * A panel view's page, from when VS Code makes it until it throws it away. It is kept while hidden
	 * (`PANEL_VIEW_OPTIONS`), so being hidden is not being gone: it still listens, and what is asked for meanwhile is sent to
	 * it, to show when it is shown again. Taking it for gone when hidden held every dialog from then on, as a kept page never
	 * loads again to say it listens.
	 */
	attach(view: { webview: Webview; onDidDispose(listener: () => void): unknown }): void {
		const listening = this.add(view.webview);
		view.onDidDispose(() => listening.dispose());
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

	/** A page said it listens: what was held for it is sent. */
	ready(webview: Webview): void {
		this.listening.add(webview);
		const held = this.held;
		this.held = null;
		if (held) void webview.postMessage(held);
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
 * The window's API in the extension itself: the app's own `createApi` over the core's table (`routes`) and its events
 * (`events.listen`), so a flow the extension runs (starting a prototype) calls the core exactly as a page does.
 */
export const hostApi = (routes: () => ReadonlyMap<InvokeName, Route>, events: Pick<Panels, 'listen'>): WorkspaceApi =>
	createApi(
		(name, args) => callRoute(routes(), name, args),
		(name, listener) => events.listen(name, listener),
	);

/**
 * What the design system's pages ask (ELECTRON_MIGRATION_PLAN 6.1 to 6.3), from the panel or a design system's tab: a
 * component's tab and its links, Primitives, the voice and tone, a token's own file, and the change to the tokens being
 * tried (`TokenTrial`), which is the extension's.
 */
export interface DesignSystemAsks {
	openComponent: (id: string) => Promise<void>;
	componentLink: (id: string, link: ComponentLink) => Promise<void>;
	openPrimitives: () => Promise<void>;
	openVoiceAndTone: () => Promise<void>;
	openLibrarySource: (file: string, line: number) => Promise<void>;
	edits: () => TokenEdit[];
	setEdits: (edits: unknown[]) => void;
}

/**
 * What any DSNR page may ask, the panel or a design system's tab: a call to the core, answered from its table, and the
 * design system's own asks. Says whether it was one of these; the rest are the panel's alone.
 */
export const answerPage = async (webview: Webview, message: PanelMessage, asks: DesignSystemAsks): Promise<boolean> => {
	switch (message.type) {
		case 'call':
			await answerCall(webview, served(), message);
			return true;
		case 'open-component':
			await asks.openComponent(message.id);
			return true;
		case 'component-link':
			await asks.componentLink(message.id, message.link);
			return true;
		case 'open-primitives':
			await asks.openPrimitives();
			return true;
		case 'open-voice-and-tone':
			await asks.openVoiceAndTone();
			return true;
		case 'open-library-source':
			await asks.openLibrarySource(message.file, message.line);
			return true;
		case 'token-edits':
			asks.setEdits(message.edits);
			return true;
		default:
			return false;
	}
};
