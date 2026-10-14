import type { WorkspaceApi } from '../../src/shared/contract';
import type { HostMessage } from '../src/messages';
import { vscode } from './vscode';
import { connectWorkspace } from './workspace';

/**
 * Whether a message is the extension's: not one from a page this one frames (a design system's story, its type
 * specimen), which runs the library's code and could otherwise pass itself off as the extension. Those are served from
 * this machine's server, an `http:` origin; VS Code's own messages never are.
 */
export const fromExtension = (e: Pick<MessageEvent, 'origin' | 'source'>): boolean =>
	!/^https?:/.test(e.origin) && ![...document.querySelectorAll('iframe')].some((f) => f.contentWindow !== null && f.contentWindow === e.source);

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
