// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoRepositoryAlert, Notice, RetryButton } from '../src/renderer/Notice';
import { Alert } from '../src/renderer/ui/alert';
import { button, press, render, unmountAll } from './reviewHarness';
import { windowSources } from './windowSources';

/**
 * A notice is shadcn's alert as it is made: an icon, a title, what it says, and its one button in the alert's own action
 * slot, with no layout of the app's laid over any part. "Try again" is one button, the same wherever it is, and "No
 * product repository found" is said one way. A guard holds every screen to it.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});
/** An alert's parts, in order, and what each is. */
const parts = (alert: Element) => [...alert.children].map((c) => (c.tagName === 'svg' ? 'icon' : (c.getAttribute('data-slot') ?? c.tagName)));

describe('a notice', () => {
	it('is the stock alert: icon, title, description and the action in its slot', async () => {
		const onRetry = vi.fn();
		current = await render(
			createElement(Notice, { title: 'Could not read it', action: createElement(RetryButton, { onClick: onRetry }), children: 'git is missing' }),
		);
		const alert = document.querySelector('[data-slot="alert"]')!;
		expect(parts(alert)).toEqual(['icon', 'alert-title', 'alert-description', 'alert-action']);
		await press(button('Try again'));
		expect(onRetry).toHaveBeenCalledOnce();
	});

	it('is destructive when it says something could not be read, in the stock destructive alert', async () => {
		current = await render(createElement(Notice, { variant: 'destructive', title: 'Could not read it', children: 'x' }));
		const reference = await render(createElement(Alert, { variant: 'destructive' }));
		expect(document.querySelector('[data-slot="alert"]')!.className).toBe(reference.host.querySelector('[data-slot="alert"]')!.className);
		await unmountAll(reference.root);
	});

	it('says no product repository was found one way, with Find it', async () => {
		const onFind = vi.fn();
		current = await render(createElement(NoRepositoryAlert, { onFind }));
		expect(document.querySelector('[data-slot="alert-title"]')!.textContent).toBe('No product repository found');
		await press(button('Find it'));
		expect(onFind).toHaveBeenCalledOnce();
	});

	it('tries again with an outline button', async () => {
		current = await render(createElement(RetryButton, { onClick: () => undefined }));
		expect(button('Try again').getAttribute('data-variant')).toBe('outline');
	});
});

describe('every alert', () => {
	it('keeps buttons out of what it says: a Button in an AlertDescription is laid out by hand', () => {
		const own = windowSources().filter(({ text }) => /<AlertDescription[^>]*>(?:(?!<\/AlertDescription>)[\s\S])*<Button\b/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});

	it('lays nothing of its own over the action slot or the description', () => {
		const own = windowSources('ErrorAlert.tsx').filter(({ text }) => /<(AlertAction|AlertDescription) className=/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});

	it('says Try again with the one RetryButton, and No product repository found with the one alert', () => {
		const own = windowSources('Notice.tsx').filter(({ text }) => /^\s*Try again\s*$|>Try again<|No product repository found/m.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});
