import type { WorkspaceApi } from '../../src/shared/contract';
import type { HostMessage } from '../src/messages';
import { vscode } from './vscode';
import { connectWorkspace } from './workspace';

/**
 * Whether a message is the extension's: VS Code's host frame posts it on this page's own origin (`vscode-webview:`), and
 * no page this one frames (a design system's story, its type specimen, which run the library's code), nor any frame
 * inside one, has that origin: theirs is this machine's server, or none. Not who sent it: VS Code makes `window.parent`
 * this page itself.
 */
const fromExtension = (e: MessageEvent): boolean => e.origin === location.origin;

/** Everything the extension sends the page, to each listener, as it comes; nothing a framed page sends. */
const listeners = new Set<(message: HostMessage) => void>();
window.addEventListener('message', (e: MessageEvent) => {
	if (!fromExtension(e)) return;
	for (const l of listeners) l(e.data as HostMessage);
});

/** Hears what the extension sends; returns how to stop. */
export const onHost = (listener: (message: HostMessage) => void): (() => void) => {
	listeners.add(listener);
	return () => void listeners.delete(listener);
};

let api: WorkspaceApi | undefined;
/**
 * The window's API in the panel, over the extension's messages: made once, when first used, and kept where the app keeps
 * it (`window.workspace`), so the app's own hooks (`useCover`) reach it as they do in the app.
 */
export const workspace = (): WorkspaceApi => {
	if (!api) {
		api = connectWorkspace(
			(m) => vscode().postMessage(m),
			(l) => onHost(l),
		);
		Object.defineProperty(window, 'workspace', { value: api, configurable: true });
	}
	return api;
};
// Made at once, so what reads `window.workspace` (the app's hooks) never runs before it is there.
workspace();
