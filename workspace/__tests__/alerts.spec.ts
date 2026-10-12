// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishBanner } from '../src/renderer/PublishStatus';
import { AlertAction, AlertDescription } from '../src/renderer/ui/alert';
import { Button } from '../src/renderer/ui/button';
import { DesignSystem } from '../src/renderer/DesignSystem';
import type { PublishStatus } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';

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

describe('the sync notice', () => {
	const held: PublishStatus = {
		state: 'held',
		at: '2026-10-08T10:00:00Z',
		problems: [
			{ what: 'Project records', why: '10 changes outside the project records are waiting to be pushed.' },
			{ what: 'Prototype', why: 'The page could not be saved.' },
		],
	};

	it('is the alert as shadcn makes it: an icon, a title, a description, and the button in its action slot', async () => {
		const app = fakeApp();
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(PublishBanner, { status: held, onChange: vi.fn() }));
		const alert = document.querySelector('[data-slot="alert"]')!;
		expect(parts(alert)).toEqual(['icon', 'alert-title', 'alert-description', 'alert-action']);
		expect(alert.querySelector('[data-slot="alert-title"]')!.textContent).toBe('Some of your work is not synced yet');
		expect(alert.querySelector('[data-slot="alert-action"]')!.contains(button('Try again'))).toBe(true);
	});

	it('says each problem as a paragraph, with no list, no bold, and no classes of its own on the description or the button', async () => {
		const app = fakeApp();
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(PublishBanner, { status: held, onChange: vi.fn() }));
		const description = document.querySelector('[data-slot="alert-description"]')!;
		expect([...description.children].map((c) => [c.tagName, c.textContent])).toEqual([
			['P', 'Project records: 10 changes outside the project records are waiting to be pushed.'],
			['P', 'Prototype: The page could not be saved.'],
		]);
		expect(description.querySelector('ul, li, b, strong, button')).toBeNull();
		// Exactly the classes the components give themselves: the same as a bare one, with none of the screen's laid over.
		const reference = await render(
			createElement('div', null, createElement(AlertDescription), createElement(AlertAction), createElement(Button, { variant: 'outline' }, 'x')),
		);
		expect(description.className).toBe(reference.host.querySelector('[data-slot="alert-description"]')!.className);
		expect(document.querySelector('[data-slot="alert-action"]')!.className).toBe(
			reference.host.querySelector('[data-slot="alert-action"]')!.className,
		);
		expect(button('Try again').className).toBe(reference.host.querySelector('button')!.className);
		await unmountAll(reference.root);
	});

	it('tries again when the button is pressed, and shows nothing when nothing is held', async () => {
		const publishNow = vi.fn(async () => ok({ state: 'shared', at: 'x' }));
		const onChange = vi.fn();
		(window as unknown as { workspace: unknown }).workspace = fakeApp({ publishNow }).api;
		current = await render(createElement(PublishBanner, { status: held, onChange }));
		await press(button('Try again'));
		await settle();
		expect(publishNow).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith({ state: 'shared', at: 'x' });
		await unmountAll(current.root);
		current = await render(createElement(PublishBanner, { status: { state: 'shared', at: 'x' }, onChange }));
		expect(document.querySelector('[data-slot="alert"]')).toBeNull();
	});
});

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
