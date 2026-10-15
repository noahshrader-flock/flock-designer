import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Project, ProjectIteration, ReviewComment, WorkspaceApi } from '../src/shared/contract';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import { agentRunning, anAnchor, aProject, eventually, projectIteration, reviewComment } from './fixtures';

/**
 * The review screen, rendered for real in jsdom against a fake app: every call the window can make answers, the ones
 * a test cares about are given, and all are recorded. What the screen does is then read off the page as a person
 * would see it, so these tests hold whatever the screen is made of inside.
 */

export const ok = <T>(value: T) => ({ ok: true as const, value });
export const fail = (error: string) => ({ ok: false as const, error });

/**
 * Any of the window's calls, by its real name and with its real arguments, so renaming or changing one breaks the tests
 * that fake it. What a fake answers is left open: tests give partial and malformed answers on purpose.
 */
type Impl = { [K in keyof WorkspaceApi]?: (...args: Parameters<WorkspaceApi[K]>) => unknown };

export const fakeApp = (overrides: Impl = {}) => {
	const calls: Record<string, unknown[][]> = {};
	const impl: Impl = {
		agentStatus: async () => ok({ state: 'idle' }),
		agentRecent: async () => ok({ work: null, lines: [] }),
		signInState: async () => ok({ state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } }),
		openPrototype: async () => ok({ url: 'http://127.0.0.1:9/demo/v1-i1', states: [] }),
		// Nothing found, by the default target: a page with no issues, as most fixtures are.
		checkAccessibility: async () =>
			ok({
				ran: { axe: '4.14.0', tags: ['wcag2a'], target: 'WCAG 2.0 Level A', declared: true, at: '2026-10-10T00:00:00.000Z', states: ['default'] },
				violations: [],
				incomplete: [],
				notAutomated: [],
			}),
		fixAccessibility: async () => ok(agentRunning()),
		readComments: async () => ok([]),
		// No design system connected, unless a test says otherwise.
		designSystems: async () => ok({ systems: [], current: null }),
		// No change to the tokens saved, unless a test says otherwise.
		tokenBranch: async () => ok(null),
		// No voice and tone file in the design repository, unless a test says otherwise.
		voiceAndTone: async () =>
			ok({
				repository: 'flocksafety/flock-react-component-lib',
				path: '.dsnr/voice-and-tone.md',
				base: 'develop',
				text: null,
				sha: null,
				branch: null,
			}),
		// Every story still being drawn, unless a test says otherwise.
		componentTokens: async () => ok({ state: 'building' }),
		// No pictures of the components yet, and none being drawn, unless a test says otherwise.
		componentPictures: async () => ok({ drawing: false, pictures: {}, issues: {} }),
		// No picture of any prototype, and none made, unless a test says otherwise.
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
					// Subscriptions give back a way to stop; everything else answers that it worked.
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

export const PROJECT: Project = aProject({ id: 'demo', title: 'Demo' });

export const PROTOTYPE: ProjectIteration = projectIteration({ name: 'v1-i1', branch: 'prototype/demo/v1-i1', issueNumber: 1 });

const CHECKOUT = { root: '/c/flock-coke', name: 'flock-coke', branch: 'develop', clean: true };

/** Lets every pending promise and effect run, as many times as it takes to settle. */
export const settle = async (rounds = 12) => {
	for (let i = 0; i < rounds; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};

/** What the browser has that jsdom lacks, and the screen's parts reach for. */
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
	await act(async () => root.render(createElement(TooltipProvider, null, element)));
	await settle();
	return { root, host };
};

export const unmountAll = async (root: Root) => {
	await act(async () => root.unmount());
	document.body.innerHTML = '';
};

/** A prototype's review screen, opened, with a checkout so Address is offered. */
export const reviewProps = (more: Record<string, unknown> = {}) => ({
	project: PROJECT,
	iteration: PROTOTYPE,
	onBack: () => undefined,
	checkout: CHECKOUT,
	onChoose: () => undefined,
	hidden: false,
	onOpen: () => undefined,
	...more,
});

// ---- Reading and using the page as a person would ----------------------------------------------------------------

const named = (el: Element): string => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();

/** The one button with this name, by its label or its text. */
export const button = (name: string | RegExp, scope: ParentNode = document): HTMLButtonElement => {
	const all = [...scope.querySelectorAll('button')].filter((b) => (typeof name === 'string' ? named(b) === name : name.test(named(b))));
	if (all.length !== 1) throw new Error(`${all.length} buttons named ${name}: ${[...scope.querySelectorAll('button')].map(named).join(' | ')}`);
	return all[0] as HTMLButtonElement;
};
/** A prototype's states, as the bar shows them: a dropdown named State and the one shown, null when there is none. */
export const stateMenu = (): HTMLButtonElement | null =>
	[...document.querySelectorAll('button')].find((b) => /^State .+: switch state$/.test(named(b))) ?? null;
/** The state shown: the words on the dropdown's button. */
export const shownState = (): string | undefined => stateMenu()?.textContent?.trim();
/** Choosing a state from its dropdown, as a person does. */
export const chooseState = async (name: string): Promise<void> => {
	const menu = stateMenu();
	if (!menu) throw new Error('no state dropdown');
	const items = await openMenu(menu);
	const item = items.find((i) => i.textContent?.trim() === name);
	if (!item) throw new Error(`no state ${name}: ${items.map((i) => i.textContent).join(' | ')}`);
	await press(item);
};
export const press = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

/** The tabs on the page, one by name, and choosing one as a press does: Radix switches as the pointer goes down. */
export const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
export const tab = (name: string) => tabs().find((t) => t.textContent === name) as HTMLElement;
export const chooseTab = (which: string | HTMLElement) =>
	act(
		async () =>
			void (typeof which === 'string' ? tab(which) : which).dispatchEvent(
				new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
			),
	);
/** An alert's parts, in order, and what each is: an icon, then its slots (`alert-title`, `alert-description`, `alert-action`). */
export const alertParts = (alert: Element): string[] =>
	[...alert.children].map((c) => (c.tagName === 'svg' ? 'icon' : (c.getAttribute('data-slot') ?? c.tagName)));
/** A hook rendered on its own, and what it gave the last time it ran (`now`), for a test to drive it and read it. */
export const probeHook = async <T>(use: () => T) => {
	let seen: { value: T } | null = null;
	const Probe = () => {
		seen = { value: use() };
		return null;
	};
	const rendered = await render(createElement(Probe));
	return { ...rendered, now: (): T => (seen as { value: T } | null)!.value };
};
/** The dialog that is open, or null. */
export const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

/** Opens a menu as a pointer does, and returns its items: its actions, and the choices of one that picks one of a few. */
export const openMenu = async (trigger: Element): Promise<HTMLElement[]> => {
	await act(async () => {
		trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
	});
	await settle(2);
	return [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
};
export const menuItem = (items: HTMLElement[], name: string): HTMLElement => {
	const hit = items.find((i) => (i.textContent ?? '').trim() === name);
	if (!hit) throw new Error(`no menu item ${name}: ${items.map((i) => i.textContent).join(' | ')}`);
	return hit;
};

/** The card of the comment that says this. */
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

/**
 * Once the agent has been asked how it is getting on (the screens ask once a second) and `check` holds: as soon as it is
 * so, not after a guess at how long that takes.
 */
export const afterAgentCheck = (check: () => void) =>
	eventually(async () => {
		await settle();
		check();
	});

/** The cards in the comments sidebar, as their text. */
export const cards = (): HTMLElement[] =>
	[...document.querySelectorAll<HTMLElement>('button[aria-label="Comment actions"]')].map((b) => b.closest('.rounded-lg') as HTMLElement);
export const typeInto = (el: HTMLTextAreaElement | HTMLInputElement, text: string) =>
	act(async () => {
		// The value as React sees it typed: through the element's own kind's setter, not the one React wraps.
		const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
		setter?.call(el, text);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
export const key = (k: string, more: KeyboardEventInit = {}) =>
	act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...more })));

/** The page's Light / Dark switch, its two buttons, and the one shown. */
export const themeGroup = (): HTMLElement | null =>
	document.querySelector<HTMLElement>('[role="group"][aria-label="Theme"], [data-slot="toggle-group"][aria-label="Theme"]');
export const themeButton = (name: 'Light' | 'Dark'): HTMLElement => {
	const b = themeGroup()?.querySelector<HTMLElement>(`[aria-label="${name}"]`);
	if (!b) throw new Error(`no ${name} in the theme switch`);
	return b;
};
export const shownTheme = (): string | undefined =>
	[...(themeGroup()?.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]') ?? [])]
		.find((b) => b.getAttribute('aria-checked') === 'true')
		?.getAttribute('aria-label') ?? undefined;
