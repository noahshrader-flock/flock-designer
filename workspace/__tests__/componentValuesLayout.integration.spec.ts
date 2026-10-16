import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComponentValues } from '../extension/webview/ComponentValues';
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
const markup = renderToStaticMarkup(
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
			values: { state: 'read', instances: 12, unmarked: 0, rows: { light: ROWS, dark: null } },
		},
		name: 'FSButton',
		version: { branch: 'develop', commit: 'abc1234def' },
		byPath: new Map(TOKENS.map((t) => [t.path, t])),
		names: new Map(['FSButtonGroup', 'FSIconButton', 'FSSplitButton', 'FSLoadingButton', 'FSToggleButton'].map((n) => [n, n])),
		trying: { tried: new Map(), onTry: () => undefined },
		onEditToken: () => undefined,
	}),
);

describe.skipIf(NO_CHROME)('a component’s Values, in the side pane, in the browser on this machine', () => {
	it('lays out each value without anything laid over anything, past the pane, or cut off', async () => {
		const found = await inChrome(async (browser) => {
			const page = await browser.newPage();
			await page.setViewport({ width: PANE, height: 900 });
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
					const parts = [...li.querySelectorAll('.value-variant, .value-drawn, .value-note, .swatch')].map((e) => [e.className, box(e)] as const);
					for (const [c, b] of parts) if (b.r > cellBox.r + 0.5 || b.l < cellBox.l - 0.5) problems.push(`${name}: ${c} leaves its cell`);
					const [variant, drawn, note] = ['.value-variant', '.value-drawn', '.value-note'].map((s) => li.querySelector(s));
					if (variant && drawn && !apart(box(variant), box(drawn))) problems.push(`${name}: the variant is over its value`);
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
	}, 60_000);
});
