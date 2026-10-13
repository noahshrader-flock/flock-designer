import type { WorkspaceApi } from '../../src/shared/contract';
import { createApi } from '../../src/shared/workspaceApi';
import type { HostMessage, PanelMessage } from '../src/messages';

/**
 * The window's API in DSNR's panel: the app's own `createApi`, carried by webview messages. A call goes out with an id
 * and its promise resolves with the answer that comes back with that id; an event reaches whoever listens for it by name.
 * `post` sends to the extension; `listen` is given what the extension sends.
 */
export const connectWorkspace = (post: (message: PanelMessage) => void, listen: (listener: (message: unknown) => void) => void): WorkspaceApi => {
	let next = 0;
	const waiting = new Map<number, (result: unknown) => void>();
	const listeners = new Map<string, Set<(payload: unknown) => void>>();
	listen((raw) => {
		const m = raw as HostMessage;
		if (m?.type === 'answer') {
			waiting.get(m.id)?.(m.result);
			waiting.delete(m.id);
		} else if (m?.type === 'event') for (const l of listeners.get(m.name) ?? []) l(m.payload);
	});
	return createApi(
		(name, args) =>
			new Promise((resolve) => {
				const id = ++next;
				waiting.set(id, resolve);
				post({ type: 'call', id, name, args });
			}),
		(name, listener) => {
			const set = listeners.get(name) ?? new Set();
			set.add(listener);
			listeners.set(name, set);
			return () => void set.delete(listener);
		},
	);
};
