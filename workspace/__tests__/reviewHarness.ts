import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CommentAnchor, PickedPoint, PinEvent, Project, ProjectIteration, Result, ReviewComment, WorkspaceApi } from '../src/shared/contract';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import { agentRunning, projectIteration, reviewComment } from './fixtures';

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
	let pinListener: ((e: PinEvent) => void) | null = null;
	let picked: ((v: Result<PickedPoint | null>) => void) | null = null;
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
		listRepositories: async () => ok({ repositories: [], reach: 'account' }),
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
		shareStatus: async () => ok({ state: 'idle' }),
		publishedPage: async () => ok({ state: 'none' }),
		pageShowMarkers: async (items: { id: number }[]) => ok(items.map((i) => ({ id: i.id, state: 'found' }))),
		pageSnapshot: async () => ok(null),
		// A pick waits for a click on the page, which `click` below gives it.
		pagePick: () => new Promise((resolve) => (picked = resolve)),
		// As the page does: a pick waiting for a click ends with nothing picked.
		pageCancelPick: async () => {
			picked?.(ok(null));
			return ok(null);
		},
		onPinEvent: (l: (e: PinEvent) => void) => {
			pinListener = l;
			return () => void (pinListener = null);
		},
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
		/** A pin on the page was clicked or dragged. */
		pin: (e: PinEvent) => act(async () => pinListener?.(e)),
		/** A click on the page while commenting, at an element with this anchor. */
		click: (anchor: Partial<CommentAnchor> = {}) =>
			act(async () =>
				picked?.(
					ok({
						anchor: { route: '/', selector: 'main', nearbyText: 'Main', viewport: { width: 1, height: 1 }, commit: '', ...anchor },
						at: { x: 10, y: 10 },
						box: null,
						picture: null,
					}),
				),
			),
	};
};

export const comment = (id: number, body: string, more: Partial<ReviewComment> = {}): ReviewComment =>
	reviewComment({
		id,
		body,
		createdAt: `2026-10-08T00:00:0${id % 10}Z`,
		anchor: { route: '/', selector: `#c${id}`, nearbyText: body, viewport: { width: 1, height: 1 }, commit: '' },
		...more,
	});

export const PROJECT: Project = {
	id: 'demo',
	title: 'Demo',
	records: [],
	iterations: [],
	people: [],
	createdAt: null,
} as unknown as Project;

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
/** A prototype's states, as the bar shows them: one button each, in a group named State, the one shown pressed. */
export const stateGroup = (): HTMLElement | null =>
	document.querySelector<HTMLElement>('[role="group"][aria-label="State"], [data-slot="toggle-group"][aria-label="State"]');
export const stateButtons = (): HTMLElement[] => [...(stateGroup()?.querySelectorAll<HTMLElement>('[data-slot="toggle-group-item"]') ?? [])];
export const shownState = (): string | undefined =>
	stateButtons()
		.find((b) => b.getAttribute('aria-checked') === 'true')
		?.textContent?.trim();
export const state = (name: string): HTMLElement => {
	const b = stateButtons().find((x) => x.textContent?.trim() === name);
	if (!b)
		throw new Error(
			`no state button ${name}: ${stateButtons()
				.map((x) => x.textContent)
				.join(' | ')}`,
		);
	return b;
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

/** Opens a menu as a pointer does, and returns its items. */
export const openMenu = async (trigger: Element): Promise<HTMLElement[]> => {
	await act(async () => {
		trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
	});
	await settle(2);
	return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
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

/** Long enough for the agent to be asked how it is getting on, which the screens do once a second. */
export const afterAgentCheck = async () => {
	await new Promise((r) => setTimeout(r, 1100));
	await settle();
};

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
