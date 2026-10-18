import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip, TooltipContent, TooltipTrigger } from '../src/viewer/ui/tooltip';
import { render, unmountAll } from './reviewHarness';
import { offenders } from './windowSources';

/**
 * How long a tooltip waits: one delay for the whole app, set on the provider the window and the published page are built
 * in, so a quick scan across a toolbar opens nothing that is then in the way, and a person who stops on something is told.
 * Keyboard focus is not hovering: it tells at once.
 */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	vi.useRealTimers();
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const show = async () => {
	current = await render(
		createElement(
			'div',
			null,
			createElement(
				Tooltip,
				null,
				createElement(TooltipTrigger, { asChild: true }, createElement('button', { id: 'a' }, 'A')),
				createElement(TooltipContent, null, 'Says A'),
			),
			createElement(
				Tooltip,
				null,
				createElement(TooltipTrigger, { asChild: true }, createElement('button', { id: 'b' }, 'B')),
				createElement(TooltipContent, null, 'Says B'),
			),
		),
	);
	vi.useFakeTimers();
};
const hover = (id: string) =>
	act(async () => void document.getElementById(id)?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })));
// React makes a pointer leaving from the browser's `pointerout`, to something that is not inside the trigger.
const leave = (id: string) =>
	act(
		async () =>
			void document
				.getElementById(id)
				?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body } as PointerEventInit)),
	);
const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
const open = () => [...document.querySelectorAll('[role="tooltip"]')].map((t) => t.textContent);

describe('a tooltip', () => {
	it('waits most of a second before it opens on hover, so passing over it opens nothing', async () => {
		await show();
		await hover('a');
		await wait(300);
		expect(open()).toEqual([]);
		await wait(400);
		expect(open()).toEqual([]);
		await wait(150);
		expect(open()).toEqual(['Says A']);
	});

	it('never opens for a pointer that has gone by before the wait is over', async () => {
		await show();
		await hover('a');
		await wait(500);
		await leave('a');
		await wait(1000);
		expect(open()).toEqual([]);
	});

	it('opens the next at once once one is open, so moving along a toolbar is not a wait for each', async () => {
		await show();
		await hover('a');
		await wait(900);
		await leave('a');
		await hover('b');
		await wait(50);
		expect(open()).toEqual(['Says B']);
	});

	it('tells at once on keyboard focus, which is not a pointer passing by', async () => {
		await show();
		await act(async () => void document.getElementById('a')?.focus());
		expect(open()).toEqual(['Says A']);
	});

	it('is not hovered into: the pointer leaving its trigger closes it, so it never stands over what is under it', async () => {
		await show();
		await hover('a');
		await wait(900);
		expect(open()).toEqual(['Says A']);
		await leave('a');
		await wait(50);
		expect(open()).toEqual([]);
	});
});

describe('every tooltip', () => {
	it('waits as the provider says: none sets a delay of its own', () => {
		expect(offenders(/delayDuration=/)).toEqual([]);
	});
});
