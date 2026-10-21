import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Page } from 'puppeteer-core';
import { describe, expect, it } from 'vitest';
import { Message } from '../src/ui/Message';
import { Waiting } from '../src/ui/Spinner';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { barPage } from './panelStyles';

const codicons = readFileSync(join(__dirname, '..', 'node_modules/@vscode/codicons/dist/codicon.css'), 'utf8').replace(/url\([^)]*\)/g, 'none');

describe.skipIf(NO_CHROME)('the spinner, in the browser on this machine', () => {
	/** The page, with `body` in it, handed to `run` while the browser is open. */
	const page = <T>(body: string, run: (tab: Page) => Promise<T>, reduced = false) =>
		inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
			await tab.setViewport({ width: 500, height: 300 });
			await tab.setContent(barPage(`<style>${codicons}</style>${body}`));
			return run(tab);
		});

	/** The spinner against the words after it (their first four letters), in the element `root` finds. */
	const measure = (tab: Page, root: string) =>
		tab.evaluate((selector) => {
			const el = document.querySelector(selector)!;
			const spin = el.querySelector('.codicon-modifier-spin')!;
			const words = el.querySelector('.waiting > span:last-child')!.firstChild!;
			const range = document.createRange();
			range.setStart(words, 0);
			range.setEnd(words, 4);
			const text = range.getClientRects()[0]!;
			const box = spin.getBoundingClientRect();
			return {
				animation: getComputedStyle(spin).animationName,
				apart: text.left - box.right,
				size: parseFloat(getComputedStyle(spin).fontSize) / parseFloat(getComputedStyle(words.parentElement!).fontSize),
				off: box.top + box.height / 2 - (text.top + text.height / 2),
			};
		}, root);

	const waiting = (words: string) => renderToStaticMarkup(createElement(Waiting, { children: words }));

	it('turns, before the words with a little room between, and is visible', async () => {
		const m = await page(renderToStaticMarkup(createElement(Message, { waiting: true, children: 'Thinking…' })), (tab) => measure(tab, '.message'));
		expect(m.animation).toBe('codicon-spin');
		expect(m.apart).toBeGreaterThan(1);
	});

	it('stands still where motion is not wanted', async () => {
		const body = renderToStaticMarkup(createElement(Message, { waiting: true, children: 'Thinking…' }));
		expect((await page(body, (tab) => measure(tab, '.message'), true)).animation).toBe('none');
	});

	it('is the size of the words it is before, and level with them, whatever size they are', async () => {
		const sizes = ['9px', '12px', '13px', '20px'];
		const body = sizes.map((size, i) => `<div id="w${i}" style="font-size:${size};line-height:1.4">${waiting('Finding it')}</div>`).join('');
		const found = await page(body, async (tab) => Promise.all(sizes.map((_, i) => measure(tab, `#w${i}`))));
		for (const m of found) {
			expect(m.size).toBe(1);
			expect(Math.abs(m.off)).toBeLessThan(1);
		}
	});

	it('stays level with the first line of words that wrap', async () => {
		const body = `<div id="w" style="width:150px;line-height:1.4">${waiting('Reading how it stands against the product’s main branch')}</div>`;
		expect(Math.abs((await page(body, (tab) => measure(tab, '#w'))).off)).toBeLessThan(1);
	});

	it('takes no more of the line than what replaces it: a place being found is as tall as the place found', async () => {
		const body =
			`<div id="found"><span class="value-place"><button class="link">src/utils/theme.ts (160)</button></span></div>` +
			`<div id="finding"><span class="value-place quiet">${waiting('Finding where it is written…')}</span></div>`;
		const heights = await page(body, (tab) =>
			tab.evaluate(() => ['found', 'finding'].map((id) => document.getElementById(id)!.getBoundingClientRect().height)),
		);
		expect(heights[1]).toBe(heights[0]);
	});
});
