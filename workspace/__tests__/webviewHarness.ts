import { act, type createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach } from 'vitest';

/**
 * DSNR's pages (the panel, a design system's tab) as the extension plays them, for their tests: VS Code's webview API
 * standing in (`acquireVsCodeApi`: what the page sends, and the state it keeps), what the extension says arriving as its
 * messages do, and a person's presses and typing. Imported, it starts each test afresh and clears the page after.
 */

/** What the page sent the extension, in order: its calls to the core, and its own requests. */
export const sent: { type: string; id?: number; name?: string; args?: unknown[]; [key: string]: unknown }[] = [];
/** What the page keeps in VS Code's state for it (`setState`), as a reload would give it back. */
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
/** The page gone, as VS Code drops a hidden panel's: what it kept in VS Code's state stays, for the next to read. */
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

/** What the extension says, as it says it. */
export const say = async (data: unknown) => act(async () => void window.dispatchEvent(new MessageEvent('message', { data })));
/** The page's calls to the core by `name`, in order. */
export const calls = (name: string) => sent.filter((m) => m.type === 'call' && m.name === name);
/** What the page asked of the extension itself, not the core. */
export const panelSaid = () => sent.filter((m) => m.type !== 'call');
/** Answers the page's latest call to `name` with `value`. */
export const answer = async (name: string, value: unknown) => {
	const call = calls(name).at(-1);
	if (!call) throw new Error(`the page made no ${name} call: ${JSON.stringify(sent)}`);
	await say({ type: 'answer', id: call.id, result: { ok: true, value } });
};

/** A button by what it says, as a person finds it. */
export const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
export const press = async (el: Element) => act(async () => (el as HTMLElement).click());
export const key = async (el: HTMLElement, name: string) =>
	act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })));
/** Types into a field as a person does: the value set, and React told it changed. */
export const type = async (el: Element, text: string) =>
	act(async () => {
		const field = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		const proto =
			field instanceof HTMLSelectElement ? HTMLSelectElement : field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
		Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(field, text);
		field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
	});
