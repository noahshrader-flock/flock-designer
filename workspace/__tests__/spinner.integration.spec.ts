import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Message } from '../src/ui/Message';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { barPage } from './panelStyles';

const codicons = readFileSync(join(__dirname, '..', 'node_modules/@vscode/codicons/dist/codicon.css'), 'utf8').replace(/url\([^)]*\)/g, 'none');

describe.skipIf(NO_CHROME)('the spinner, in the browser on this machine', () => {
	const page = (reduced: boolean) =>
		inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
			await tab.setViewport({ width: 500, height: 200 });
			await tab.setContent(
				barPage(`<style>${codicons}</style>${renderToStaticMarkup(createElement(Message, { waiting: true, children: 'Thinking…' }))}`),
			);
			return tab.evaluate(() => {
				const spin = document.querySelector('.codicon-modifier-spin')!;
				const text = document.querySelector('.message')!;
				const words = document.createRange();
				// The words themselves: after the space that comes between them and the spinner.
				words.setStart(text.lastChild!, 1);
				words.setEnd(text.lastChild!, text.lastChild!.textContent!.length);
				return {
					animation: getComputedStyle(spin).animationName,
					before: spin.getBoundingClientRect().right <= [...words.getClientRects()][0]!.left,
					apart: [...words.getClientRects()][0]!.left - spin.getBoundingClientRect().right,
					size: spin.getBoundingClientRect().height,
				};
			});
		});

	it('turns, before the words with a little room between, and is visible', async () => {
		const m = await page(false);
		expect(m.animation).toBe('codicon-spin');
		expect(m.before).toBe(true);
		expect(m.apart).toBeGreaterThan(1);
		expect(m.size).toBeGreaterThan(8);
	});

	it('stands still where motion is not wanted, still before the words', async () => {
		const m = await page(true);
		expect(m.animation).toBe('none');
		expect(m.before).toBe(true);
	});
});
