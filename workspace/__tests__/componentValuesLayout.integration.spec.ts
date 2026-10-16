import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComponentValues } from '../extension/webview/ComponentValues';
import { ValueEditor } from '../extension/webview/ValueEditor';
import type { DesignToken, ValueCell, ValueRow } from '../src/shared/contract';
import { NO_CHROME, inChrome } from './realChrome';

/**
 * A component's Values, laid out as VS Code lays out its side pane (adjusting a component, DESIGN_SYSTEM_PLAN.md): the real
 * component and the real stylesheet, in a real browser, at the width of the pane. What a person saw once was every part laid
 * over the next (a variant over its swatch, a value broken across three lines, a note cut off); what must hold is that nothing
 * overflows the pane, nothing overlaps, and a value reads on one line where it fits.
 */

const cell = (variant: string | null, value: string, kind: ValueCell['kind'], tokens: string[] = [], instances = 3): ValueCell => ({
	variant,
	value,
	kind,
	tokens,
	instances,
	targets: Array.from({ length: instances }, (_, i) => `${variant}:${i}`),
});
const token = (path: string, set: string, name: string): DesignToken =>
	({
		path,
		group: 'Light',
		set,
		name,
		kind: 'color',
		category: 'Color',
		value: '#000000',
		source: { file: 'light.ts', line: 1 },
	}) as unknown as DesignToken;
const TOKENS = [
	token('palette.light.primary.main', 'primary', 'main'),
	token('palette.light.secondaryContainer.main', 'secondaryContainer', 'main'),
	token('palette.light.error.contrastText', 'error', 'contrastText'),
];
/** What Flock's FSButton reads as, which is where it was seen to break: long variants, hex-able colours, long notes. */
const ROWS: ValueRow[] = [
	{
		property: 'fontSize',
		by: 'size',
		cells: ['sm', 'md', 'lg', 'xl', 'not set'].map((v) => cell(v, '16px', 'unchecked')),
	},
	{
		property: 'background',
		by: 'variant, disabled',
		cells: [
			cell('primary', 'rgb(16, 128, 98)', 'token', ['palette.light.primary.main']),
			cell('secondary', 'none', 'own'),
			cell('tertiary', 'rgb(218, 240, 242)', 'token', ['palette.light.secondaryContainer.main']),
			cell('destructivePrimary', 'rgb(186, 26, 26)', 'token', ['palette.light.error.contrastText']),
			cell('destructiveSecondary', 'none', 'own'),
			cell('primary · disabled', 'rgba(0, 0, 0, 0.12)', 'own'),
		],
	},
	{ property: 'padding', by: 'size', cells: [cell('sm', '0px 10px', 'own'), cell('lg', '0px 16px', 'own')] },
];

const PANE = 300;
const css = readFileSync(join(__dirname, '..', 'extension', 'webview', 'styles.css'), 'utf8');
const markupFor = (rows: ValueRow[]) =>
	renderToStaticMarkup(
		createElement(ComponentValues, {
			answer: {
				state: 'ready',
				uses: [],
				sharedWith: {
					'palette.light.primary.main': ['FSButtonGroup', 'FSIconButton', 'FSSplitButton', 'FSLoadingButton', 'FSToggleButton'],
					'palette.light.secondaryContainer.main': ['FSButtonGroup', 'FSIconButton'],
					'palette.light.error.contrastText': ['FSButtonGroup'],
				},
				notTokens: [],
				derived: 0,
				accessibility: null,
				values: { state: 'read', instances: 12, unmarked: 0, rows: { light: rows, dark: null } },
			},
			name: 'FSButton',
			version: { branch: 'develop', commit: 'abc1234def' },
			byPath: new Map(TOKENS.map((t) => [t.path, t])),
			names: new Map(['FSButtonGroup', 'FSIconButton', 'FSSplitButton', 'FSLoadingButton', 'FSToggleButton'].map((n) => [n, n])),
			trying: { tried: new Map(), onTry: () => undefined },
			onEditToken: () => undefined,
		}),
	);
const markup = markupFor(ROWS);

describe.skipIf(NO_CHROME)('a component’s Values, in the side pane, in the browser on this machine', () => {
	// At the pane's width, and much narrower, where a name has to give way and a value must not.
	it.each([PANE, 220])(
		'lays out each value without anything laid over anything, past the pane, or cut off, in a %ipx pane',
		async (width) => {
			const found = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.setViewport({ width, height: 900 });
				await page.setContent(
					`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside">${markup}</aside></main></body></html>`,
				);
				return page.evaluate(() => {
					const box = (e: Element) => {
						const r = e.getBoundingClientRect();
						return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height };
					};
					const apart = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
						a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;
					const problems: string[] = [];
					const root = document.documentElement;
					if (root.scrollWidth > root.clientWidth) problems.push(`the page is ${root.scrollWidth}px in a ${root.clientWidth}px pane`);
					for (const li of document.querySelectorAll('[data-value-cell]')) {
						const name = li.textContent?.slice(0, 30) ?? '';
						const cellBox = box(li);
						const parts = [...li.querySelectorAll('.value-label, .value-drawn, .value-note, .swatch')].map((e) => [e.className, box(e)] as const);
						for (const [c, b] of parts) if (b.r > cellBox.r + 0.5 || b.l < cellBox.l - 0.5) problems.push(`${name}: ${c} leaves its cell`);
						const [variant, drawn, note] = ['.value-label', '.value-drawn', '.value-note'].map((s) => li.querySelector(s));
						if (variant && drawn && !apart(box(variant), box(drawn))) problems.push(`${name}: the name is over its value`);
						// Its name on the left and its value on the right, on the one line.
						if (variant && drawn && !(box(variant).l < box(drawn).l)) problems.push(`${name}: the value is not to the right of its name`);
						// Words that fit their box: a name that cannot wrap runs on under the value beside it, past its own box.
						for (const part of [variant, note])
							if (part && part.scrollWidth > part.clientWidth + 1) problems.push(`${name}: ${part.className} runs past its box`);
						// Flush to the right of its cell, as a token's value is, whatever its name takes.
						if (drawn && Math.abs(cellBox.r - 8 - box(drawn).r) > 1.5) problems.push(`${name}: the value is not at the right of its cell`);
						// A value reads on one line, even when the pane is narrow: it is the name that gives way.
						if (drawn && box(drawn).h > 24) problems.push(`${name}: its value is broken over lines (${box(drawn).h}px)`);
						if (drawn && note && !apart(box(drawn), box(note))) problems.push(`${name}: the value is over its note`);
						const swatch = li.querySelector('.swatch');
						const text = drawn?.querySelector('span:not(.swatch):not(.token-changed)');
						if (swatch && text && !apart(box(swatch), box(text))) problems.push(`${name}: the swatch is over its value`);
						// A colour reads on one line: as its hex, it fits where as rgb(...) it did not.
						if (swatch && text && box(text).h > 24) problems.push(`${name}: its colour is broken over lines (${box(text).h}px)`);
					}
					return { problems, cells: document.querySelectorAll('[data-value-cell]').length };
				});
			});
			expect(found.cells).toBe(13);
			expect(found.problems).toEqual([]);
		},
		60_000,
	);

	it('opens a value’s control as a popover under it, inside the pane, over what is below, with nothing past its edges', async () => {
		// The real control, drawn into the cell it opens from, as `Cell` draws it: after its button, inside its list item.
		const popover = (property: 'padding' | 'background', value: string) =>
			renderToStaticMarkup(createElement(ValueEditor, { property, cell: cell('sm', value, 'own', [], 6), tried: null, onTry: () => undefined }));
		const found = await inChrome(async (browser) => {
			const page = await browser.newPage();
			await page.setViewport({ width: PANE, height: 900 });
			await page.setContent(
				`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside">${markup}</aside></main></body></html>`,
			);
			const out: Record<string, unknown> = {};
			for (const [property, value, row] of [
				['padding', '0px 10px', 'padding'],
				['background', 'rgb(16, 128, 98)', 'background'],
			] as const) {
				out[property] = await page.evaluate(
					(html, rowName) => {
						document.querySelectorAll('.popover').forEach((e) => e.remove());
						const li = document.querySelector(`[data-value-row="${rowName}"] [data-value-cell]`) as HTMLElement;
						li.insertAdjacentHTML('beforeend', html);
						const pop = li.querySelector('.popover') as HTMLElement;
						const box = (e: Element) => e.getBoundingClientRect();
						const [p, c, b] = [box(pop), box(li), box(li.querySelector('button') as Element)];
						const problems: string[] = [];
						const root = document.documentElement;
						if (root.scrollWidth > root.clientWidth) problems.push(`the page is ${root.scrollWidth}px in a ${root.clientWidth}px pane`);
						if (p.left < 0 || p.right > root.clientWidth) problems.push(`the popover is ${p.left}..${p.right} in a ${root.clientWidth}px pane`);
						if (p.top < b.bottom - 0.5) problems.push('the popover is over its own button');
						// Over what is below it: the point at its middle is its own.
						const mid = document.elementFromPoint((p.left + p.right) / 2, p.top + 4);
						if (!mid || !pop.contains(mid)) problems.push(`something is over the popover at its top (${mid?.className})`);
						for (const e of pop.querySelectorAll('*'))
							if (box(e).right > p.right + 0.5) problems.push(`${e.className || e.tagName} leaves the popover`);
						const sliders = [...pop.querySelectorAll<HTMLElement>('input[type="range"]')].map((e) => Math.round(box(e).width));
						return {
							problems,
							sliders,
							width: Math.round(p.width),
							cellWidth: Math.round(c.width),
							below: li.nextElementSibling ? box(li.nextElementSibling).top < p.bottom : false,
						};
					},
					popover(property, value),
					row,
				);
			}
			return out as Record<string, { problems: string[]; sliders: number[]; width: number; cellWidth: number; below: boolean }>;
		});
		for (const f of Object.values(found)) expect(f.problems).toEqual([]);
		// Two parts, two sliders, each wide enough to use; across the cell it opens from; over the next value, not pushing it down.
		expect(found.padding?.sliders).toHaveLength(2);
		for (const w of found.padding?.sliders ?? []) expect(w).toBeGreaterThan(100);
		expect(found.padding?.width).toBe(found.padding?.cellWidth);
		expect(found.padding?.below).toBe(true);
	}, 60_000);

	it('keeps a group’s heading at the top of the pane while its values scroll under it, the next replacing it; and the pane is 300px wide', async () => {
		// As VS Code shows the component's tab with room for two columns: the page is the window's height, the stories and the
		// analysis each scroll inside it. The editor's own background is what a heading covers what is under it with.
		// Long enough that every heading can come to the top: a last group needs room under it, as a long one has.
		const tall = markupFor([
			...ROWS,
			{ property: 'text', by: 'variant', cells: Array.from({ length: 16 }, (_, i) => cell(`v${i}`, `rgb(${i}, 9, 9)`, 'own')) },
		]);
		const found = await inChrome(async (browser) => {
			const page = await browser.newPage();
			await page.setViewport({ width: 1100, height: 300 });
			await page.setContent(
				`<!doctype html><html><head><meta charset="utf-8"><style>:root{--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#ddd}${css}</style></head><body><main class="tab tab-split"><header class="tab-header"><h1 class="tab-title">FSButton</h1></header><div class="component-layout"><div class="component-stories"></div><aside class="component-aside">${tall}</aside></div></main></body></html>`,
			);
			return page.evaluate(async () => {
				const aside = document.querySelector('.component-aside') as HTMLElement;
				const top = () => aside.getBoundingClientRect().top;
				const headings = [...document.querySelectorAll<HTMLElement>('.value-group-name')];
				const named = (h: HTMLElement) => h.textContent ?? '';
				const stuck = () => headings.filter((h) => Math.abs(h.getBoundingClientRect().top - top()) < 1.5).map(named);
				const seen: string[][] = [];
				// Scrolled a little at a time, from the top to the bottom: which heading is at the top of the pane at each stop.
				for (let at = 0; at <= aside.scrollHeight; at += 40) {
					aside.scrollTop = at;
					await new Promise((r) => requestAnimationFrame(() => r(null)));
					seen.push(stuck());
				}
				const groups = headings.map(named);
				// While a group's values are under it, its heading covers them: opaque, over them.
				aside.scrollTop = 0;
				const covers = headings.map((h) => getComputedStyle(h).backgroundColor !== 'rgba(0, 0, 0, 0)' && Number(getComputedStyle(h).zIndex) >= 1);
				return { width: Math.round(aside.getBoundingClientRect().width), scrolls: aside.scrollHeight > aside.clientHeight, groups, seen, covers };
			});
		});
		expect(found.width).toBe(300);
		expect(found.scrolls).toBe(true);
		expect(found.covers.every(Boolean)).toBe(true);
		// Each group's heading was at the top at some stop, and never two at once: one replaces the next.
		const stopped = new Set(found.seen.flat());
		for (const g of found.groups) expect(stopped.has(g), g).toBe(true);
		expect(found.seen.every((s) => s.length <= 1)).toBe(true);
		// And in the order the groups are in: a heading is replaced by the next, never the one before.
		const order = found.seen.flat().filter((g, i, all) => g !== all[i - 1]);
		expect(order).toEqual(found.groups);
	}, 60_000);
});
