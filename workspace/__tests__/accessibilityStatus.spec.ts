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
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a prototype’s accessibility', () => {
	it('says what the automated check found, in the words used everywhere, and lists it with what it was made with', async () => {
		await show(ok(RESULT));
		expect(control().textContent).toBe('1 automated issue, 1 needs a person');
		expect(control().className).toContain('text-warning');
		await press(control());
		const list = document.body.textContent ?? '';
		expect(list).toContain('Checked with axe-core 4.14.0 at WCAG 2.0 Level A, in default, empty.');
		expect(list).toContain('this is not a pass');
		expect(list).toContain('Images must have alternate text');
		expect(list).toContain('WCAG 1.1.1 · critical · 2 elements · in empty');
		expect(list).toContain('For a person to judge (axe could not decide)');
		expect(document.querySelector('a[href="https://dequeuniversity.com/rules/axe/4.14/image-alt"]')?.getAttribute('target')).toBe('_blank');
	});

	it('never says a pass, at most that automated checks found nothing, and says what no check covers', async () => {
		await show(ok({ ...RESULT, violations: [], incomplete: [], notAutomated: ['WCAG 2.2 Level A'] }));
		expect(control().textContent).toBe('No issues found by automated checks');
		expect(control().className).not.toContain('text-warning');
		await press(control());
		expect(document.body.textContent).toContain('No automated check covers WCAG 2.2 Level A');
		expect(document.body.textContent).not.toMatch(/\bpasses\b|compliant|conforms/i);
	});

	it('says it was not checked, and why, when the check could not run', async () => {
		await show(fail('The page did not load in its empty state, so it could not be checked.'));
		expect(control().textContent).toBe('Accessibility not checked');
		expect(control().title).toBe('The page did not load in its empty state, so it could not be checked.');
	});

	it('is not asked for before the page is open', async () => {
		const app = await show(ok(RESULT), null);
		expect(app.calls.checkAccessibility).toBeUndefined();
		expect(document.querySelector('button')).toBeNull();
	});
});
