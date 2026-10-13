import type { WorkspaceApi } from '../../src/shared/contract';
import type { HostMessage } from '../src/messages';
import { vscode } from './vscode';
import { connectWorkspace } from './workspace';

/** Everything the extension sends the page, to each listener, as it comes. */
const listeners = new Set<(message: HostMessage) => void>();
window.addEventListener('message', (e: MessageEvent) => {
	for (const l of listeners) l(e.data as HostMessage);
});

/** Hears what the extension sends; returns how to stop. */
export const onHost = (listener: (message: HostMessage) => void): (() => void) => {
	listeners.add(listener);
	return () => void listeners.delete(listener);
};

let api: WorkspaceApi | undefined;
/** The window's API in the panel, over the extension's messages: made once, when first used. */
export const workspace = (): WorkspaceApi =>
	(api ??= connectWorkspace(
		(m) => vscode().postMessage(m),
		(l) => onHost(l),
	));
