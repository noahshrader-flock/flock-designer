// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessibilityStatus } from '../src/renderer/AccessibilityStatus';
import type { AccessibilityResult } from '../src/shared/contract';
import { fail, fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';

/** What a prototype's toolbar says of its accessibility check (T7 of the design system plan, part B). */

const RESULT: AccessibilityResult = {
	ran: { axe: '4.14.0', tags: ['wcag2a'], target: 'WCAG 2.0 Level A', declared: true, at: '2026-10-10T00:00:00.000Z', states: ['default', 'empty'] },
	violations: [
		{
			rule: 'image-alt',
			help: 'Images must have alternate text',
			impact: 'critical',
			criteria: ['1.1.1'],
			nodes: 2,
			url: 'https://dequeuniversity.com/rules/axe/4.14/image-alt',
			states: ['empty'],
		},
	],
	incomplete: [
		{
			rule: 'color-contrast',
			help: 'Elements must meet minimum color contrast',
			impact: 'serious',
			criteria: ['1.4.3'],
			nodes: 1,
			url: 'https://dequeuniversity.com/rules/axe/4.14/color-contrast',
			states: ['default'],
		},
	],
	notAutomated: [],
};

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (answer: unknown, opened: unknown = {}) => {
	const app = fakeApp({ checkAccessibility: async () => answer });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(AccessibilityStatus, { projectId: 'demo', name: 'v1-i1', opened }));
	await settle();
	return app;
};
const control = () => document.querySelector('button') as HTMLButtonElement;
const dialog = () => document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a prototype’s accessibility', () => {
	it('is a ghost button with the accessibility icon and how many issues the automated check found, as a component’s card has', async () => {
		await show(ok(RESULT));
		expect(control().getAttribute('data-variant')).toBe('ghost');
		expect(control().querySelector('.lucide-accessibility')).not.toBeNull();
		expect(control().textContent).toBe('1');
		expect(control().getAttribute('data-accessibility')).toBe('1');
		expect(control().className).toContain('text-warning');
		// The words are for a screen reader and for hover: the same ones the card's badge uses everywhere.
		expect(control().getAttribute('aria-label')).toBe('1 automated issue, 1 needs a person');
		expect(control().title).toBe('1 automated issue, 1 needs a person');
	});

	it('opens what the check found in a modal, with what it was made with, and not before it is pressed', async () => {
		await show(ok(RESULT));
		expect(dialog()).toBeNull();
		await press(control());
		expect(dialog()).not.toBeNull();
		expect(dialog()!.querySelector('[data-slot="dialog-title"]')!.textContent).toBe('Accessibility');
		const list = dialog()!.textContent ?? '';
		expect(list).toContain('1 automated issue, 1 needs a person');
		expect(list).toContain('Checked with axe-core 4.14.0 at WCAG 2.0 Level A, in default, empty.');
		expect(list).toContain('this is not a pass');
		expect(list).toContain('Images must have alternate text');
		expect(list).toContain('WCAG 1.1.1 · critical · 2 elements · in empty');
		expect(list).toContain('For a person to judge (axe could not decide)');
		expect(document.querySelector('a[href="https://dequeuniversity.com/rules/axe/4.14/image-alt"]')?.getAttribute('target')).toBe('_blank');
	});

	it('closes again, with its own close button', async () => {
		await show(ok(RESULT));
		await press(control());
		await press(dialog()!.querySelector<HTMLElement>('[data-slot="dialog-close"]')!);
		await settle();
		expect(dialog()).toBeNull();
	});

	it('never says a pass, at most that automated checks found nothing, and says what no check covers', async () => {
		await show(ok({ ...RESULT, violations: [], incomplete: [], notAutomated: ['WCAG 2.2 Level A'] }));
		expect(control().textContent).toBe('0');
		expect(control().getAttribute('aria-label')).toBe('No issues found by automated checks');
		expect(control().className).not.toContain('text-warning');
		await press(control());
		expect(dialog()!.textContent).toContain('No issues found by automated checks');
		expect(dialog()!.textContent).toContain('No automated check covers WCAG 2.2 Level A');
		expect(document.body.textContent).not.toMatch(/\bpasses\b|compliant|conforms/i);
	});

	it('is, while it is being checked, a button that is off with a spinner, named for what it is doing', async () => {
		await show(new Promise(() => undefined));
		expect(control().disabled).toBe(true);
		expect(control().querySelector('[data-slot="spinner"], .animate-spin')).not.toBeNull();
		expect(control().getAttribute('aria-label')).toBe('Checking accessibility…');
		expect(control().title).toBe('');
		expect(control().textContent).toBe('');
	});

	it('says it was not checked, and why, where the reason can be read: a button that opens it, named with it', async () => {
		const why = 'The page did not load in its empty state, so it could not be checked.';
		await show(fail(why));
		// Not a disabled button with the reason in its title: a disabled button never shows a title.
		expect(control().disabled).toBe(false);
		expect(control().querySelector('.lucide-accessibility')).not.toBeNull();
		expect(control().getAttribute('aria-label')).toBe(`Accessibility not checked: ${why}`);
		expect(control().textContent).toBe('');
		await press(control());
		expect(dialog()!.textContent).toContain('Not checked');
		expect(dialog()!.textContent).toContain(why);
	});

	it('is not asked for before the page is open', async () => {
		const app = await show(ok(RESULT), null);
		expect(app.calls.checkAccessibility).toBeUndefined();
		expect(document.querySelector('button')).toBeNull();
	});
});
