import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChangeRow, ValueList } from '../src/ui/ValueItem';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { barPage } from './panelStyles';

const codicons = readFileSync(join(__dirname, '..', 'node_modules/@vscode/codicons/dist/codicon.css'), 'utf8').replace(/url\([^)]*\)/g, 'none');

describe.skipIf(NO_CHROME)('a change’s row, in the browser on this machine', () => {
	const centres = (under: boolean) =>
		inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 380, height: 300 });
			const row = createElement(ChangeRow, {
				name: 'Font size · sm',
				from: '12px',
				to: '16px',
				under: under ? createElement('span', { className: 'value-place' }, 'src/utils/theme.ts (160)') : undefined,
				onReset: () => undefined,
			});
			await tab.setContent(
				barPage(`<style>${codicons}</style><section class="changed">${renderToStaticMarkup(createElement(ValueList, { children: row }))}</section>`),
			);
			return tab.evaluate(() => {
				const mid = (r: DOMRect) => r.top + r.height / 2;
				const words = (el: Element) => {
					const range = document.createRange();
					range.selectNodeContents(el);
					return mid(range.getBoundingClientRect());
				};
				return {
					name: words(document.querySelector('.value-label')!),
					values: words(document.querySelector('.value-drawn')!),
					undo: mid(document.querySelector('.item-actions button')!.getBoundingClientRect()),
				};
			});
		});

	it('has its name, its values and its undo on one centre line', async () => {
		const c = await centres(false);
		expect(Math.abs(c.values - c.name)).toBeLessThan(1.5);
		expect(Math.abs(c.undo - c.name)).toBeLessThan(1.5);
	});

	it('keeps them there with a line under it, which the undo does not centre itself on', async () => {
		const c = await centres(true);
		expect(Math.abs(c.values - c.name)).toBeLessThan(1.5);
		expect(Math.abs(c.undo - c.name)).toBeLessThan(1.5);
	});
});
