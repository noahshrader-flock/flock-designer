import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ListDisclosure } from '../src/ui/Section';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { barPage } from './panelStyles';

/** In the browser on this machine, as a person sees it in a dialog 420px wide. */
const list = (count: number) =>
	renderToStaticMarkup(
		createElement(ListDisclosure, {
			label: `Shared with ${count} components`,
			children: createElement(
				'ul',
				null,
				Array.from({ length: count }, (_, i) => createElement('li', { key: i, style: { height: '28px' } }, `Component ${i}`)),
			),
		}),
	);

describe.skipIf(NO_CHROME)('a long list under one line, in the browser on this machine', () => {
	it('is closed by default with its chevron at the end of the row, and opens into a list that scrolls in its own height', async () => {
		const measured = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 600, height: 800 });
			await tab.setContent(barPage(`<div style="width:420px">${list(46)}</div>`));
			return tab.evaluate(() => {
				const details = document.querySelector('details')!;
				const box = (el: Element) => el.getBoundingClientRect();
				const row = box(details.querySelector('summary')!);
				const closed = {
					open: details.open,
					height: box(details).height,
					chevronRight: box(details.querySelector('.collapse-chevron')!).right,
					rowRight: row.right,
				};
				details.open = true;
				const body = details.querySelector('.list-disclosure-body') as HTMLElement;
				return {
					closed,
					bodyHeight: box(body).height,
					scrolls: body.scrollHeight > body.clientHeight,
					fits: box(body).height <= window.innerHeight * 0.4 + 1,
				};
			});
		});
		expect(measured.closed.open).toBe(false);
		expect(measured.closed.height).toBeLessThan(40);
		expect(measured.closed.rowRight - measured.closed.chevronRight).toBeLessThan(2);
		expect(measured.scrolls).toBe(true);
		expect(measured.fits).toBe(true);
	});

	it('shows a short list whole, with nothing to scroll', async () => {
		const scrolls = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 600, height: 800 });
			await tab.setContent(barPage(`<div style="width:420px">${list(3)}</div>`));
			return tab.evaluate(() => {
				document.querySelector('details')!.open = true;
				const body = document.querySelector('.list-disclosure-body') as HTMLElement;
				return body.scrollHeight > body.clientHeight;
			});
		});
		expect(scrolls).toBe(false);
	});
});
