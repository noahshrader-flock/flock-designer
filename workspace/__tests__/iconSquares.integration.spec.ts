import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/ui/Button';
import { IconButton } from '../src/ui/IconButton';
import { Menu } from '../src/ui/Menu';
import { ModeIcon } from '../src/ui/ModeIcon';
import { SearchBox } from '../src/ui/SearchBox';
import { Toggle } from '../src/ui/Toggle';
import { NO_CHROME, inChrome } from './realChrome';
import { panelCss } from './panelStyles';

/** Measured in a row too narrow for them, which must not squeeze them out of square. */

const viewer = readFileSync(join(__dirname, '..', 'src/viewer/viewer.css'), 'utf8').replace(/@import[^;]+;/g, '');
const noop = () => undefined;
const sections = [{ items: [{ label: 'List', icon: 'list-unordered', onSelect: noop }] }];

const row = () =>
	renderToStaticMarkup(
		createElement('div', { className: 'view-bar viewer-bar', style: { width: 150 } }, [
			createElement(SearchBox, { key: 's', label: 'Search', value: '', onChange: noop }),
			createElement(Menu, { key: 'm', label: 'View options', icon: 'settings', always: true, sections }),
			createElement(Menu, { key: 'ms', label: 'Small', icon: 'ellipsis', always: true, size: 'small', sections }),
			createElement(IconButton, { key: 'i', icon: 'refresh', label: 'Sync', onPress: noop }),
			createElement(IconButton, { key: 'is', icon: 'discard', label: 'Reset', size: 'small', onPress: noop }),
			createElement(IconButton, { key: 'l', icon: 'chevron-left', label: 'Back', href: '/' }),
			createElement(Button, { key: 'b', icon: 'comment-discussion', label: 'Show all comments', variant: 'secondary' }),
			createElement(Button, { key: 'p', icon: 'location', pressed: true, label: 'Pinned' }),
			createElement(Toggle, {
				key: 't',
				label: 'Theme',
				iconOnly: true,
				options: [
					{ value: 'light', label: 'Light', icon: createElement(ModeIcon, { mode: 'light' }) },
					{ value: 'dark', label: 'Dark', icon: createElement(ModeIcon, { mode: 'dark' }) },
				],
				value: 'light',
				onChange: noop,
			}),
		]),
	);

describe.skipIf(NO_CHROME)('an icon alone, in the browser on this machine', () => {
	it('is a square, of the control’s size or the small one’s, however narrow its row', async () => {
		const sizes = await inChrome(async (browser) => {
			const tab = await browser.newPage();
			await tab.setViewport({ width: 400, height: 300 });
			await tab.setContent(
				`<!doctype html><html><head><meta charset="utf-8"><style>${panelCss()}\n${viewer}</style></head><body>${row()}</body></html>`,
			);
			return tab.evaluate(() => {
				const high = (el: Element) => el.getBoundingClientRect();
				const px = (v: string) => {
					const probe = document.body.appendChild(document.createElement('div'));
					probe.style.cssText = `position:absolute;width:${v}`;
					return probe.getBoundingClientRect().width;
				};
				const alone = [...document.querySelectorAll('.icon-button, .menu-button, .button-icon, .toggle-icons .toggle-option')].map((el) => ({
					what: `${el.className} ${el.getAttribute('aria-label') ?? ''}`.trim(),
					w: Math.round(high(el).width * 10) / 10,
					h: Math.round(high(el).height * 10) / 10,
				}));
				return {
					alone,
					control: px('var(--dsnr-control)'),
					small: px('var(--dsnr-control-small)'),
					option: px('var(--dsnr-toggle-option)'),
					search: high(document.querySelector('.search .input')!).height,
				};
			});
		});
		expect(sizes.alone.length).toBe(9);
		expect(sizes.alone.filter((a) => a.w !== a.h)).toEqual([]);
		for (const a of sizes.alone) {
			const small = /-small/.test(a.what);
			const option = a.what.includes('toggle-option');
			expect(a.w, a.what).toBe(small ? sizes.small : option ? sizes.option : sizes.control);
		}
		// And the default is the search box's own height, so the two line up in a row.
		expect(sizes.control).toBe(sizes.search);
	});
});
