import { createElement } from 'react';
import type { ReviewComment, WorkspaceApi } from '../src/shared/contract';
import { anAnchor, eventually, reviewComment } from './fixtures';
import { allByRole, byRole, named, press, render, settle } from './ui';

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
		prototypeCover: async () => ok(null),
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

export const switchMenu = (what: 'version' | 'state'): HTMLButtonElement | null =>
	(allByRole('button', new RegExp(`: switch ${what}$`))[0] as HTMLButtonElement | undefined) ?? null;
export const stateMenu = (): HTMLButtonElement | null => switchMenu('state');
export const shownIn = (menu: HTMLElement | null): string | undefined => menu?.textContent?.trim();
export const shownState = (): string | undefined => shownIn(stateMenu());
/** The choices of a dropdown, opened as a person opens it (left open when it already is). */
const openChoices = async (menu: HTMLElement | null): Promise<HTMLElement[]> => {
	if (!menu) throw new Error('no dropdown');
	if (menu.getAttribute('aria-expanded') !== 'true') await press(menu);
	return allByRole('menuitem', undefined, menu.parentElement ?? document);
};
export const choicesIn = async (menu: HTMLElement | null): Promise<string[]> => (await openChoices(menu)).map(named);
export const chosenIn = async (menu: HTMLElement | null): Promise<string | undefined> => {
	const chosen = (await openChoices(menu)).find((c) => c.getAttribute('aria-checked') === 'true');
	return chosen && named(chosen);
};
export const choose = async (menu: HTMLElement | null, name: string): Promise<void> => {
	const choices = await openChoices(menu);
	const choice = choices.find((c) => named(c) === name);
	if (!choice) throw new Error(`no choice ${name}: ${choices.map(named).join(' | ')}`);
	await press(choice);
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
