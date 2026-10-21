import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from '../src/ui/Dialog';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { barPage } from './panelStyles';

const noop = () => undefined;
const dialog = (rows: number) =>
	renderToStaticMarkup(
		createElement(Dialog, {
			title: 'Changes',
			onClose: noop,
			children: Array.from({ length: rows }, (_, i) => createElement('p', { key: i, style: { height: '40px', margin: 0 } }, `Row ${i}`)),
		}),
	);

describe.skipIf(NO_CHROME)('a dialog, in the browser on this machine', () => {
	const measure = (rows: number) =>
		inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 500, height: 800 });
			await tab.setContent(barPage(dialog(rows)));
			return tab.evaluate(() => {
				const box = document.querySelector('.dialog')!;
				const body = document.querySelector('.dialog-body') as HTMLElement;
				body.scrollTop = body.scrollHeight;
				const [head, close] = ['.dialog-head', '.dialog-close'].map((s) => document.querySelector(s)!.getBoundingClientRect());
				return {
					height: box.getBoundingClientRect().height,
					window: window.innerHeight,
					scrolls: body.scrollHeight > body.clientHeight,
					headTop: head!.top - box.getBoundingClientRect().top,
					closeShown: close!.top >= 0 && close!.bottom <= window.innerHeight,
					scrimScrolls: document.querySelector('.scrim')!.scrollHeight > document.querySelector('.scrim')!.clientHeight,
				};
			});
		});

	it('stops at three quarters of the window, its title and close in view, and the rest scrolls inside it, not the page behind', async () => {
		const m = await measure(60);
		expect(m.height).toBeLessThanOrEqual(m.window * 0.75 + 1);
		expect(m.scrolls).toBe(true);
		expect(m.headTop).toBeLessThan(40);
		expect(m.closeShown).toBe(true);
		expect(m.scrimScrolls).toBe(false);
	});

	it('is as tall as what it holds, where that is short, with nothing to scroll', async () => {
		const m = await measure(3);
		expect(m.height).toBeLessThan(m.window * 0.4);
		expect(m.scrolls).toBe(false);
	});

	it('spreads a branch’s buttons across the column, the same room at both ends, and sets a part below them apart from them', async () => {
		const m = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 500, height: 800 });
			const actions =
				'<div class="branch-actions"><div class="button-row"><button class="button">Save to a branch</button><button class="button">Process changes</button></div></div>' +
				'<section class="aside-section"><h2>Components affected</h2></section>';
			await tab.setContent(
				barPage(
					renderToStaticMarkup(
						createElement(Dialog, {
							title: 'Changes',
							onClose: noop,
							children: createElement('div', { dangerouslySetInnerHTML: { __html: actions } }),
						}),
					),
				),
			);
			return tab.evaluate(() => {
				const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
				const [first, second] = [...document.querySelectorAll('.branch-actions .button')].map((b) => b.getBoundingClientRect());
				const row = rect('.branch-actions .button-row');
				return {
					left: first!.left - row.left,
					right: row.right - second!.right,
					between: second!.left - first!.right,
					below: rect('.aside-section').top - row.bottom,
					step: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsnr-space-4')),
					room: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsnr-space-5')),
				};
			});
		});
		expect(Math.abs(m.left - m.right)).toBeLessThan(1);
		expect(m.left).toBeLessThan(1);
		expect(m.between).toBeCloseTo(m.step, 0);
		expect(m.below).toBeGreaterThanOrEqual(m.room - 1);
	});
});
