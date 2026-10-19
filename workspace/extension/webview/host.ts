import type { WorkspaceApi } from '../../src/shared/contract';
import type { HostMessage, PageAsks } from '../src/messages';
import { vscode } from './vscode';
import { connectPage } from './workspace';

/**
 * Whether a message is the extension's: VS Code's host frame posts on this page's own origin (`vscode-webview:`), which no
 * page framed here (a story, a type specimen, running the library's code) has. Not by sender: VS Code makes `window.parent`
 * this page itself.
 */
const fromExtension = (e: MessageEvent): boolean => e.origin === location.origin;

/** Nothing a framed page sends reaches these; heard from the first listener on. */
const listeners = new Set<(message: HostMessage) => void>();
let hearing = false;

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
const connected = () =>
	(page ??= connectPage(
		(m) => vscode().postMessage(m),
		(l) => onHost(l),
	));
export const workspace = (): WorkspaceApi => connected().workspace;
export const asks = (): PageAsks => connected().asks;
