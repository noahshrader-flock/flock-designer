import { act, createElement } from 'react';
import type { ReviewComment, WorkspaceApi } from '../src/shared/contract';
import { anAnchor, eventually, reviewComment } from './fixtures';
import { allByRole, byRole, named, render, settle } from './ui';

/** The review bar's page: the app it talks to, faked, and what only it has (its menus, its cards, its theme switch). */

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
export const probeHook = async <T>(use: () => T) => {
	let seen: { value: T } | null = null;
	const Probe = () => {
		seen = { value: use() };
		return null;
	};
	const rendered = await render(createElement(Probe));
	return { ...rendered, now: (): T => (seen as { value: T } | null)!.value };
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
export const themeGroup = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Theme"]');
export const themeButton = (name: 'Light' | 'Dark'): HTMLElement => byRole('radio', name, themeGroup() ?? document);
export const shownTheme = (): string | undefined => {
	const checked = allByRole('radio', undefined, themeGroup() ?? document).find((b) => b.getAttribute('aria-checked') === 'true');
	return checked && named(checked);
};
