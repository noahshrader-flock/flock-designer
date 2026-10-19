import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReviewComment, WorkspaceApi } from '../src/shared/contract';
import { anAnchor, eventually, reviewComment } from './fixtures';

/** What the screen does is read off the page as a person sees it, so these tests hold whatever it is made of inside. */

export const ok = <T>(value: T) => ({ ok: true as const, value });
export const fail = (error: string) => ({ ok: false as const, error });

/**
 * Typed by the real names and arguments, so renaming one breaks the tests that fake it; answers are left open, as tests
 * give partial and malformed ones on purpose.
 */
type Impl = { [K in keyof WorkspaceApi]?: (...args: Parameters<WorkspaceApi[K]>) => unknown };

export const fakeApp = (overrides: Impl = {}) => {
	const calls: Record<string, unknown[][]> = {};
	const impl: Impl = {
		agentStatus: async () => ok({ state: 'idle' }),
		signInState: async () => ok({ state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } }),
		openPrototype: async () => ok({ url: 'http://127.0.0.1:9/demo/v1', states: [] }),
		readComments: async () => ok([]),
		designSystems: async () => ok({ systems: [], current: null }),
		changeBranch: async () => ok(null),
		voiceAndTone: async () =>
			ok({
				repository: 'flocksafety/flock-react-component-lib',
				path: '.dsnr/voice-and-tone.md',
				base: 'develop',
				text: null,
				sha: null,
			}),
		componentTokens: async () => ok({ state: 'building' }),
		componentPictures: async () => ok({ drawing: false, pictures: {}, issues: {} }),
		projectCover: async () => ok(null),
		ensureCovers: async () => ok([]),
		publishedPage: async () => ok({ state: 'none' }),
		...overrides,
	};
	const api = new Proxy(
		{},
		{
			get:
				(_t, name: string) =>
				(...args: unknown[]) => {
					(calls[name] ??= []).push(args);
					const f = impl[name as keyof WorkspaceApi] as ((...a: unknown[]) => unknown) | undefined;
					if (f) return f(...args);
					return name.startsWith('on') ? () => undefined : Promise.resolve(ok(null));
				},
		},
	);
	return {
		api,
		calls,
		impl,
	};
};

export const comment = (id: number, body: string, more: Partial<ReviewComment> = {}): ReviewComment =>
	reviewComment({
		id,
		body,
		createdAt: `2026-10-08T00:00:0${id % 10}Z`,
		anchor: anAnchor({ selector: `#c${id}`, nearbyText: body }),
		...more,
	});

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

const named = (el: Element): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();

export const button = (name: string | RegExp, scope: ParentNode = document): HTMLButtonElement => {
	const all = [...scope.querySelectorAll('button')].filter((b) => (typeof name === 'string' ? named(b) === name : name.test(named(b))));
	if (all.length !== 1) throw new Error(`${all.length} buttons named ${name}: ${[...scope.querySelectorAll('button')].map(named).join(' | ')}`);
	return all[0] as HTMLButtonElement;
};
export const switchMenu = (what: 'version' | 'state'): HTMLSelectElement | null =>
	[...document.querySelectorAll('select')].find((s) => new RegExp(`: switch ${what}$`).test(named(s))) ?? null;
export const stateMenu = (): HTMLSelectElement | null => switchMenu('state');
export const shownIn = (menu: HTMLSelectElement | null): string | undefined => menu?.selectedOptions[0]?.textContent?.trim();
export const shownState = (): string | undefined => shownIn(stateMenu());
export const choicesIn = (menu: HTMLSelectElement | null): string[] => [...(menu?.options ?? [])].map((o) => o.textContent?.trim() ?? '');
export const choose = async (menu: HTMLSelectElement | null, name: string): Promise<void> => {
	if (!menu) throw new Error('no dropdown');
	const option = [...menu.options].find((o) => o.textContent?.trim() === name);
	if (!option) throw new Error(`no choice ${name}: ${choicesIn(menu).join(' | ')}`);
	await act(async () => {
		// The value as React sees it chosen: through the select's own setter, then the change it hears.
		Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(menu, option.value);
		menu.dispatchEvent(new Event('change', { bubbles: true }));
	});
};
export const chooseState = (name: string): Promise<void> => choose(stateMenu(), name);
export const press = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

export const probeHook = async <T>(use: () => T) => {
	let seen: { value: T } | null = null;
	const Probe = () => {
		seen = { value: use() };
		return null;
	};
	const rendered = await render(createElement(Probe));
	return { ...rendered, now: (): T => (seen as { value: T } | null)!.value };
};
export const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

export const openMenu = async (trigger: Element): Promise<HTMLElement[]> => {
	await press(trigger);
	await settle(2);
	return [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
};
export const menuItem = (items: HTMLElement[], name: string): HTMLElement => {
	const hit = items.find((i) => (i.textContent ?? '').trim() === name);
	if (!hit) throw new Error(`no menu item ${name}: ${items.map((i) => i.textContent).join(' | ')}`);
	return hit;
};

export const cardFor = (text: string): HTMLElement => {
	const c = cards().find((el) => el.textContent?.includes(text));
	if (!c)
		throw new Error(
			`no card for ${text}: ${cards()
				.map((x) => x.textContent)
				.join(' | ')}`,
		);
	return c;
};

/** The screens ask the agent once a second: this waits until `check` holds, not for a guessed time. */
export const afterAgentCheck = (check: () => void) =>
	eventually(async () => {
		await settle();
		check();
	});

export const cards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.comment-card')];
export const fieldNamed = <T extends HTMLElement = HTMLTextAreaElement>(label: string): T => {
	const found = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === label);
	const control = found ? document.getElementById(found.htmlFor) : null;
	if (!control) throw new Error(`no field labelled ${label}`);
	return control as T;
};
export const typeInto = (el: HTMLTextAreaElement | HTMLInputElement, text: string) =>
	act(async () => {
		// The value as React sees it typed: through the element's own kind's setter, not the one React wraps.
		const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
		setter?.call(el, text);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
export const key = (k: string, more: KeyboardEventInit = {}) =>
	act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...more })));

export const themeGroup = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Theme"]');
export const themeButton = (name: 'Light' | 'Dark'): HTMLElement => {
	const b = themeGroup()?.querySelector<HTMLElement>(`[aria-label="${name}"]`);
	if (!b) throw new Error(`no ${name} in the theme switch`);
	return b;
};
export const shownTheme = (): string | undefined =>
	[...(themeGroup()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
		.find((b) => b.getAttribute('aria-checked') === 'true')
		?.getAttribute('aria-label') ?? undefined;
