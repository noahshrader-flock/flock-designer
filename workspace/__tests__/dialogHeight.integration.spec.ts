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

	it('draws a group as one card: its buttons across it with the same room at both ends, and what it affects at its bottom, clear of them', async () => {
		const m = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 500, height: 800 });
			const group =
				'<section class="changed"><div class="changed-header"><h4 class="heading heading-set">FSFab</h4></div>' +
				'<div class="branch-actions"><div class="button-row"><button class="button">Save to a branch</button><button class="button">Process changes</button></div></div>' +
				'<div data-reach><details class="list-disclosure"><summary class="disclosure-summary">3 components affected</summary><div>x</div></details></div></section>';
			await tab.setContent(
				barPage(
					renderToStaticMarkup(
						createElement(Dialog, {
							title: 'Changes',
							onClose: noop,
							children: createElement('div', { dangerouslySetInnerHTML: { __html: group } }),
						}),
					),
				),
			);
			return tab.evaluate(() => {
				const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
				const [first, second] = [...document.querySelectorAll('.branch-actions .button')].map((b) => b.getBoundingClientRect());
				const row = rect('.branch-actions .button-row');
				const card = rect('.changed');
				const reach = rect('[data-reach]');
				const style = getComputedStyle(document.querySelector('.changed')!);
				const space = (n: number) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--dsnr-space-${n}`));
				return {
					left: first!.left - row.left,
					right: row.right - second!.right,
					between: second!.left - first!.right,
					step: space(4),
					border: parseFloat(style.borderTopWidth),
					padded: row.left - card.left - parseFloat(style.borderLeftWidth),
					padding: space(5),
					inside: reach.bottom <= card.bottom && reach.left >= card.left,
					below: reach.top - row.bottom,
					gap: space(3),
				};
			});
		});
		expect(Math.abs(m.left - m.right)).toBeLessThan(1);
		expect(m.left).toBeLessThan(1);
		expect(m.between).toBeCloseTo(m.step, 0);
		expect(m.border).toBe(1);
		expect(m.padded).toBeCloseTo(m.padding, 0);
		expect(m.inside).toBe(true);
		expect(m.below).toBeGreaterThanOrEqual(m.gap - 1);
	});

	it('keeps a count off the title it follows in a group’s heading, which is a row that drops the space written between them', async () => {
		const m = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 500, height: 300 });
			await tab.setContent(barPage('<h4 class="heading heading-set">Tokens <span class="section-count">0</span></h4>'));
			return tab.evaluate(() => {
				const title = document.querySelector('.heading-set')!.firstChild as Text;
				const range = document.createRange();
				range.selectNodeContents(title);
				const words = [...range.getClientRects()].at(-1)!;
				return {
					apart: document.querySelector('.section-count')!.getBoundingClientRect().left - words.right,
					step: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsnr-space-2')),
				};
			});
		});
		expect(m.apart).toBeGreaterThanOrEqual(m.step - 0.5);
	});

	it('puts an action in the title’s row at the far right beside the close, the title keeping the rest of the row', async () => {
		const m = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 500, height: 300 });
			await tab.setContent(
				barPage(
					renderToStaticMarkup(
						createElement(Dialog, {
							title: 'Changes',
							onClose: noop,
							actions: createElement('button', { className: 'link' }, 'Reset all'),
							children: 'x',
						}),
					),
				),
			);
			return tab.evaluate(() => {
				const [title, action, close, head] = ['.dialog-title', '.dialog-head .link', '.dialog-close', '.dialog-head'].map((s) =>
					document.querySelector(s)!.getBoundingClientRect(),
				);
				return {
					order: title!.left < action!.left && action!.right <= close!.left,
					closeAtEnd: Math.abs(head!.right - close!.right),
					apart: close!.left - action!.right,
					gap: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsnr-space-4')),
					titleAtStart: Math.abs(title!.left - head!.left),
				};
			});
		});
		expect(m.order).toBe(true);
		expect(m.closeAtEnd).toBeLessThan(1);
		expect(m.titleAtStart).toBeLessThan(1);
		expect(m.apart).toBeCloseTo(m.gap, 0);
	});
});
