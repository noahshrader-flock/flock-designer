import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Moved } from '../extension/webview/ChangeReach';
import { Grouped } from '../extension/webview/Tokens';
import { AccessibilityFindings } from '../extension/webview/Accessibility';
import { TokensUsed } from '../extension/webview/ComponentSections';
import { AsidePart } from '../extension/webview/ui/AsidePart';
import { HandOverActions } from '../extension/webview/HandOverActions';
import { ChangedValues } from '../extension/webview/ValueChanges';
import { ComponentValues } from '../extension/webview/ComponentValues';
import { ValueEditor } from '../extension/webview/ValueEditor';
import type { ComponentReach, DesignToken, ValueCell, ValueRow } from '../src/shared/contract';
import { TokenChangesProvider, useTokenChangesFor } from '../extension/webview/hooks/tokenChanges';
import { labelOf } from '../src/shared/tokens';
import { undeclared } from '../src/shared/wcag';
import { NO_CHROME, inChrome } from './realChrome';

/**
 * A component's Values, laid out as VS Code lays out its side pane (adjusting a component, DESIGN_SYSTEM.md): the real
 * component and the real stylesheet, in a real browser, at the width of the pane. What a person saw once was every part laid
 * over the next (a variant over its swatch, a value broken across three lines, a note cut off); what must hold is that nothing
 * overflows the pane, nothing overlaps, and a value reads on one line where it fits.
 */

const cell = (
	variant: string | null,
	value: string,
	kind: ValueCell['kind'],
	tokens: string[] = [],
	instances = 3,
	of?: Record<string, string | null>[],
): ValueCell => ({
	variant,
	value,
	kind,
	tokens,
	instances,
	targets: Array.from({ length: instances }, (_, i) => `${variant}:${i}`),
	...(of ? { of } : {}),
});
/** A cell told apart by size, as FSButton's are: a size, or drawn without one. */
const bySize = (size: string, value: string, kind: ValueCell['kind']) => cell(size, value, kind, [], 3, [{ size: size === 'not set' ? null : size }]);
/** A cell told apart by variant and disabled, as FSButton's colours are: "primary · disabled" is disabled, "primary" is not. */
const byVariant = (variant: string, value: string, kind: ValueCell['kind'], tokens: string[] = []) => {
	const [name, disabled] = variant.split(' · ');
	return cell(variant, value, kind, tokens, 3, [{ variant: name as string, disabled: disabled ? 'true' : null }]);
};
const token = (path: string, set: string, name: string, more: object = {}): DesignToken =>
	({
		path,
		group: 'Light',
		set,
		name,
		kind: 'color',
		category: 'Color',
		value: '#000000',
		source: { file: 'light.ts', line: 1 },
		...more,
	}) as unknown as DesignToken;
const TOKENS = [
	token('palette.light.primary.main', 'primary', 'main'),
	token('palette.light.secondaryContainer.main', 'secondaryContainer', 'main'),
	token('palette.light.error.contrastText', 'error', 'contrastText'),
];
/**
 * What Flock's FSButton reads as, which is where it was seen to break: hex-able colours, and as the inspector opens on it (its
 * first variant drawn), the longest token's name as a chip beside a colour; a row no prop explains, as FSChip's are, with the
 * rest under it; and one value for all.
 */
const ROWS: ValueRow[] = [
	{ property: 'fontSize', by: 'size', cells: ['sm', 'md', 'lg', 'xl', 'not set'].map((v) => bySize(v, '16px', 'unchecked')) },
	{
		property: 'background',
		by: 'variant, disabled',
		cells: [
			byVariant('tertiary', 'rgb(218, 240, 242)', 'token', ['palette.light.secondaryContainer.main']),
			byVariant('primary', 'rgb(16, 128, 98)', 'token', ['palette.light.primary.main']),
			byVariant('secondary', 'none', 'own'),
			byVariant('destructivePrimary', 'rgb(186, 26, 26)', 'token', ['palette.light.error.contrastText']),
			byVariant('primary · disabled', 'rgba(0, 0, 0, 0.12)', 'own'),
		],
	},
	{ property: 'padding', by: 'size', cells: [bySize('sm', '0px 10px', 'own'), bySize('lg', '0px 16px', 'own')] },
	{ property: 'radius', by: null, cells: [cell(null, '8px', 'token', ['palette.light.primary.main'], 12)] },
	{
		property: 'border',
		by: null,
		cells: [cell(null, 'rgb(1, 2, 3)', 'own', [], 6), cell(null, 'rgb(4, 5, 6)', 'token', ['palette.light.error.contrastText'], 2)],
	},
];

/** The other components that draw with each token, by name. */
const SHARED: Record<string, string[]> = {
	'palette.light.primary.main': ['FSButtonGroup', 'FSIconButton', 'FSSplitButton', 'FSLoadingButton', 'FSToggleButton'],
	'palette.light.secondaryContainer.main': ['FSButtonGroup', 'FSIconButton'],
	'palette.light.error.contrastText': ['FSButtonGroup'],
};

const PANE = 300;
const css = readFileSync(join(__dirname, '..', 'extension', 'webview', 'styles.css'), 'utf8');
const markupFor = (rows: ValueRow[]) =>
	renderToStaticMarkup(
		createElement(ComponentValues, {
			answer: {
				state: 'ready',
				uses: [],
				sharedWith: SHARED,
				notTokens: [],
				derived: 0,
				accessibility: null,
				values: { state: 'read', instances: 12, unmarked: 0, rows: { light: rows, dark: null } },
			},
			name: 'FSButton',
			byPath: new Map(TOKENS.map((t) => [t.path, t])),
			tokenName: (path: string) => {
				const t = TOKENS.find((x) => x.path === path);
				return t ? labelOf(t) : path;
			},
			others: (path: string) => SHARED[path] ?? [],
			trying: { tried: new Map(), onTry: () => undefined, onAll: () => undefined, onWrite: () => undefined, writes: 0, writeError: null },
			onEditToken: () => undefined,
			variants: { state: 'none' },
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
					// The values shown: the rest of a row no prop explains is under a closed "more", not laid out.
					const shown = [...document.querySelectorAll<HTMLElement>('[data-value-cell]')].filter((li) => li.checkVisibility());
					for (const li of shown) {
						const name = li.textContent?.slice(0, 30) ?? '';
						const cellBox = box(li);
						// What is shown of it: a chip left out where its name's side is too narrow has no box.
						const parts = [...li.querySelectorAll<HTMLElement>('.value-label, .value-drawn, .value-chip, .swatch')]
							.filter((e) => e.checkVisibility())
							.map((e) => [e.className, box(e)] as const);
						for (const [c, b] of parts) if (b.r > cellBox.r + 0.5 || b.l < cellBox.l - 0.5) problems.push(`${name}: ${c} leaves its cell`);
						const [variant, drawn] = ['.value-label', '.value-drawn'].map((s) => li.querySelector(s));
						if (variant && drawn && !apart(box(variant), box(drawn))) problems.push(`${name}: the name is over its value`);
						// Its name on the left and its value on the right, on the one line.
						if (variant && drawn && !(box(variant).l < box(drawn).l)) problems.push(`${name}: the value is not to the right of its name`);
						// Words that fit their box: a name that cannot wrap runs on under the value beside it, past its own box.
						for (const part of [variant])
							if (part && part.scrollWidth > part.clientWidth + 1) problems.push(`${name}: ${part.className} runs past its box`);
						// Flush to the right of its cell, as a token's value is, whatever its name takes.
						if (drawn && Math.abs(cellBox.r - 8 - box(drawn).r) > 1.5) problems.push(`${name}: the value is not at the right of its cell`);
						// A value reads on one line, even when the pane is narrow: it is the name that gives way.
						if (drawn && box(drawn).h > 24) problems.push(`${name}: its value is broken over lines (${box(drawn).h}px)`);
					}
					// Comfortable, not jammed: a row is at least the panel's row height, and the pickers are a gap apart, as one named size.
					const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsnr-row-height'));
					const rowGap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsnr-row-gap'));
					if (!(rowHeight >= 28) || !(rowGap >= 8)) problems.push(`the row height and gap are ${rowHeight} and ${rowGap}`);
					for (const li of shown)
						if (box(li).h < rowHeight - 0.5) problems.push(`${li.textContent?.slice(0, 30)}: a row is ${box(li).h}px, under ${rowHeight}`);
					const controls = [...document.querySelectorAll('.pickers .picker-row')].map((r) => box(r.lastElementChild as Element));
					controls.forEach((c, i) => {
						const next = controls[i + 1];
						if (next && next.t - c.b < rowGap - 0.5)
							problems.push(`pickers ${i + 1} and ${i + 2} are ${Math.round(next.t - c.b)}px apart, under ${rowGap}`);
					});
					// A colour is its name and only its dot: at the right of its cell as a value is, clear of its name, inside its cell,
					// and no taller a row than a value without one.
					const textRows = shown.filter((li) => !li.querySelector('.color-dot')).map((li) => box(li).h);
					for (const li of shown) {
						const dot = li.querySelector('.color-dot .swatch');
						if (!dot) continue;
						const name = li.textContent?.slice(0, 30) ?? '';
						const [cellBox, dotBox, label] = [box(li), box(dot), li.querySelector('.value-label')];
						if (Math.abs(cellBox.r - 8 - dotBox.r) > 1.5) problems.push(`${name}: its dot is not at the right of its cell`);
						if (dotBox.l < cellBox.l - 0.5 || dotBox.t < cellBox.t - 0.5 || dotBox.b > cellBox.b + 0.5)
							problems.push(`${name}: its dot leaves its cell`);
						if (label && !apart(box(label), dotBox)) problems.push(`${name}: the name is over its dot`);
						if (cellBox.h > Math.max(...textRows) + 1) problems.push(`${name}: its row is taller (${cellBox.h}px) than a value's without a color`);
						if (li.querySelector('.value-drawn, .value-chip')) problems.push(`${name}: a color says more than its dot`);
					}
					// A token's chip after its name, inside its name's side, never over its value.
					for (const li of shown) {
						const [chip, drawn] = [li.querySelector<HTMLElement>('.value-chip'), li.querySelector('.value-drawn')];
						if (chip?.checkVisibility() && drawn && !apart(box(chip), box(drawn)))
							problems.push(`${li.textContent?.slice(0, 30)}: the chip is over its value`);
					}
					return {
						problems,
						cells: shown.length,
						chips: document.querySelectorAll('.value-chip').length,
						tokenNames: [...document.querySelectorAll<HTMLElement>('.value-token')].filter((t) => t.checkVisibility()).length,
						pickers: document.querySelectorAll('.pickers .picker-row').length,
						dots: [...document.querySelectorAll<HTMLElement>('.color-dot')].filter((d) => d.checkVisibility()).length,
					};
				});
			});
			// The variant it opens on: a value for each row, a token's name for each that is one and not a colour, a dot for each
			// colour, and no chip: a chip is for what is made from a token without being one.
			expect(found.cells).toBe(5);
			expect(found.chips).toBe(0);
			expect(found.tokenNames).toBe(1);
			expect(found.dots).toBe(2);
			expect(found.pickers).toBeGreaterThan(1);
			expect(found.problems).toEqual([]);
		},
		60_000,
	);

	// The tokens a component draws with, as Tokens used lists them: a colour is its name and only its dot, a length is its row.
	const ROW_TOKENS = [
		token('palette.light.main', 'primary', 'main', { value: '#108062' }),
		token('palette.light.long', 'primary', 'secondaryContainerOnSurfaceVariantContrastText'),
		token('palette.light.pointing', 'primary', 'pointing', { ref: { path: 'palette.light.main' } }),
		token('radius', 'primary', 'radius', { kind: 'radius', category: 'Shape', value: '4px' }),
	];
	const TokenRows = () => {
		const changes = useTokenChangesFor(ROW_TOKENS, [], () => undefined, undeclared('a test'));
		return createElement(TokenChangesProvider, { value: changes }, createElement(Grouped, { tokens: ROW_TOKENS, onEdit: () => undefined }));
	};
	const tokenRows = renderToStaticMarkup(createElement(TokenRows));

	it.each([PANE, 220])(
		'lays out a token’s row, a colour as its name and only its dot, without anything past the pane, in a %ipx pane',
		async (width) => {
			const found = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.setViewport({ width, height: 900 });
				await page.setContent(
					`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside">${tokenRows}</aside></main></body></html>`,
				);
				return page.evaluate(() => {
					const box = (e: Element) => e.getBoundingClientRect();
					const apart = (a: DOMRect, b: DOMRect) =>
						a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
					const problems: string[] = [];
					const root = document.documentElement;
					if (root.scrollWidth > root.clientWidth) problems.push(`the page is ${root.scrollWidth}px in a ${root.clientWidth}px pane`);
					const rows = [...document.querySelectorAll<HTMLElement>('.token')];
					const plainHeights = rows.filter((li) => !li.querySelector('.color-dot')).map((li) => box(li).height);
					for (const li of rows) {
						const name = li.querySelector('[data-part="name"]');
						const nameText = name?.textContent?.slice(0, 24) ?? '';
						const dot = li.querySelector('.color-dot');
						const swatch = li.querySelector('.color-dot .swatch');
						const actions = li.querySelector('.item-actions');
						// The name is the link to its file, and nothing else is: there is no icon beside it for that.
						if (name?.tagName !== 'BUTTON' || !name.classList.contains('token-link')) problems.push(`${nameText}: its name is not a link`);
						if (actions || li.querySelector('.codicon-go-to-file')) problems.push(`${nameText}: has an icon to open its file`);
						if (box(li).height < 27.5) problems.push(`${nameText}: its row is ${box(li).height}px, under the 28 of a row`);
						// Flush at the right as a value is in the Styles (8px from the edge): its value, or its dot.
						const edge = (swatch ?? li.querySelector('.token-value')) as Element | null;
						if (edge && Math.abs(box(li).right - 8 - box(edge).right) > 1.5)
							problems.push(
								`${nameText}: its ${swatch ? 'dot' : 'value'} is not 8px from the right (${Math.round(box(li).right - box(edge).right)}px)`,
							);
						if (!dot || !swatch) continue;
						// Only its dot: nothing else says the colour.
						if (li.querySelector('[data-part="value"], [data-part="ref"]')) problems.push(`${nameText}: a colour says more than its dot`);
						if (name && !apart(box(name), box(swatch))) problems.push(`${nameText}: the name is over its dot`);
						if (actions && !apart(box(swatch), box(actions))) problems.push(`${nameText}: the dot is over the row's file button`);
						if (box(swatch).right > box(li).right + 0.5 || box(swatch).left < box(li).left - 0.5)
							problems.push(`${nameText}: its dot leaves its row`);
						if (box(li).height > Math.max(...plainHeights.map(Number)) + 1)
							problems.push(`${nameText}: its row is taller (${box(li).height}px) than a token's without a colour`);
						// A long name gives way, cut short, and does not run on under the dot.
						if (name && name.scrollWidth > name.clientWidth + 1 && getComputedStyle(name).textOverflow !== 'ellipsis')
							problems.push(`${nameText}: runs past its box`);
					}
					return { problems, rows: rows.length, dots: document.querySelectorAll('.color-dot').length };
				});
			});
			expect(found.rows).toBe(4);
			expect(found.dots).toBe(3);
			expect(found.problems).toEqual([]);
		},
		60_000,
	);

	// The side pane's two parts as the tab draws them: Styles (its titles, its groups, its pickers, its rows) and Tokens (its
	// categories, its sets, its rows, and what it sets itself), one above the other.
	const SidePane = () => {
		const tokens = [...ROW_TOKENS, token('palette.dark.main', 'primary', 'main', { group: 'Dark' })];
		const changes = useTokenChangesFor(tokens, [], () => undefined, undeclared('a test'));
		return createElement(
			TokenChangesProvider,
			{ value: changes },
			createElement('div', { dangerouslySetInnerHTML: { __html: markup } }),
			createElement(TokensUsed, {
				answer: {
					state: 'ready',
					uses: [],
					sharedWith: {},
					notTokens: [{ kind: 'color', value: 'rgb(1, 2, 3)', uses: 2 }],
					derived: 0,
					accessibility: null,
					values: { state: 'none-drawn' },
				} as never,
				tokens,
				info: () => 'a use',
				actions: { onEdit: () => undefined },
			}),
		);
	};
	const sidePane = renderToStaticMarkup(createElement(SidePane));

	it.each([PANE, 220])(
		'starts every title, group, set and row of the side pane at one left edge, in a %ipx pane',
		async (width) => {
			const found = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.setViewport({ width, height: 1200 });
				await page.setContent(
					`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside">${sidePane}</aside></main></body></html>`,
				);
				return page.evaluate(() => {
					// Where what is in it starts, not its box: a box's own padding is what would hide an indent.
					const left = (e: Element) => {
						// What has no text (a swatch) is its box.
						const range = document.createRange();
						range.selectNodeContents(e);
						const at = e.textContent?.trim() ? range.getBoundingClientRect() : e.getBoundingClientRect();
						return Math.round(at.left * 10) / 10;
					};
					const lefts = (selector: string) => [...document.querySelectorAll(selector)].map(left);
					const edge = left(document.querySelector('.aside-section .heading-part') as Element);
					return {
						edge,
						// What starts at it: the parts' titles, the groups' names, the pickers' names, the values' labels, the sets' names
						// and the sub-groups' (Light, Dark), the tokens' names, and what an own value starts with.
						kinds: {
							'a part’s title': lefts('.aside-section .heading-part'),
							'a group’s name': lefts('.heading-group'),
							'a picker’s name': lefts('.picker-name'),
							'a value’s label': lefts('.value-label'),
							'a set’s name': lefts('.heading-set'),
							'a sub-group’s name': lefts('.heading-label'),
							'a token’s name': lefts('.token-link'),
							'what an own value starts with': [...document.querySelectorAll('[data-not-token] .token-line > :first-child')].map(left),
						} as Record<string, number[]>,
					};
				});
			});
			for (const [kind, lefts] of Object.entries(found.kinds)) {
				expect(lefts.length, kind).toBeGreaterThan(0);
				for (const l of lefts) expect(l, `${kind} starts at ${l}, not ${found.edge}`).toBeCloseTo(found.edge, 0);
			}
		},
		60_000,
	);

	// What a token change moves, as long as it is said: a long variant, in dark, a colour with its opacity, a padding by side.
	const MOVED: ComponentReach[] = [
		{
			file: 'FSButton',
			changes: [
				{
					mode: 'dark',
					property: 'background',
					variant: 'destructiveSecondary · disabled',
					from: 'rgba(16, 128, 98, 0.5)',
					to: 'rgba(200, 0, 0, 0.5)',
					instances: 2,
				},
				{ mode: 'light', property: 'padding', variant: 'sm', from: '8px 16px 4px 12px', to: '10px 20px 6px 14px', instances: 4 },
				{ mode: 'light', property: 'radius', variant: null, from: '8px', to: '12px', instances: 6 },
				{ mode: 'dark', property: 'padding', variant: 'lg', from: '10px 20px 6px 14px', to: '12px 24px 8px 16px', instances: 1 },
			],
			inside: false,
		},
		{ file: 'FSTextField', changes: [], inside: true },
	];
	const moved = MOVED.map((reach) => renderToStaticMarkup(createElement(Moved, { reach, name: reach.file, here: reach.file === 'FSButton' }))).join(
		'',
	);

	it.each([PANE, 220])(
		'lays out what a token change moves without anything over anything, past the pane, or cut off, in a %ipx pane',
		async (width) => {
			const found = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.setViewport({ width, height: 900 });
				await page.setContent(
					`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside"><section class="aside-section">${moved}</section></aside></main></body></html>`,
				);
				return page.evaluate((atPane) => {
					const box = (e: Element) => e.getBoundingClientRect();
					const problems: string[] = [];
					const root = document.documentElement;
					if (root.scrollWidth > root.clientWidth) problems.push(`the page is ${root.scrollWidth}px in a ${root.clientWidth}px pane`);
					const pane = box(document.querySelector('.component-aside') as Element);
					const lines = [...document.querySelectorAll('[data-moved] .value-cell')];
					for (const line of lines) {
						const name = line.textContent?.slice(0, 30) ?? '';
						const [label, drawn] = [line.querySelector('.value-label') as Element, line.querySelector('.value-drawn') as Element];
						for (const part of [label, drawn]) {
							if (box(part).right > pane.right + 0.5 || box(part).left < pane.left - 0.5)
								problems.push(`${name}: ${part.className} is past the pane`);
							if (part.scrollWidth > part.clientWidth + 1) problems.push(`${name}: ${part.className} runs past its box`);
						}
						const [l, d] = [box(label), box(drawn)];
						const apart = l.right <= d.left + 0.5 || d.right <= l.left + 0.5 || l.bottom <= d.top + 0.5 || d.bottom <= l.top + 0.5;
						if (!apart) problems.push(`${name}: the name is over its value`);
						// The name gives way only when it is too long alone: when it breaks, its value is on the line under it.
						if (l.height > 24 && d.top < l.bottom - 0.5) problems.push(`${name}: the name is squeezed beside its value`);
						// Broken first at its arrow, between what it was and what it is; each line of it flush to the right.
						const parts = [...drawn.children].map(box);
						for (const p of parts) {
							// At the pane's width, each side on one line; much narrower, one wider than the line alone breaks, inside it.
							if (atPane && p.height > 24) problems.push(`${name}: a side of its change is broken over lines (${p.height}px)`);
							const ends = !parts.some((q) => q.left > p.left && q.top < p.bottom && p.top < q.bottom);
							if (ends && Math.abs(box(line).right - 8 - p.right) > 1.5) problems.push(`${name}: a line of its value is not at the right`);
						}
					}
					// A short one reads as a value does: its name and its value on one line, a row's own height (28px at least; two lines
					// would be about 44).
					const short = lines.find((l) => l.textContent?.startsWith('Radius'));
					if (!short || box(short).height > 30) problems.push(`the radius's change is not on one line (${short && box(short).height}px)`);
					for (const h of document.querySelectorAll('[data-moved] h3, .value-inside'))
						if (box(h).right > pane.right + 0.5 || h.scrollWidth > h.clientWidth + 1) problems.push(`${h.textContent}: past the pane`);
					return { problems, lines: lines.length };
				}, width === PANE);
			});
			expect(found.lines).toBe(4);
			expect(found.problems).toEqual([]);
		},
		60_000,
	);

	// The values tried and where each is written, as long as they are said: a deep CSS module, seven places, a long refusal.
	const TRIED = [
		{ property: 'height' as const, value: '32px', targets: ['h:sm:0'] },
		{ property: 'radius' as const, value: '12px 12px 12px 12px', targets: ['r:0'] },
		{ property: 'padding' as const, value: '2px 6px 2px 8px', targets: ['p:0'] },
	];
	const changedValues = renderToStaticMarkup(
		createElement(ChangedValues, {
			component: { id: 'FSButton', name: 'FSButton' } as never,
			components: [],
			rows: [
				{ property: 'height', by: 'size', cells: [cell('sm', '28px', 'own', [], 1)].map((c) => ({ ...c, targets: ['h:sm:0'] })) },
				{ property: 'radius', by: null, cells: [cell(null, '8px 8px 8px 8px', 'own', [], 1)].map((c) => ({ ...c, targets: ['r:0'] })) },
				{ property: 'padding', by: null, cells: [cell(null, '2px 6px 2px 6px', 'own', [], 1)].map((c) => ({ ...c, targets: ['p:0'] })) },
			],
			trying: {
				tried: new Map(TRIED.map((t) => [`${t.property}\u0000${t.targets.join('\u0001')}`, t])),
				onTry: () => undefined,
				onAll: () => undefined,
				onWrite: () => undefined,
				writes: 0,
				writeError: null,
			},
			tokenName: (path: string) => path,
			sources: {
				state: 'ready',
				values: [
					{
						id: 'height\u0000h:sm:0',
						state: 'found',
						by: 'agent',
						said: 'MUI’s outlined input sets its height, so the theme’s MuiTextField override sets 48px, with the spacing helper.',
						places: [{ file: 'packages/react/src/CounterLabel/CounterLabel.module.css', line: 10, written: '28px', writes: '32px' }],
					},
					{
						id: 'radius\u0000r:0',
						state: 'found',
						places: [58, 70, 96, 109, 122, 130, 142].map((line) => ({ file: 'src/utils/theme.ts', line, written: '8px', writes: '12px' })),
					},
					{
						id: 'padding\u0000p:0',
						state: 'refused',
						why: 'packages/react/src/Badge/Badge.module.css, line 3, writes 6px once for parts tried apart: try them together, or it cannot be saved.',
						agent: 'write',
					},
				],
				reach: { state: 'none' },
			},
			controls: {
				branch: { branch: 'dsnr/values-20261016-ab12', saved: [], lines: [], saves: 1, pullRequest: null },
				unsaved: true,
				busy: null,
				error: null,
				save: () => undefined,
				propose: () => undefined,
				startOver: () => undefined,
			},
			handOver: {
				branch: null,
				handed: null,
				busy: null,
				error: null,
				processChanges: () => undefined,
				propose: () => undefined,
				startOver: () => undefined,
				preview: () => undefined,
			},
		}),
	);

	it.each([PANE, 220])(
		'lays out the values changed, where each is written, and their branch, without anything over anything or past the pane, in a %ipx pane',
		async (width) => {
			const found = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.setViewport({ width, height: 900 });
				await page.setContent(
					`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside">${changedValues}</aside></main></body></html>`,
				);
				return page.evaluate(() => {
					const box = (e: Element) => e.getBoundingClientRect();
					const apart = (a: DOMRect, b: DOMRect) =>
						a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
					const problems: string[] = [];
					const root = document.documentElement;
					if (root.scrollWidth > root.clientWidth) problems.push(`the page is ${root.scrollWidth}px in a ${root.clientWidth}px pane`);
					const pane = box(document.querySelector('.component-aside') as Element);
					for (const el of document.querySelectorAll('[data-value-changes] *')) {
						const b = box(el);
						if (b.width === 0) continue;
						const name = `${el.className || el.tagName}: ${el.textContent?.slice(0, 30)}`;
						if (b.right > pane.right + 0.5 || b.left < pane.left - 0.5) problems.push(`${name} is past the pane`);
						if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') problems.push(`${name} runs past its box`);
					}
					// Each value's reset is beside what it says, never over it; and where it is written starts under its name.
					for (const li of document.querySelectorAll('[data-value-change]')) {
						const [label, place] = [li.querySelector('.value-label'), li.querySelector('.value-place')];
						// Where its text's lines start, not its box.
						const range = document.createRange();
						if (place) range.selectNodeContents(place);
						const starts = place ? [...range.getClientRects()].map((r) => r.left) : [];
						const lines = [Math.min(...starts)].filter(Number.isFinite).map((left) => ({ left }));
						if (label && lines.some((r) => Math.abs(r.left - box(label).left) > 0.5))
							problems.push(`"${place?.textContent?.slice(0, 30)}" does not start under its name`);
						const reset = li.querySelector('.item-actions button');
						for (const part of li.querySelectorAll('.value-label, .value-drawn, .value-place'))
							if (reset && !apart(box(reset), box(part))) problems.push(`the reset is over "${part.textContent?.slice(0, 30)}"`);
					}
					return { problems, values: document.querySelectorAll('[data-value-change]').length };
				});
			});
			expect(found.values).toBe(3);
			expect(found.problems).toEqual([]);
		},
		60_000,
	);

	// A hand-over's branch as DSNR read it: a long name, deep paths, a file the rules keep out, and too large for one sitting.
	const handedOver = renderToStaticMarkup(
		createElement(HandOverActions, {
			controls: {
				branch: {
					branch: 'dsnr/handoff-20261017-ab12',
					saved: { tried: [] },
					lines: [],
					saves: 0,
					review: {
						state: 'ready',
						tip: 'c'.repeat(40),
						commits: 3,
						files: [
							{ path: 'packages/react/src/components/FSCounterLabel/FSCounterLabel.module.css', added: 120, removed: 48, out: null },
							{ path: 'packages/react/src/components/FSCounterLabel/FSCounterLabel.stories.tsx', added: 210, removed: 0, out: 'a story' },
						],
						lines: 378,
						large: true,
					},
					pullRequest: null,
				},
				handed: null,
				busy: null,
				error: 'git could not push dsnr/handoff-20261017-ab12: the remote refused it.',
				processChanges: () => undefined,
				propose: () => undefined,
				startOver: () => undefined,
				preview: () => undefined,
			},
		}),
	);

	it.each([PANE, 220])(
		'lays out a hand-over’s branch and its files without anything past the pane, in a %ipx pane',
		async (width) => {
			const problems = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.setViewport({ width, height: 900 });
				await page.setContent(
					`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside">${handedOver}</aside></main></body></html>`,
				);
				return page.evaluate(() => {
					const found: string[] = [];
					const root = document.documentElement;
					if (root.scrollWidth > root.clientWidth) found.push(`the page is ${root.scrollWidth}px in a ${root.clientWidth}px pane`);
					const pane = (document.querySelector('.component-aside') as Element).getBoundingClientRect();
					for (const el of document.querySelectorAll('[data-hand-over] *')) {
						const b = el.getBoundingClientRect();
						if (b.width === 0) continue;
						const name = `${el.className || el.tagName}: ${el.textContent?.slice(0, 30)}`;
						if (b.right > pane.right + 0.5 || b.left < pane.left - 0.5) found.push(`${name} is past the pane`);
						if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') found.push(`${name} runs past its box`);
					}
					return found;
				});
			});
			expect(problems).toEqual([]);
		},
		60_000,
	);

	it('puts the accessibility findings behind a link as wide as its words, in the side pane, not stretched across the part', async () => {
		const result = {
			violations: [
				{
					rule: 'color-contrast',
					help: 'Text needs more contrast',
					url: 'https://dequeuniversity.com/x',
					wcag: ['1.4.3'],
					impact: 'serious',
					elements: [],
					count: 1,
					states: ['default'],
				},
			],
			incomplete: [],
			bestPractice: { violations: [], incomplete: [] },
			notAutomated: [],
			ran: { axe: '4.10', target: 'WCAG 2.2 AA', states: ['default'] },
		} as never;
		const html = renderToStaticMarkup(createElement('section', { className: 'aside-section' }, createElement(AccessibilityFindings, { result })));
		const found = await inChrome(async (browser) => {
			const page = await browser.newPage();
			await page.setViewport({ width: PANE, height: 600 });
			await page.setContent(
				`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="tab"><aside class="component-aside">${html}</aside></main></body></html>`,
			);
			return page.evaluate(() => {
				const link = document.querySelector('button.link') as HTMLElement;
				const part = document.querySelector('.aside-section') as HTMLElement;
				const text = document.createRange();
				text.selectNodeContents(link);
				return {
					link: Math.round(link.getBoundingClientRect().width),
					words: Math.round(text.getBoundingClientRect().width),
					part: Math.round(part.getBoundingClientRect().width),
				};
			});
		});
		// As wide as its words (a pixel or two of padding at most), not the part's width.
		expect(found.link).toBeLessThanOrEqual(found.words + 2);
		expect(found.link).toBeLessThan(found.part / 2);
	}, 60_000);

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
						// Each part with a short name on one line: its name, then its slider, then its number, level with each other.
						const oneLine = [...pop.querySelectorAll<HTMLElement>('.popover-field-line')].map((f) => {
							const [name, slider, number] = ['.popover-label', 'input[type="range"]', '.token-value'].map((s) => box(f.querySelector(s) as Element));
							const middle = (r: DOMRect) => (r.top + r.bottom) / 2;
							return (
								name!.right <= slider!.left + 0.5 &&
								slider!.right <= number!.left + 0.5 &&
								Math.abs(middle(name!) - middle(slider!)) < 4 &&
								Math.abs(middle(number!) - middle(slider!)) < 4
							);
						});
						return {
							problems,
							sliders,
							oneLine,
							width: Math.round(p.width),
							cellWidth: Math.round(c.width),
							below: ((cells) => ((next) => (next ? box(next).top < p.bottom : false))(cells[cells.indexOf(li) + 1] ?? null))(
								[...document.querySelectorAll('[data-value-cell]')].filter((other) => (other as HTMLElement).checkVisibility()),
							),
						};
					},
					popover(property, value),
					row,
				);
			}
			return out as Record<string, { problems: string[]; sliders: number[]; oneLine: boolean[]; width: number; cellWidth: number; below: boolean }>;
		});
		for (const f of Object.values(found)) expect(f.problems).toEqual([]);
		// Two parts, two sliders, each wide enough to use; across the cell it opens from; over the next value, not pushing it down.
		expect(found.padding?.sliders).toHaveLength(2);
		for (const w of found.padding?.sliders ?? []) expect(w).toBeGreaterThan(80);
		// X and Y, each on one line with its slider and number.
		expect(found.padding?.oneLine).toEqual([true, true]);
		expect(found.padding?.width).toBe(found.padding?.cellWidth);
		expect(found.padding?.below).toBe(true);
	}, 60_000);

	it('keeps a part’s title at the top of the pane while the part is in view, the next part’s replacing it; no group’s heading sticks; and the pane is 300px wide', async () => {
		// As VS Code shows the component's tab with room for two columns: the page is the window's height, the stories and the
		// analysis each scroll inside it. The editor's own background is what a title covers what is under it with. The Styles
		// part is the real one; the parts after it are as tall as the real ones, so each title has room to come to the top.
		const part = (title: string) =>
			renderToStaticMarkup(createElement(AsidePart, { title, children: createElement('div', { style: { height: '500px' } }, `${title} content`) }));
		const tall = `${markupFor([...ROWS, { property: 'text', by: null, cells: [cell(null, 'rgb(9, 9, 9)', 'own')] }])}${part('Tokens')}${part('Accessibility')}<div style="flex-shrink: 0; height: 400px"></div>`;
		const found = await inChrome(async (browser) => {
			const page = await browser.newPage();
			await page.setViewport({ width: 1100, height: 300 });
			await page.setContent(
				`<!doctype html><html><head><meta charset="utf-8"><style>:root{--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#ddd}${css}</style></head><body><main class="tab tab-split"><header class="tab-header"><h1 class="heading heading-page">FSButton</h1></header><div class="component-layout"><div class="component-stories"></div><aside class="component-aside">${tall}</aside></div></main></body></html>`,
			);
			return page.evaluate(async () => {
				const aside = document.querySelector('.component-aside') as HTMLElement;
				const top = () => aside.getBoundingClientRect().top;
				const headings = [...document.querySelectorAll<HTMLElement>('.aside-heading')];
				const named = (h: HTMLElement) => h.textContent ?? '';
				const stuck = () => headings.filter((h) => Math.abs(h.getBoundingClientRect().top - top()) < 1.5).map(named);
				const seen: string[][] = [];
				// Scrolled a little at a time, from the top to the bottom: which title is at the top of the pane at each stop.
				for (let at = 0; at <= aside.scrollHeight; at += 10) {
					aside.scrollTop = at;
					await new Promise((r) => requestAnimationFrame(() => r(null)));
					seen.push(stuck());
				}
				// While a part is in view its title covers what scrolls under it: opaque, over it.
				aside.scrollTop = 0;
				const covers = headings.map((h) => getComputedStyle(h).backgroundColor !== 'rgba(0, 0, 0, 0)' && Number(getComputedStyle(h).zIndex) >= 1);
				// And no group's own heading sticks, nor stays at the top of the pane at any stop.
				const groups = [...document.querySelectorAll<HTMLElement>('.heading-group')].map((g) => getComputedStyle(g).position);
				return {
					width: Math.round(aside.getBoundingClientRect().width),
					scrolls: aside.scrollHeight > aside.clientHeight,
					titles: headings.map(named),
					seen,
					covers,
					groups,
				};
			});
		});
		expect(found.width).toBe(300);
		expect(found.scrolls).toBe(true);
		expect(found.titles).toEqual(['Styles', 'Tokens', 'Accessibility']);
		expect(found.covers.every(Boolean)).toBe(true);
		// Each part's title was at the top at some stop, and never two at once: one replaces the next.
		const stopped = new Set(found.seen.flat());
		for (const t of found.titles) expect(stopped.has(t), t).toBe(true);
		expect(found.seen.every((s) => s.length <= 1)).toBe(true);
		// In the order the parts are in: a title is replaced by the next, never the one before.
		expect(found.seen.flat().filter((g, i, all) => g !== all[i - 1])).toEqual(found.titles);
		// A group's heading is a heading and nothing more: it does not stick.
		expect(found.groups.length).toBeGreaterThan(0);
		expect(found.groups.every((p) => p !== 'sticky')).toBe(true);
	}, 60_000);
});
