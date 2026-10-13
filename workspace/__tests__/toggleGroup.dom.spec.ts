import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToggleGroup, ToggleGroupItem } from '../src/renderer/ui/toggle-group';
import { render, unmountAll } from './reviewHarness';

/**
 * The toggle group's option to fill the width it is given (the Design System tab's side-panel switch), which the other
 * groups, a View switch and a prototype's states, do not take: they are as wide as what is in them.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const group = async (fullWidth?: boolean) => {
	current = await render(
		createElement(
			ToggleGroup,
			{ type: 'single', 'aria-label': 'View', value: 'a', ...(fullWidth === undefined ? {} : { fullWidth }) },
			createElement(ToggleGroupItem, { value: 'a' }, 'A'),
			createElement(ToggleGroupItem, { value: 'b' }, 'B'),
		),
	);
	return document.querySelector('[data-slot="toggle-group"]') as HTMLElement;
};

describe('the toggle group', () => {
	it('is as wide as its buttons unless it is asked to fill the width it is given', async () => {
		const g = await group();
		// The width is applied by the attribute alone, so without it the group keeps its own.
		expect(g.hasAttribute('data-full-width')).toBe(false);
		expect(g.className).toContain('w-fit');
	});

	it('fills it when asked, each button taking an equal share', async () => {
		const g = await group(true);
		expect(g.getAttribute('data-full-width')).toBe('true');
		expect(g.className).toContain('data-[full-width=true]:w-full');
		for (const item of g.querySelectorAll('[data-slot="toggle-group-item"]'))
			expect(item.className).toContain('group-data-[full-width=true]/toggle-group:flex-1');
	});
});
