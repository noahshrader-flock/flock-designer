import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dropdown } from '../src/ui/Dropdown';
import { SearchBox } from '../src/ui/SearchBox';
import { inChrome, NO_CHROME, OWN_WINDOW } from './realChrome';
import { barPage } from './panelStyles';

/** Measured in the top bar's own layout, over a prototype's frame, as a person sees it. */

const noop = () => undefined;
const options = (count: number) => Array.from({ length: count }, (_, i) => ({ value: `v${i}`, label: `Version ${count - i}` }));

const bar = (label: string) =>
	renderToStaticMarkup(
		createElement('div', { className: 'viewer-bar' }, [
			createElement(SearchBox, { key: 's', label: 'Search', value: '', onChange: noop }),
			createElement(Dropdown, { key: 'd', label: 'Version: switch version', value: 'v0', options: [{ value: 'v0', label }], onChange: noop }),
		]),
	);

/** What `Menu` draws while open, written out as static markup cannot be opened; `dropdown.dom.spec` holds its classes to the real ones. */
const openList = (count: number) =>
	`<span class="menu menu-open menu-start"><button class="menu-field" aria-expanded="true"><span class="menu-field-text">Version ${count}</span></button>` +
	`<div role="menu" class="menu-list">${options(count)
		.map((o) => `<button role="menuitemradio" class="menu-item"><span>${o.label}</span></button>`)
		.join('')}</div></span>`;

describe.skipIf(NO_CHROME)('a dropdown in the top bar, in the browser on this machine', () => {
	it('is a control of the kit’s default height, its long label cut short rather than widening the bar', async () => {
		const measured = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 400, height: 300 });
			await tab.setContent(barPage(`<div style="width:200px">${bar('Version 3 · based on Version 1 and a good deal else')}</div>`));
			return tab.evaluate(() => {
				const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
				return {
					height: box('.menu-field').height,
					search: box('.search .input').height,
					right: box('.menu-field').right,
					row: box('.viewer-bar').right,
				};
			});
		});
		expect(measured.height).toBe(measured.search);
		expect(measured.right).toBeLessThanOrEqual(measured.row);
	});

	it('opens a list that lines up with its button, lies over the prototype’s frame, and scrolls when it is long', async () => {
		const list = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 600, height: 400 });
			await tab.setContent(
				barPage(
					`<header class="viewer-bar">${openList(60)}</header><iframe style="display:block;width:100%;height:300px;border:0" srcdoc="<body>page</body>"></iframe>`,
				),
			);
			return tab.evaluate(() => {
				const menu = document.querySelector('.menu-list') as HTMLElement;
				const at = menu.getBoundingClientRect();
				const first = menu.querySelector('.menu-item')!.getBoundingClientRect();
				const hit = document.elementFromPoint(first.left + first.width / 2, Math.min(first.top + first.height / 2, window.innerHeight - 1));
				return {
					left: at.left,
					buttonLeft: document.querySelector('.menu-field')!.getBoundingClientRect().left,
					below: document.querySelector('iframe')!.getBoundingClientRect().top < at.bottom,
					onTop: menu.contains(hit),
					scrolls: menu.scrollHeight > menu.clientHeight,
					fits: at.height <= window.innerHeight,
				};
			});
		});
		expect(list.left).toBe(list.buttonLeft);
		expect(list.below).toBe(true);
		expect(list.onTop).toBe(true);
		expect(list.scrolls).toBe(true);
		expect(list.fits).toBe(true);
	});

	it('draws what is chosen, its icon and its check, in the item’s own text colour, never the brand’s', async () => {
		const colours = await inChrome(async (browser) => {
			const tab = await browser.newPage(OWN_WINDOW);
			await tab.setViewport({ width: 600, height: 400 });
			const item = (checked: boolean, icon: string) =>
				`<button role="menuitemradio" aria-checked="${checked}" class="menu-item">${icon}<span>x</span>${checked ? '<span class="codicon codicon-check menu-check"></span>' : ''}</button>`;
			const glyph = '<span class="codicon codicon-layout"></span>';
			const drawn = '<svg class="mode-icon" width="16" height="16" stroke="currentColor"></svg>';
			await tab.setContent(
				barPage(
					`<div role="menu" class="menu-list" style="position:static">${item(true, glyph)}${item(false, glyph)}${item(true, drawn)}</div><i id="link" style="color:var(--dsnr-link)"></i>`,
				),
			);
			return tab.evaluate(() => {
				const of = (el: Element | null) => (el ? getComputedStyle(el).color : null);
				const [chosen, other, chosenDrawn] = [...document.querySelectorAll('.menu-item')];
				return {
					link: of(document.getElementById('link')),
					glyph: of(chosen!.querySelector('.codicon:not(.menu-check)')),
					check: of(chosen!.querySelector('.menu-check')),
					drawn: of(chosenDrawn!.querySelector('.mode-icon')),
					other: of(other!.querySelector('.codicon')),
					text: of(chosen!),
				};
			});
		});
		expect(colours.glyph).toBe(colours.text);
		expect(colours.check).toBe(colours.text);
		expect(colours.drawn).toBe(colours.text);
		expect(colours.other).toBe(colours.text);
		expect(colours.text).not.toBe(colours.link);
	});
});
