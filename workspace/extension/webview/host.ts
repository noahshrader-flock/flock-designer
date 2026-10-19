import type { WorkspaceApi } from '../../src/shared/contract';
import type { HostMessage, PageAsks } from '../src/messages';
import { vscode } from './vscode';
import { connectPage } from './workspace';

/**
 * Whether a message is the extension's: VS Code's host frame posts it on this page's own origin (`vscode-webview:`), and
 * no page this one frames (a design system's story, its type specimen, which run the library's code), nor any frame
 * inside one, has that origin: theirs is this machine's server, or none. Not who sent it: VS Code makes `window.parent`
 * this page itself.
 */
const fromExtension = (e: MessageEvent): boolean => e.origin === location.origin;

/** Everything the extension sends the page, to each listener, as it comes; nothing a framed page sends. Heard from the first listener on. */
const listeners = new Set<(message: HostMessage) => void>();
let hearing = false;

/** Hears what the extension sends; returns how to stop. */
export const onHost = (listener: (message: HostMessage) => void): (() => void) => {
	if (!hearing) {
		hearing = true;
		window.addEventListener('message', (e: MessageEvent) => {
			if (!fromExtension(e)) return;
			for (const l of listeners) l(e.data as HostMessage);
		});
	}
	listeners.add(listener);
	return () => void listeners.delete(listener);
};

let page: { workspace: WorkspaceApi; asks: PageAsks } | undefined;
/** The page's calls, over the extension's messages, made once, when first used. */
const connected = () =>
	(page ??= connectPage(
		(m) => vscode().postMessage(m),
		(l) => onHost(l),
	));
/** The core's calls, from a page: the one way every page and hook reaches the core. */
export const workspace = (): WorkspaceApi => connected().workspace;
/** The extension's own asks, from a page (`PageAsks`): a component's tab, a review, the change being tried. */
export const asks = (): PageAsks => connected().asks;
