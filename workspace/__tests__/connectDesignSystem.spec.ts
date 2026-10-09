// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectDesignSystem } from '../src/renderer/ConnectDesignSystem';
import type { ClonePlan } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';

/**
 * Connecting a design system (P4 of the design system plan): centred like the GitHub sign-in, one of the person's
 * repositories, from the clone's own picker, and Connect. Any repository: it is accepted by what is found in it, refused
 * in words when nothing is, and a monorepo with several is chosen from. Against a fake app.
 */

const LIB = 'flocksafety/flock-react-component-lib';
const REPOS = [
	{ name: 'flocksafety/flock-coke', root: '/h/GitHub/flock-coke' },
	{ name: LIB, root: null },
];
const plan = (repository: string, state: 'free' | 'cloned' = 'free'): ClonePlan => ({
	repository,
	place: { state, path: `/h/GitHub/${repository.split('/')[1]}` },
	where: `~/GitHub/${repository.split('/')[1]}`,
	design: null,
});

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (more: Record<string, (...a: never[]) => unknown> = {}, props: Record<string, unknown> = {}) => {
	const app = fakeApp({ listRepositories: async () => ok({ repositories: REPOS, reach: 'account' }), clonePlan: async (repository: string) => ok(plan(repository)), ...more });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	const onConnected = vi.fn();
	current = await render(createElement(ConnectDesignSystem, { onConnected, ...props }));
	return { app, onConnected };
};
const text = () => document.body.textContent ?? '';
/** Chooses a repository in the picker, as a person does. */
const pick = async (repository: string) => {
	await press(button('Choose a repository'));
	await settle();
	const item = [...document.querySelectorAll('[cmdk-item]')].find((i) => i.textContent === repository)!;
	await act(async () => void item.dispatchEvent(new MouseEvent('click', { bubbles: true })));
	await settle();
};

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the screen', () => {
	it('says what it is for, centred in the window, with the person’s repositories to choose from and nothing chosen', async () => {
		await open();
		expect(document.querySelector('h1')?.textContent).toBe('Connect your design system');
		expect(text()).toContain('Choose the repository your design system is in.');
		const centre = document.querySelector('h1')!.parentElement!.parentElement!;
		expect(centre.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'items-center', 'justify-center']));
		expect(button('Choose a repository')).toBeTruthy();
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Connect')).toBe(false);
	});

	it('offers any repository, with where it will go and Connect under it: none is refused for its name', async () => {
		const { app } = await open();
		await pick('flocksafety/flock-coke');
		expect(text()).toContain('Into ~/GitHub/flock-coke');
		expect(button('Connect')).toBeTruthy();
		// The design system is read, not worked in: no design repository beside it.
		expect(app.calls.clonePlan?.at(-1)).toEqual(['flocksafety/flock-coke', true]);
		expect(text()).not.toContain('not the design system');
	});

	it('says when the list is only the repositories DSNR’s GitHub App can see, and how to see every one', async () => {
		await open({ listRepositories: async () => ok({ repositories: REPOS, reach: 'app' }) });
		expect(text()).toContain('Only the repositories DSNR’s GitHub App is installed on are listed.');
		expect(text()).toContain('gh auth login');
	});

	it('says nothing of the kind when the list is every repository the account reaches', async () => {
		await open();
		expect(text()).not.toContain('Only the repositories');
	});

	it('has no Cancel when nothing is connected yet, and one that goes back when something is', async () => {
		await open();
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Cancel')).toBe(false);
		await unmountAll(current!.root);
		const onCancel = vi.fn();
		await open({}, { onCancel });
		await press(button('Cancel'));
		expect(onCancel).toHaveBeenCalledOnce();
	});
});

describe('connecting', () => {
	it('connects the repository chosen, and says so', async () => {
		const { app, onConnected } = await open({ connectDesignSystem: async () => ok({ state: 'connected', id: LIB }) });
		await pick(LIB);
		await press(button('Connect'));
		await settle();
		expect(app.calls.connectDesignSystem).toEqual([[LIB]]);
		expect(onConnected).toHaveBeenCalledOnce();
	});

	it('says why a repository was refused, and connects nothing', async () => {
		const why = 'No design system was found in flocksafety/flock-coke: it has no Storybook stories, and no tokens in theme files, CSS variables or token files.';
		const { onConnected } = await open({ connectDesignSystem: async () => fail(why) });
		await pick('flocksafety/flock-coke');
		await press(button('Connect'));
		await settle();
		expect(text()).toContain(why);
		expect(onConnected).not.toHaveBeenCalled();
	});

	it('offers the design systems of a monorepo to choose from, and connects the one chosen', async () => {
		const found = [
			{ folder: 'packages/marketing', components: 3, tokens: 0, name: 'marketing' },
			{ folder: 'packages/ui', components: 40, tokens: 120, name: 'Acme UI' },
		];
		const { app, onConnected } = await open({
			connectDesignSystem: async () => ok({ state: 'choose', repository: 'acme/acme', found }),
			chooseDesignSystem: async () => ok({ state: 'connected', id: 'acme/acme:packages/ui' }),
		});
		await pick(LIB);
		await press(button('Connect'));
		await settle();
		expect(text()).toContain('acme/acme has 2 design systems in it. Choose one:');
		const ui = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Acme UI'))!;
		expect(ui.textContent).toContain('packages/ui · 40 components · 120 tokens');
		await press(ui);
		await settle();
		expect(app.calls.chooseDesignSystem).toEqual([['acme/acme', 'packages/ui']]);
		expect(onConnected).toHaveBeenCalledOnce();
	});
});
