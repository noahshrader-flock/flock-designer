import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopNav } from '../src/renderer/TopNav';
import { chooseTab, openMenu, press, render, tabs, unmountAll } from './reviewHarness';

/**
 * The sections in the window's top bar (Projects, Design System): shadcn's Tabs in its default look, the pill with the
 * one you are in raised, not the underlined line tabs. Against the bar on its own.
 */

const USER = { login: 'noah', name: 'Noah Shrader', avatarUrl: null };
let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (props: Record<string, unknown> = {}) => {
	const onSectionChange = vi.fn();
	current = await render(createElement(TopNav, { user: USER, section: 'projects', onSectionChange, onSignOut: () => undefined, ...props } as never));
	return onSectionChange;
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('the bar', () => {
	const header = () => document.querySelector('header') as HTMLElement;

	it('has the name at the left, the sections in the exact center, and the account at the far right', async () => {
		await show();
		// Three columns, the outer two equal: the middle one is centered whatever the widths of the others.
		expect(header().className.split(' ')).toEqual(expect.arrayContaining(['grid', 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]']));
		// The room for the window's buttons is on the outer columns: padding on the bar would move the center off the window's.
		expect(header().className).not.toMatch(/\bp[lrx]-/);
		const [left, middle, right] = [...header().children] as HTMLElement[];
		expect(left?.textContent).toBe('DSNR');
		expect(middle?.querySelector('[role="tablist"]')).not.toBeNull();
		expect(right?.textContent).toContain('Noah Shrader');
		expect(right?.className.split(' ')).toContain('justify-self-end');
	});

	it('keeps the columns before signing in, with only the name', async () => {
		await show({ user: null });
		expect([...header().children]).toHaveLength(3);
		expect(header().textContent).toBe('DSNR');
	});
});

describe('the account menu', () => {
	// The account is the last button in the bar, after the section tabs.
	const open = () => openMenu([...document.querySelectorAll('header button')].at(-1) as HTMLElement);

	it('has Settings above Sign out', async () => {
		await show();
		expect((await open()).map((i) => i.textContent)).toEqual(['Settings', 'Sign out']);
	});

	it('opens Settings from its item', async () => {
		const onSettings = vi.fn();
		await show({ onSettings });
		const [settings] = await open();
		await press(settings!);
		expect(onSettings).toHaveBeenCalledOnce();
	});
});

describe('the sections', () => {
	it('are two tabs, Projects and Design System, with the one you are in selected', async () => {
		await show();
		expect(document.querySelector('[role="tablist"]')).not.toBeNull();
		expect(tabs().map((t) => t.textContent)).toEqual(['Projects', 'Design System']);
		expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
		await unmountAll(current!.root);
		await show({ section: 'design-system' });
		expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
	});

	it('look like a toggle, the pill, and not the underlined line', async () => {
		await show();
		expect(document.querySelector('[data-slot="tabs-list"]')?.getAttribute('data-variant')).toBe('default');
		expect(document.querySelector('[data-slot="tabs-list"]')?.className.split(' ')).toContain('bg-muted');
	});

	it('go to the section pressed, and do nothing for the one you are in', async () => {
		const onSectionChange = await show();
		await chooseTab(tabs()[1]!);
		expect(onSectionChange).toHaveBeenCalledWith('design-system');
		onSectionChange.mockClear();
		await chooseTab(tabs()[0]!);
		expect(onSectionChange).not.toHaveBeenCalled();
	});

	it('can be pressed in a window that is dragged by its bar', async () => {
		await show();
		expect(document.querySelector('[data-slot="tabs"]')?.className.split(' ')).toContain('app-no-drag');
	});

	it('are not there before signing in', async () => {
		await show({ user: null });
		expect(tabs()).toHaveLength(0);
		expect(document.body.textContent).toContain('DSNR');
	});
});
