import type { WorkspaceApi } from '../../src/shared/contract';
import { createApi } from '../../src/shared/workspaceApi';
import { type HostMessage, type PageAsks, type PanelMessage, asksOver } from '../src/messages';

export const connectPage = (
	post: (message: PanelMessage) => void,
	listen: (listener: (message: unknown) => void) => void,
): { workspace: WorkspaceApi; asks: PageAsks } => {
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
	const invoke = (name: Extract<PanelMessage, { type: 'call' }>['name'], args: unknown[]) =>
		new Promise((resolve) => {
			const id = ++next;
			waiting.set(id, resolve);
			post({ type: 'call', id, name, args });
		});
	return {
		workspace: createApi(invoke, (name, listener) => {
			const set = listeners.get(name) ?? new Set();
			set.add(listener);
			listeners.set(name, set);
			return () => void set.delete(listener);
		}),
		asks: asksOver(invoke),
	};
};
