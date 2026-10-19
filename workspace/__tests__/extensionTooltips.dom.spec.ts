import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_MS, TooltipHost } from '../src/ui/Tooltip';
import { mount, unmount } from './webviewHarness';

/**
 * Every tooltip in a DSNR page (the VS Code panel and its tabs), told by one host. The browser's own wait for a `title` is
 * seconds and not the page's to set, so a pointer that stays on anything with a `title` is told it here, after one wait; one
 * passing by is told nothing; and the title is the browser's again once the pointer is gone.
 */

// A pointer event, as a browser has one; the test window has none of its own.
(window as unknown as Record<string, unknown>).PointerEvent ??= class extends MouseEvent {
	pointerType: string;
	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.pointerType = init.pointerType ?? 'mouse';
	}
};

const window0 = { width: window.innerWidth, height: window.innerHeight };
afterEach(() => {
	vi.useRealTimers();
	Object.assign(window, { innerWidth: window0.width, innerHeight: window0.height });
});

const show = async (extra: Parameters<typeof createElement>[2][] = []) => {
	await mount(
		createElement(
			'div',
			null,
			createElement(TooltipHost),
			createElement('button', { id: 'a', title: 'Says A' }, 'A'),
			createElement('button', { id: 'b', title: 'Says B' }, 'B'),
			createElement('p', { id: 'plain' }, 'Nothing to say'),
			createElement('div', { id: 'outer', title: 'The outer' }, createElement('span', { id: 'inner' }, 'inside it')),
			createElement('div', { id: 'iframe-box' }, createElement('iframe', { id: 'frame', title: 'A component' })),
			...extra,
		),
	);
	vi.useFakeTimers();
};
const el = (id: string) => document.getElementById(id) as HTMLElement;
const over = (id: string, pointerType = 'mouse') =>
	act(async () => void el(id).dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType })));
const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
const told = () => [...document.querySelectorAll('[role="tooltip"]')].map((t) => t.textContent);

describe('a tooltip', () => {
	it('is told after one second on something with a title, and not before', async () => {
		expect(TOOLTIP_DELAY_MS).toBe(1000);
		await show();
		await over('a');
		await wait(TOOLTIP_DELAY_MS - 1);
		expect(told()).toEqual([]);
		await wait(1);
		expect(told()).toEqual(['Says A']);
	});

	it('takes the title for as long as the pointer is on it, so the browser tells nothing as well, and gives it back when the pointer goes', async () => {
		await show();
		await over('a');
		expect(el('a').hasAttribute('title')).toBe(false);
		await wait(TOOLTIP_DELAY_MS);
		expect(el('a').hasAttribute('title')).toBe(false);
		await over('plain');
		expect(el('a').getAttribute('title')).toBe('Says A');
		expect(told()).toEqual([]);
	});

	it('is told by a line for each line of its title, as the colour dots’ are', async () => {
		await show([createElement('button', { key: 'c', id: 'c', title: 'Light primary main\npineGreen 50' }, 'C')]);
		await over('c');
		await wait(TOOLTIP_DELAY_MS);
		expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Light primary main\npineGreen 50');
	});

	it('tells nothing of a pointer that goes by before the wait is over, and gives its title back', async () => {
		await show();
		await over('a');
		await wait(600);
		await over('plain');
		await wait(2000);
		expect(told()).toEqual([]);
		expect(el('a').getAttribute('title')).toBe('Says A');
	});

	it('opens the next at once once one has been told, so moving along a row is not a wait for each, and only for a moment', async () => {
		await show();
		await over('a');
		await wait(TOOLTIP_DELAY_MS);
		await over('b');
		await wait(0);
		expect(told()).toEqual(['Says B']);
		// Then apart for longer than that: the wait again.
		await over('plain');
		await wait(TOOLTIP_SKIP_MS + 50);
		await over('a');
		await wait(TOOLTIP_DELAY_MS - 1);
		expect(told()).toEqual([]);
		await wait(1);
		expect(told()).toEqual(['Says A']);
	});

	it('tells of what is nearest the pointer, and of the one it is on again when it moves into what has none of its own', async () => {
		await show();
		await over('outer');
		await wait(TOOLTIP_DELAY_MS);
		expect(told()).toEqual(['The outer']);
		// Into a child with nothing to say: still the outer's, not whatever is above it.
		await over('inner');
		await wait(TOOLTIP_DELAY_MS);
		expect(told()).toEqual(['The outer']);
		expect(el('outer').hasAttribute('title')).toBe(false);
	});

	it('goes when the pointer presses, a key is pressed or the page scrolls, and its title is given back', async () => {
		for (const [what, send] of [
			['a press', () => window.dispatchEvent(new Event('pointerdown'))],
			['a key', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
			['a scroll', () => document.dispatchEvent(new Event('scroll'))],
		] as const) {
			await unmount();
			await show();
			await over('a');
			await wait(TOOLTIP_DELAY_MS);
			expect(told(), what).toEqual(['Says A']);
			await act(async () => void send());
			expect(told(), what).toEqual([]);
			expect(el('a').getAttribute('title'), what).toBe('Says A');
			vi.useRealTimers();
		}
	});

	it('goes when what it is about is taken away under a pointer that has not moved', async () => {
		await show();
		await over('a');
		await wait(TOOLTIP_DELAY_MS);
		expect(told()).toEqual(['Says A']);
		await act(async () => void el('a').remove());
		expect(told()).toEqual([]);
	});

	it('keeps the title the page gave while the pointer was on it, rather than giving back the old one', async () => {
		await show();
		await over('a');
		await act(async () => void el('a').setAttribute('title', 'Says something else'));
		await over('plain');
		expect(el('a').getAttribute('title')).toBe('Says something else');
	});

	it('is told for a mouse only, and leaves a frame’s title, which is its name and not a tooltip', async () => {
		await show();
		await over('a', 'touch');
		await over('a', 'pen');
		await wait(TOOLTIP_DELAY_MS * 2);
		expect(told()).toEqual([]);
		expect(el('a').getAttribute('title')).toBe('Says A');
		await over('frame');
		await wait(TOOLTIP_DELAY_MS);
		expect(told()).toEqual([]);
		expect(el('frame').getAttribute('title')).toBe('A component');
	});

	it('is told once, however the pointer moves over it before the wait is over', async () => {
		await show();
		await over('a');
		await wait(500);
		await over('a');
		await wait(500);
		expect(told()).toEqual(['Says A']);
	});

	it('is gone with the page: a pointer on something when the host is unmounted has its title back', async () => {
		await show();
		const outside = document.body.appendChild(document.createElement('button'));
		outside.title = 'Outside the page’s root';
		await act(async () => void outside.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })));
		expect(outside.hasAttribute('title')).toBe(false);
		await unmount();
		expect(outside.getAttribute('title')).toBe('Outside the page’s root');
	});

	/** Where each thing is, as the browser would measure it: the thing being told of, and the tooltip once it is drawn. */
	const measured = (about: { left: number; top: number; bottom: number }, tip = { width: 100, height: 30 }) =>
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
			const r =
				this.getAttribute('role') === 'tooltip'
					? { ...tip, left: 0, top: 0, right: tip.width, bottom: tip.height }
					: { ...about, right: about.left + 20 };
			return {
				x: r.left,
				y: r.top,
				width: 'width' in r ? r.width : 20,
				height: 'height' in r ? r.height : r.bottom - r.top,
				...r,
				toJSON: () => r,
			} as DOMRect;
		});

	it('is placed under what it is about, drawn only once placed, and kept inside the page at its right edge', async () => {
		await show();
		Object.assign(window, { innerWidth: 320, innerHeight: 600 });
		const spy = measured({ left: 290, top: 20, bottom: 40 });
		await over('a');
		await wait(TOOLTIP_DELAY_MS);
		const tip = document.querySelector('[role="tooltip"]') as HTMLElement;
		// Under it (its bottom 40, a gap of 4), and in from the right edge by its own width and the margin (320 - 100 - 8).
		expect([tip.style.left, tip.style.top, tip.style.visibility]).toEqual(['212px', '44px', 'visible']);
		spy.mockRestore();
	});

	it('is placed over what it is about when there is no room under it, and never off the top or the left of the page', async () => {
		await show();
		Object.assign(window, { innerWidth: 320, innerHeight: 600 });
		const spy = measured({ left: -30, top: 580, bottom: 598 });
		await over('a');
		await wait(TOOLTIP_DELAY_MS);
		const tip = document.querySelector('[role="tooltip"]') as HTMLElement;
		// Over it: its top 580, a gap of 4 and its own height 30 above that; in from the left edge by the margin.
		expect([tip.style.left, tip.style.top]).toEqual(['8px', '546px']);
		spy.mockRestore();
	});
});
