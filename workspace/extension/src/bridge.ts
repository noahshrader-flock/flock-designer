import type * as VsCode from 'vscode';
import type { EventSink, Route } from '../../src/main/handle';
import type { InvokeName } from '../../src/shared/contract';
import type { HostMessage, PanelMessage } from './messages';

type Webview = Pick<VsCode.Webview, 'postMessage'>;
type Call = Extract<PanelMessage, { type: 'call' }>;

/**
 * Answers a call the panel made (already read, `readMessage`) from the core's table, as Electron's IPC answers the app's
 * window: the core's own Result, back by the call's id.
 */
export const answerCall = async (webview: Webview, routes: ReadonlyMap<InvokeName, Route>, call: Call): Promise<void> => {
	const route = routes.get(call.name);
	const result = route ? await route(...call.args) : { ok: false, error: `${call.name} is not answered in VS Code yet.` };
	await webview.postMessage({ type: 'answer', id: call.id, result } satisfies HostMessage);
};

/** The panels open now: each is told every event the core sends (`sink`), and whatever the shell says to all of them. */
export class Panels {
	private readonly open = new Set<Webview>();

	add(webview: Webview): VsCode.Disposable {
		this.open.add(webview);
		return { dispose: () => void this.open.delete(webview) };
	}

	post(message: HostMessage): void {
		for (const w of this.open) void w.postMessage(message);
	}

	readonly sink: EventSink = (name, payload) => this.post({ type: 'event', name, payload });
}
