// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoRepositoryAlert, Notice, RetryButton } from '../src/renderer/Notice';
import { Alert } from '../src/renderer/ui/alert';
import { button, press, render, unmountAll, alertParts } from './reviewHarness';
import { offenders } from './windowSources';

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

describe('a notice', () => {
	it('is the stock alert: icon, title, description and the action in its slot', async () => {
		const onRetry = vi.fn();
		current = await render(
			createElement(Notice, { title: 'Could not read it', action: createElement(RetryButton, { onClick: onRetry }), children: 'git is missing' }),
		);
		const alert = document.querySelector('[data-slot="alert"]')!;
		expect(alertParts(alert)).toEqual(['icon', 'alert-title', 'alert-description', 'alert-action']);
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
		expect(offenders(/<AlertDescription[^>]*>(?:(?!<\/AlertDescription>)[\s\S])*<Button\b/)).toEqual([]);
	});

	it('lays nothing of its own over the action slot or the description', () => {
		expect(offenders(/<(AlertAction|AlertDescription) className=/, 'ErrorAlert.tsx')).toEqual([]);
	});

	it('says Try again with the one RetryButton, and No product repository found with the one alert', () => {
		expect(offenders(/^\s*Try again\s*$|>Try again<|No product repository found/m, 'Notice.tsx')).toEqual([]);
	});
});

describe('a notice with nothing to call it', () => {
	it('is its icon and what it says, with no empty title', async () => {
		current = await render(createElement(Notice, { variant: 'warning', children: 'Nothing is cloned over it.' }));
		expect(alertParts(document.querySelector('[data-slot="alert"]')!)).toEqual(['icon', 'alert-description']);
	});
});
