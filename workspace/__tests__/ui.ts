import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * How the UI tests find what a person finds, by its role and accessible name, and do what they do. The panel's
 * (`webviewHarness.ts`) and the review bar's (`reviewHarness.ts`) only set up the page each runs in.
 */

export const settle = async (rounds = 12) => {
	for (let i = 0; i < rounds; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};

const polyfill = () => {
	const w = window as unknown as Record<string, unknown>;
	w.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	w.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
	w.PointerEvent ??= class extends MouseEvent {
		pointerType: string;
		constructor(type: string, init: PointerEventInit = {}) {
			super(type, init);
			this.pointerType = init.pointerType ?? 'mouse';
		}
	};
	// The box beside a pin waits a frame for the picture of the page to be on screen.
	w.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
	w.cancelAnimationFrame = (id: number) => clearTimeout(id);
	const el = Element.prototype as unknown as Record<string, unknown>;
	el.scrollIntoView ??= () => undefined;
	el.hasPointerCapture ??= () => false;
	el.setPointerCapture ??= () => undefined;
	el.releasePointerCapture ??= () => undefined;
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
};

export const render = async (element: ReactElement): Promise<{ root: Root; host: HTMLElement }> => {
	polyfill();
	const host = document.createElement('div');
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(element));
	await settle();
	return { root, host };
};

export const unmountAll = async (root: Root) => {
	await act(async () => root.unmount());
	document.body.innerHTML = '';
};

/** Its accessible name, as assistive technology reads it: its label, else what labels it, else its text. */
export const named = (el: Element): string => {
	const label = el.getAttribute('aria-label');
	if (label !== null) return label.trim();
	const by = el.getAttribute('aria-labelledby');
	if (by)
		return by
			.split(' ')
			.map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
			.join(' ');
	const field = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
	return (field ?? el).textContent?.trim() ?? '';
};

const ROLES: Record<string, string> = {
	button: 'button, [role="button"]',
	menuitem: '[role^="menuitem"]',
	textbox: 'input:not([type]), input[type="text"], input[type="search"], textarea, [role="textbox"]',
	combobox: 'select, [role="combobox"]',
	radio: 'input[type="radio"], [role="radio"]',
	tab: '[role="tab"]',
	link: 'a[href]',
	dialog: '[role="dialog"]',
};

/** Every element of the role named so; one name matches whole, a pattern anywhere. */
export const allByRole = (role: keyof typeof ROLES, name?: string | RegExp, scope: ParentNode = document): HTMLElement[] =>
	[...scope.querySelectorAll<HTMLElement>(ROLES[role] ?? `[role="${role}"]`)].filter(
		(el) => name === undefined || (typeof name === 'string' ? named(el) === name : name.test(named(el))),
	);

/** The one element of the role named so: none, or more than one, fails the test and lists what there is. */
export const byRole = <T extends HTMLElement = HTMLElement>(role: keyof typeof ROLES, name?: string | RegExp, scope: ParentNode = document): T => {
	const found = allByRole(role, name, scope);
	if (found.length !== 1)
		throw new Error(`${found.length} ${role}s named ${String(name)}: ${allByRole(role, undefined, scope).map(named).join(' | ')}`);
	return found[0] as T;
};

export const button = (name: string | RegExp, scope: ParentNode = document) => byRole<HTMLButtonElement>('button', name, scope);
export const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

export const press = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

/** A key pressed on what has focus, the window if nothing is given. */
export const key = (name: string, { on = window, ...init }: KeyboardEventInit & { on?: EventTarget } = {}) =>
	act(async () => void on.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init })));

/** Through the element's own kind's value setter, as typing does, so React sees the change. */
export const type = (el: Element, text: string) =>
	act(async () => {
		const field = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, text);
		field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
	});

export const openMenu = async (trigger: Element): Promise<HTMLElement[]> => {
	await press(trigger);
	await settle(2);
	return allByRole('menuitem');
};
export const menuItem = (items: HTMLElement[], name: string): HTMLElement => {
	const hit = items.find((i) => named(i) === name);
	if (!hit) throw new Error(`no menu item ${name}: ${items.map(named).join(' | ')}`);
	return hit;
};

/** The field a label names. */
export const fieldNamed = <T extends HTMLElement = HTMLTextAreaElement>(label: string): T => {
	const found = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === label);
	const control = found ? document.getElementById(found.htmlFor) : null;
	if (!control) throw new Error(`no field labelled ${label}`);
	return control as T;
};
