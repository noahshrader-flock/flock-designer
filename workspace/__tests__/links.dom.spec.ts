import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineAction, OutLink } from '../src/renderer/Links';
import { button, press, render, unmountAll } from './reviewHarness';
import { offenders } from './windowSources';

/**
 * A link is drawn one way: a link out of the app is an OutLink, underlined with the mark that says it leaves, and a
 * button that reads as a link in a sentence (Clear search, Change) is an InlineAction. A guard fails if a screen styles
 * one by hand.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('a link out', () => {
	it('opens in the browser, holds anything a link can, and says it leaves the app', async () => {
		current = await render(createElement(OutLink, { href: 'https://example.test/a', children: createElement('code', null, 'a') }));
		const a = document.querySelector('a')!;
		expect([a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]).toEqual(['https://example.test/a', '_blank', 'noreferrer']);
		expect(a.querySelector('code')?.textContent).toBe('a');
		expect(a.querySelector('svg')).not.toBeNull();
	});
});

describe('an action in a sentence', () => {
	it('is a button, not a submit, that does what it is given and can be off', async () => {
		const onClick = vi.fn();
		current = await render(createElement(InlineAction, { onClick, children: 'Clear search' }));
		const b = button('Clear search');
		expect(b.type).toBe('button');
		await press(b);
		expect(onClick).toHaveBeenCalledOnce();
		await unmountAll(current.root);
		current = await render(createElement(InlineAction, { onClick, disabled: true, children: 'Change' }));
		expect(button('Change').disabled).toBe(true);
	});
});

describe('every link', () => {
	it('is drawn by one of the two: no screen styles a link of its own', () => {
		expect(offenders(/underline-offset|variant="link"/, 'Links.tsx')).toEqual([]);
	});
});
