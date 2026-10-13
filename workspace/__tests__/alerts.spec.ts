// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DesignSystem } from '../src/renderer/DesignSystem';
import { button, fail, fakeApp, ok, render, unmountAll } from './reviewHarness';

/**
 * The alerts that hold a button use the shadcn Alert as it is made: an icon, a title, a description, and the button in
 * the alert's own action slot, with no layout or color classes of the app's laid over any of it.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

/** An alert's parts, in order, and what each is: the stock structure and nothing else. */
const parts = (alert: Element) => [...alert.children].map((c) => (c.tagName === 'svg' ? 'icon' : (c.getAttribute('data-slot') ?? c.tagName)));

describe('the design system’s notices', () => {
	const open = async (answer: () => unknown) => {
		(window as unknown as { workspace: unknown }).workspace = fakeApp({ designSystemCatalog: async () => answer() }).api;
		current = await render(createElement(DesignSystem, { hidden: false }));
	};

	it('has Try again in the alert’s action slot, with an icon, title and description, when the read fails', async () => {
		await open(() => fail('git is not installed'));
		const alert = document.querySelector('[data-slot="alert"]')!;
		expect(parts(alert)).toEqual(['icon', 'alert-title', 'alert-description', 'alert-action']);
		expect(alert.querySelector('[data-slot="alert-description"]')!.textContent).toBe('git is not installed');
		expect(alert.querySelector('[data-slot="alert-action"]')!.contains(button('Try again'))).toBe(true);
	});

	it('is the same when the clone has no copy of its branch', async () => {
		await open(() => ok({ state: 'no-branch', root: '/h/fui', branch: 'develop' }));
		const alert = document.querySelector('[data-slot="alert"]')!;
		expect(parts(alert)).toEqual(['icon', 'alert-title', 'alert-description', 'alert-action']);
		expect(alert.querySelector('[data-slot="alert-title"]')!.textContent).toBe('This clone has no develop branch');
	});
});
