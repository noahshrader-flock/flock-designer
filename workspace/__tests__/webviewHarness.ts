import { SharedProvider } from '../extension/webview/shared';
import { type SharedName, type SharedValues, isAsk } from '../extension/src/messages';
import type { Catalog } from '../src/shared/contract';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach } from 'vitest';

/** Imported, it stands in `acquireVsCodeApi`, starts each test afresh and clears the page after. */

export const sent: { type: string; id?: number; name?: string; args?: unknown[]; [key: string]: unknown }[] = [];
export const kept: { state: unknown } = { state: undefined };

let root: Root | null = null;
beforeEach(() => {
	kept.state = undefined;
	sent.length = 0;
	(globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
		getState: () => kept.state,
		setState: (next: unknown) => (kept.state = next),
		postMessage: (message: never) => void sent.push(message),
	});
});
/** As VS Code drops a hidden panel: what it kept in VS Code's state stays, for the next to read. */
export const unmount = async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = '';
};
afterEach(unmount);

export const mount = async (element: ReturnType<typeof createElement>) => {
	root = createRoot(document.body.appendChild(document.createElement('div')));
	await act(async () => root?.render(element));
};

/** As `main.tsx` mounts it, inside the shared provider, which tells the extension it is ready. */
export const mountPage = (page: ReturnType<typeof createElement>) => mount(createElement(SharedProvider, null, page));

/**
 * By default the extension's: VS Code posts it on the page's own origin from a host frame the page cannot name (its own
 * script makes `window.parent` the page itself). A test of what the page refuses names another sender.
 */
export const say = async (data: unknown, from: { source?: MessageEventSource | null; origin?: string } = {}) =>
	act(async () => void window.dispatchEvent(new MessageEvent('message', { data, source: null, origin: location.origin, ...from })));
export const calls = (name: string) => sent.filter((m) => m.type === 'call' && m.name === name);
/** What the page asked of the extension itself, not the core. */
export const panelSaid = () => sent.filter((m) => m.type !== 'call');
export const answer = async (name: string, value: unknown) => {
	const call = calls(name).at(-1);
	if (!call) throw new Error(`the page made no ${name} call: ${JSON.stringify(sent)}`);
	await say({ type: 'answer', id: call.id, result: { ok: true, value } });
};

export const lastAsk = (): [string, unknown[]] | undefined => {
	const asked = sent.filter((m) => m.type === 'call' && isAsk(String(m.name))).at(-1);
	return asked && [String(asked.name), asked.args as unknown[]];
};

export const shareCatalog = async (catalog: Catalog, more: Partial<SharedValues['catalog']> = {}) =>
	share('catalog', { system: { id: 'flocksafety/flock-react-component-lib', name: 'FUI' }, catalog, error: null, syncing: false, ...more });

export const share = async <K extends SharedName>(name: K, value: SharedValues[K]) => say({ type: 'shared', name, value });

/** The kind of change (`ChangeKinds`) is the call's first argument. */
export const callsOf = (name: string, kind: string) => calls(name).filter((c) => c.args?.[0] === kind);
export const answerOf = async (name: string, kind: string, value: unknown) => {
	const call = callsOf(name, kind).at(-1);
	if (!call) throw new Error(`the page made no ${name} call for ${kind}: ${JSON.stringify(sent)}`);
	await say({ type: 'answer', id: call.id, result: { ok: true, value } });
};
