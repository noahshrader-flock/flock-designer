import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../src/renderer/ui/accordion';
import { render, unmountAll } from './reviewHarness';

/**
 * The accordion every list of groups in the app uses (the Design System's components and the tokens panel's): a group is as
 * tall as what is in it, always, and a line separates a group from the next only when the group is closed.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const show = async (open: string[]) => {
	current = await render(
		createElement(
			Accordion,
			{ type: 'multiple', defaultValue: open },
			...['a', 'b', 'c'].map((v) =>
				createElement(
					AccordionItem,
					{ key: v, value: v },
					createElement(AccordionTrigger, null, `Group ${v}`),
					createElement(AccordionContent, null, createElement('p', null, `What is in ${v}`)),
				),
			),
		),
	);
	return [...document.querySelectorAll<HTMLElement>('[data-slot="accordion-item"]')];
};

describe('the accordion', () => {
	it('is as tall as what is in it: nothing fixes a group’s height at what it was when it opened', async () => {
		await show(['a', 'b', 'c']);
		const inner = document.querySelector('[data-slot="accordion-content"] > div') as HTMLElement;
		expect(inner.textContent).toBe('What is in a');
		// Radix measures a group once, as it opens. A height taken from that stays when the rows change (a window resized, a
		// description wrapping, a picture arriving), leaving a gap under the group or cutting its last rows off.
		expect(inner.className).not.toContain('radix-accordion-content-height');
		expect(inner.className.split(' ').some((c) => /^h-/.test(c))).toBe(false);
	});

	it('has a line under a group only when it is closed, and never under the last one', async () => {
		const items = await show(['b']);
		const line = (item: HTMLElement) => item.className.split(' ').includes('not-last:data-[state=closed]:border-b');
		expect(items.map((i) => i.getAttribute('data-state'))).toEqual(['closed', 'open', 'closed']);
		for (const item of items) expect(line(item)).toBe(true);
		// Not a line under every group whether it is open or not.
		for (const item of items) expect(item.className.split(' ')).not.toContain('not-last:border-b');
	});

	it('does not clip what is in it: a card’s border is drawn just outside the card, and a group that cuts at its edge loses it', async () => {
		await show(['a']);
		const content = document.querySelector('[data-slot="accordion-content"]') as HTMLElement;
		expect(content.className.split(' ')).not.toContain('overflow-hidden');
		// Nor the animation that edge was kept for: it has no keyframes, so it never ran.
		expect(content.className).not.toContain('animate-accordion');
	});
});
