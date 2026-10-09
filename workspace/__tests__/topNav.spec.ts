// @vitest-environment jsdom
import { createElement } from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopNav } from '../src/renderer/TopNav';
import { render, unmountAll } from './reviewHarness';

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

const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
/** Tabs switch as the pointer goes down, as a person's press does. */
const choose = (tab: HTMLElement) => act(async () => void tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })));

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
		await choose(tabs()[1]!);
		expect(onSectionChange).toHaveBeenCalledWith('design-system');
		onSectionChange.mockClear();
		await choose(tabs()[0]!);
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
