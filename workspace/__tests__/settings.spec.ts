// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Settings } from '../src/renderer/Settings';
import { fakeApp, fail, ok, press, render, settle, unmountAll } from './reviewHarness';

/**
 * Settings, from the account menu: the theme, as one button group of Auto (the computer's own setting, and what it starts
 * as), Light and Dark, with the one in use pressed. Against a fake app.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
let closed = 0;
const open = async (more: Record<string, (...a: never[]) => unknown> = {}) => {
	closed = 0;
	const app = fakeApp({ appearance: async () => ok('system'), setAppearance: async (a: string) => ok(a), ...more });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Settings, { open: true, onClose: () => void closed++ }));
	await settle();
	return app;
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});
const items = () => [...document.querySelectorAll<HTMLElement>('[aria-label="Theme"] [role="radio"]')];
const pressed = () => items().find((i) => i.getAttribute('aria-checked') === 'true')?.textContent;
const choose = async (label: string) => {
	await press(items().find((i) => i.textContent === label) as HTMLElement);
	await settle();
};

describe('Settings', () => {
	it('is a modal called Settings, with a Theme of Auto, Light and Dark', async () => {
		await open();
		expect(document.querySelector('[data-slot="dialog-title"]')?.textContent).toBe('Settings');
		expect(document.querySelector('label')?.textContent).toBe('Theme');
		expect(items().map((i) => i.textContent)).toEqual(['Auto', 'Light', 'Dark']);
	});

	it('shows the theme in use as pressed, Auto to begin with', async () => {
		await open();
		expect(pressed()).toBe('Auto');
		await unmountAll(current!.root);
		await open({ appearance: async () => ok('dark') });
		expect(pressed()).toBe('Dark');
	});

	it('sets the theme pressed at once, and says it', async () => {
		const app = await open();
		await choose('Dark');
		expect(app.calls.setAppearance).toEqual([['dark']]);
		expect(pressed()).toBe('Dark');
		await choose('Auto');
		expect(app.calls.setAppearance?.at(-1)).toEqual(['system']);
		expect(pressed()).toBe('Auto');
	});

	it('does nothing for the one in use, so one is always pressed', async () => {
		const app = await open({ appearance: async () => ok('light') });
		await choose('Light');
		expect(app.calls.setAppearance).toBeUndefined();
		expect(pressed()).toBe('Light');
	});

	it('goes back to the theme it was and says why, when it could not be set', async () => {
		await open({ setAppearance: async () => fail('The setting could not be kept.') });
		await choose('Dark');
		expect(pressed()).toBe('Auto');
		expect(document.querySelector('[data-slot="dialog-content"]')?.textContent).toContain('The setting could not be kept.');
	});
});
