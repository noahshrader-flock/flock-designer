import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SemanticColors } from '../extension/webview/SemanticColors';
import { Grouped } from '../extension/webview/Tokens';
import type { DesignToken } from '../src/shared/contract';
import { TokenChangesProvider, useTokenChangesFor } from '../extension/webview/hooks/tokenChanges';
import { undeclared } from '../src/shared/wcag';
import { NO_CHROME, inChrome } from './realChrome';

/**
 * The colors in the Tokens tab, in the browser on this machine, with the real components and the real stylesheet: the grid of
 * roles (a column for each theme, headed by the sun and the moon) and the palette (a row for each step) are two views of the same
 * colors, so their dots end at the same place, flush right, and a heading is centred over its column of dots.
 */

const css = readFileSync(join(__dirname, '..', 'extension', 'webview', 'styles.css'), 'utf8');
const token = (path: string, group: string, set: string, name: string, value: string): DesignToken =>
	({ path, group, set, name, kind: 'color', category: 'Color', value, source: { file: 'src/colors.ts', line: 1 } }) as unknown as DesignToken;
/** A role set whose name cannot fit its row beside the icons: it is cut with an ellipsis, as the palette's family name is. */
const LONG_SET = 'primaryContainerOnSurfaceVariantWithAVeryLongName';
const ROLES = [
	token('palette.light.primary.main', 'Light', 'primary', 'main', '#108062'),
	token('palette.dark.primary.main', 'Dark', 'primary', 'main', '#2BB48A'),
	token('palette.light.primary.contrastText', 'Light', 'primary', 'contrastText', '#FFFFFF'),
	token('palette.dark.primary.contrastText', 'Dark', 'primary', 'contrastText', '#000000'),
	token('palette.light.primaryContainer.main', 'Light', LONG_SET, 'main', '#DFF3EB'),
	token('palette.dark.primaryContainer.main', 'Dark', LONG_SET, 'main', '#2D5448'),
];
const TONES = [
	token('tone.pineGreen.50', 'Tones', 'pineGreen', '50', '#1F6F5C'),
	token('tone.pineGreen.60', 'Tones', 'pineGreen', '60', '#15584A'),
	token('tone.blue.50', 'Tones', 'blue', '50', '#3B82C4'),
	token('tone.blue.60', 'Tones', 'blue', '60', '#2D6AA6'),
];

const Both = () => {
	const changes = useTokenChangesFor([...ROLES, ...TONES], [], () => undefined, undeclared('a test'));
	return createElement(
		TokenChangesProvider,
		{ value: changes },
		// As the Tokens tab draws them: both in the token body, one under the other.
		createElement(
			'div',
			{ className: 'token-body' },
			createElement(SemanticColors, { tokens: ROLES, onEdit: () => undefined }),
			createElement(Grouped, { tokens: TONES, onEdit: () => undefined, onSource: () => undefined }),
		),
	);
};
const markup = renderToStaticMarkup(createElement(Both));

describe.skipIf(NO_CHROME)('the colors of the Tokens tab, in the browser on this machine', () => {
	it.each([300, 220])(
		'heads the themes with the sun and the moon, and ends the grid’s dots where the palette’s end, in a %ipx panel',
		async (width) => {
			const found = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.setViewport({ width, height: 700 });
				await page.setContent(
					`<!doctype html><html><head><meta charset="utf-8"><style>:root{--vscode-foreground:#cccccc;--vscode-descriptionForeground:#888888}${css}</style></head><body>${markup}</body></html>`,
				);
				return page.evaluate(() => {
					const r = (e: Element) => e.getBoundingClientRect();
					const mid = (e: Element) => (r(e).left + r(e).right) / 2;
					const textLeft = (e: Element) => {
						const range = document.createRange();
						range.selectNodeContents(e);
						return Math.round(range.getBoundingClientRect().left * 10) / 10;
					};
					const grid = [...document.querySelectorAll<HTMLElement>('[data-token-row="main"] .theme-cell .swatch')];
					const palette = [...document.querySelectorAll<HTMLElement>('li.token .color-dot .swatch')];
					const tall = (e: Element) => Math.round(r(e).height * 10) / 10;
					// A row and a heading are the same height in both views, and a set is the same distance from the one before.
					const gridSets = [...document.querySelectorAll<HTMLElement>('.theme-set')];
					const paletteSets = [...document.querySelectorAll<HTMLElement>('.token-set')];
					const between = (sets: HTMLElement[], row: string, heading: string) =>
						Math.round(
							(r(sets[1]!.querySelector(heading) as Element).top -
								r(sets[0]!.querySelectorAll(row).item(sets[0]!.querySelectorAll(row).length - 1)).bottom) *
								10,
						) / 10;
					const icons = [...document.querySelectorAll<HTMLElement>('[data-theme-heading] svg')];
					const headings = [...document.querySelectorAll<HTMLElement>('[data-theme-heading]')];
					return {
						headings: headings.map((h) => [h.getAttribute('aria-label'), h.textContent]),
						icons: icons.length,
						// The last column's dot, against every palette dot: the same distance from the right edge.
						gridRight: grid.map((s) => Math.round(r(s).right * 10) / 10),
						paletteRight: palette.map((s) => Math.round(r(s).right * 10) / 10),
						// Each heading's icon over its column's dot.
						overColumn: icons.map((icon, i) => Math.round(Math.abs(mid(icon) - mid(grid[i] as Element)) * 10) / 10),
						page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
						gridRows: [...document.querySelectorAll('[data-token-row]')].map(tall),
						paletteRows: [...document.querySelectorAll('li.token')].map(tall),
						gridHeadings: [...document.querySelectorAll('[data-theme-headings]')].map(tall),
						paletteHeadings: [...document.querySelectorAll('h4.heading-set')].map(tall),
						gridSets: gridSets.length,
						paletteSets: paletteSets.length,
						gridBetween: between(gridSets, '[data-token-row]', '[data-theme-headings]'),
						paletteBetween: between(paletteSets, 'li.token', 'h4.heading-set'),
						// A set's name too long for its row is cut with an ellipsis: a block with the ellipsis, not a flex it would not work on.
						setNames: [...document.querySelectorAll<HTMLElement>('[data-theme-headings] .theme-name')].map((e) => ({
							display: getComputedStyle(e).display,
							ellipsis: getComputedStyle(e).textOverflow === 'ellipsis',
							cut: e.scrollWidth > e.clientWidth,
							text: e.textContent,
						})),
						iconSizes: icons.map((i) => [Math.round(r(i).width), Math.round(r(i).height)]),
						// Where each begins, in both views: a set's name, and the names of its rows under it; and what colour the rows' are.
						lefts: {
							'a role’s set': [...document.querySelectorAll('[data-theme-headings] .theme-name')].map(textLeft),
							'a role’s row': [...document.querySelectorAll('[data-token-row] .theme-name')].map(textLeft),
							'a family': [...document.querySelectorAll('h4.heading-set')].map(textLeft),
							'a step’s row': [...document.querySelectorAll('li.token .token-link')].map(textLeft),
						} as Record<string, number[]>,
						rowNameColors: [
							...new Set([...document.querySelectorAll('[data-token-row] .theme-name, li.token .token-link')].map((e) => getComputedStyle(e).color)),
						],
					};
				});
			});
			// Over each of the two sets' columns: Light then Dark, as icons, with no word.
			expect(found.headings).toEqual([
				['Light', ''],
				['Dark', ''],
				['Light', ''],
				['Dark', ''],
			]);
			expect(found.icons).toBe(4);
			// Flush right, the same for both views: the Dark column's dot is where each palette dot is.
			expect(found.paletteRight.length).toBe(4);
			for (const right of found.paletteRight) expect(found.gridRight.at(-1)).toBeCloseTo(right, 0);
			// And a heading is centred over its column of dots.
			for (const off of found.overColumn) expect(off).toBeLessThanOrEqual(1);
			expect(found.page).toBe(true);
			// One row height, whichever view: a role's row is a palette step's, and a set's heading is a family's.
			expect(found.gridSets).toBe(2);
			expect(found.paletteSets).toBe(2);
			const rows = [...found.gridRows, ...found.paletteRows];
			expect(new Set(rows).size, rows.join(', ')).toBe(1);
			expect(rows[0]).toBeGreaterThanOrEqual(28);
			const headings = [...found.gridHeadings, ...found.paletteHeadings];
			expect(new Set(headings).size, headings.join(', ')).toBe(1);
			expect(headings[0]).toBe(rows[0]);
			// And a set is the same distance from the one above it in both.
			expect(found.gridBetween).toBe(found.paletteBetween);
			// Every name starts at one left edge, a set's and a row's, in both views: no row indented under its set's name.
			const starts = Object.values(found.lefts).flat();
			expect(Object.values(found.lefts).every((l) => l.length > 0)).toBe(true);
			expect(new Set(starts).size, JSON.stringify(found.lefts)).toBe(1);
			// And a row's name is one colour, whichever view: a role's and a step's.
			expect(found.rowNameColors, 'one colour for a row’s name').toHaveLength(1);
			// A long set's name is cut with an ellipsis, in its row beside the icons, which stay whole.
			for (const n of found.setNames) expect([n.display === 'flex', n.ellipsis], n.text ?? '').toEqual([false, true]);
			expect(found.setNames.some((n) => n.text === LONG_SET && n.cut)).toBe(true);
			// The icons over the columns are small: the extra small size, not a codicon's 16.
			for (const [w, hh] of found.iconSizes as number[][]) expect([w, hh]).toEqual([12, 12]);
		},
		60_000,
	);
});
