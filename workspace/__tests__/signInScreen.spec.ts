// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/renderer/App';
import { button, fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';

/**
 * The signed-out screen: Sign in with GitHub, and the code to type once it has started, in the middle of the window,
 * across and down (under the fixed top bar, but centered on the window, not on what is left of it). Layout is read off
 * the classes, as jsdom has none.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

const classes = (el: Element | null) => (el?.className ?? '').split(' ');
const signedOut = () => {
	const app = fakeApp({
		signInState: async () => ok({ state: 'signedOut' }),
		signInStart: async () => ok({ userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device' }),
	});
	(window as unknown as { workspace: unknown }).workspace = app.api;
};

describe('the sign-in screen', () => {
	it('is centered in the window both ways, as the one thing on it', async () => {
		signedOut();
		current = await render(createElement(App));
		const heading = [...document.querySelectorAll('h1')].find((h) => h.textContent === 'DSNR') as HTMLElement;
		const column = heading.parentElement?.parentElement as HTMLElement;
		const center = column.parentElement as HTMLElement;
		// The area under the bar fills it, and puts its one child in the middle across and down.
		expect(classes(center)).toEqual(expect.arrayContaining(['flex', 'min-h-full', 'items-center', 'justify-center']));
		// The bar's height is left clear below as well as above, so the middle is the window's, not what is under the bar.
		expect(classes(center)).toContain('pb-(--nav-height)');
	});

	it('sits in that middle by its own width, with no margin pushing it off the top', async () => {
		signedOut();
		current = await render(createElement(App));
		const column = [...document.querySelectorAll('h1')].find((h) => h.textContent === 'DSNR')?.parentElement?.parentElement as HTMLElement;
		expect(classes(column).filter((c) => /^(mt-|mx-auto)/.test(c))).toEqual([]);
		expect(classes(column)).toEqual(expect.arrayContaining(['w-full', 'text-center']));
		expect(button('Sign in with GitHub')).toBeTruthy();
	});

	it('is the same for the code to type on GitHub', async () => {
		let changed: ((state: { state: string }) => void) | null = null;
		const app = fakeApp({
			signInState: async () => ok({ state: 'signedOut' }),
			signInStart: async () => ok({ userCode: 'WDJB-MJHT', verificationUri: 'https://github.com/login/device' }),
			onSignInChanged: (listener: (state: { state: string }) => void) => ((changed = listener), () => undefined),
		});
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(App));
		await press(button('Sign in with GitHub'));
		await settle();
		// GitHub is now waiting for the code: the app tells the window so.
		await act(async () => changed?.({ state: 'awaitingDevice' }));
		await settle();
		const heading = [...document.querySelectorAll('h1')].find((h) => h.textContent === 'Enter this code on GitHub') as HTMLElement;
		expect(document.body.textContent).toContain('WDJB-MJHT');
		const column = heading.parentElement?.parentElement as HTMLElement;
		expect(classes(column).filter((c) => /^(mt-|mx-auto)/.test(c))).toEqual([]);
		expect(classes(column)).toEqual(expect.arrayContaining(['w-full', 'text-center']));
		// And in the same middle of the window.
		expect(classes(column.parentElement)).toEqual(expect.arrayContaining(['flex', 'min-h-full', 'items-center', 'justify-center']));
	});
});
