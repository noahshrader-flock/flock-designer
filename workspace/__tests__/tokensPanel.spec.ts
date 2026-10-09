// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TokensPanel } from '../src/renderer/TokensPanel';
import type { DesignToken, DesignTokens } from '../src/shared/contract';
import { press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * The tokens panel (T2 of the design system plan), read only: the list T1 reads, in collapsible groups, each set of
 * tokens with its swatches and where it is written, and a search. Against the panel on its own.
 */

const color = (path: string, group: string, set: string, name: string, value: string, more: Partial<DesignToken> = {}): DesignToken => ({
	path,
	kind: 'color',
	category: 'Color',
	group,
	set,
	name,
	value,
	source: { file: group === 'Tones' ? `src/colors/tones/${set}.ts` : `src/colors/theme/${group.toLowerCase()}.ts`, line: 3 },
	...more,
});
const TOKENS: DesignTokens = {
	source: 'theme files',
	looked: ['src/colors/tones/index.ts'],
	problems: [],
	tokens: [
		color('tone.pineGreen.50', 'Tones', 'pineGreen', '50', '#108062'),
		color('tone.pineGreen.20', 'Tones', 'pineGreen', '20', '#18372F'),
		color('tone.red.40', 'Tones', 'red', '40', '#BA1A1A'),
		color('palette.light.primary.main', 'Light', 'primary', 'main', '#108062', { ref: { tone: 'pineGreen', step: '50' } }),
		color('palette.light.primaryBorder.main', 'Light', 'primaryBorder', 'main', '#18372F66', { ref: { tone: 'pineGreen', step: '20', alpha: '66' } }),
		color('palette.dark.primary.main', 'Dark', 'primary', 'main', '#C7E7DD', { ref: { tone: 'pineGreen', step: '90' } }),
		{ path: 'spacing', kind: 'dimension', category: 'Spacing', group: 'Spacing', set: 'spacing', name: 'base', value: '8px', source: { file: 'src/utils/theme.ts', line: 2 } },
		{ path: 'radius', kind: 'dimension', category: 'Shape', group: 'Radius', set: 'radius', name: 'base', value: '8px', source: { file: 'src/utils/theme.ts', line: 5 } },
	],
};

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (tokens: DesignTokens = TOKENS) => {
	current = await render(createElement(TokensPanel, { tokens }));
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

/** The groups' triggers, as shown: the only accordion in the panel, and only on a tab with several groups. */
const groups = () => [...document.querySelectorAll<HTMLElement>('[data-token-group] > h3 button')];
const group = (name: string) => {
	const t = groups().find((b) => b.querySelector('[data-name]')?.textContent === name);
	if (!t) throw new Error(`no group ${name}: ${groups().map((b) => b.textContent).join(' | ')}`);
	return t;
};
/** The sets shown, each a plain heading over its rows, never closed up behind another trigger. */
const sets = () => [...document.querySelectorAll<HTMLElement>('[data-token-set]')];
const setNames = () => sets().map((e) => e.querySelector('[data-set-name]')?.textContent);
/** The tabs, and choosing one as a press does (tabs switch as the pointer goes down). */
const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
const tab = (name: string) => tabs().find((t) => t.textContent === name) as HTMLElement;
const choose = (name: string) => act(async () => void tab(name).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })));
const search = (category: string) => document.querySelector<HTMLInputElement>(`input[aria-label="Search ${category.toLowerCase()}"]`);
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-token]')];
const row = (path: string) => document.querySelector<HTMLElement>(`[data-token="${path}"]`);
const text = () => document.body.textContent ?? '';

describe('the tabs', () => {
	it('rest on a bottom border, so there is a line between them and what is under them', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['border-b', 'w-full']));
		// And the content starts below it, with its own room: the line is not touching the search box.
		expect(list.nextElementSibling?.className).toContain('mt-');
	});

	it('are the categories the library has, in order, as line tabs, with no heading or count above them', async () => {
		await show();
		expect(tabs().map((t) => t.textContent)).toEqual(['Color', 'Spacing', 'Shape']);
		expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
		expect(document.querySelector('[data-slot="tabs-list"]')?.getAttribute('data-variant')).toBe('line');
		expect(text()).not.toContain('8 tokens');
		expect([...document.querySelectorAll('h3')].map((h) => h.textContent)).not.toContain('Tokens');
	});

	it('are made from the tokens, so a category the library gains is a tab with nothing else changed', async () => {
		await show({ ...TOKENS, tokens: [...TOKENS.tokens, { path: 'shadow.1', kind: 'dimension', category: 'Shadow', group: 'Elevation', set: 'elevation', name: '1', value: '0 1px 2px', source: { file: 'src/utils/theme.ts', line: 9 } }] });
		expect(tabs().map((t) => t.textContent)).toEqual(['Color', 'Spacing', 'Shape', 'Shadow']);
	});

	it('switch, each showing only its own tokens', async () => {
		await show();
		expect(groups().map((t) => t.querySelector('[data-name]')?.textContent)).toEqual(['Tones', 'Light', 'Dark']);
		await choose('Spacing');
		await settle();
		expect(tab('Spacing').getAttribute('aria-selected')).toBe('true');
		expect(setNames()).toEqual(['spacing']);
		expect(groups()).toHaveLength(0);
	});
});

describe('the groups', () => {
	it('on the Color tab are the library’s, in order, each with its count, and all closed at first', async () => {
		await show();
		expect(groups().map((t) => [t.querySelector('[data-name]')?.textContent, t.querySelector('[data-count]')?.textContent])).toEqual([
			['Tones', '3'],
			['Light', '2'],
			['Dark', '1'],
		]);
		expect(rows()).toHaveLength(0);
	});

	it('open straight to their sets, each its name over its colors, with no second accordion inside', async () => {
		await show();
		await press(group('Tones'));
		await settle();
		expect(setNames()).toEqual(['pineGreen', 'red']);
		// Every color of every set is listed already: nothing is left to open.
		expect(rows().map((r) => r.getAttribute('data-token'))).toEqual(['tone.pineGreen.50', 'tone.pineGreen.20', 'tone.red.40']);
		expect(document.querySelectorAll('[data-token-group] [data-slot="accordion"]')).toHaveLength(0);
		expect(document.querySelectorAll('[data-slot="accordion-item"]')).toHaveLength(3);
	});

	it('are not shown for a tab with only one, which would say its own name twice: its sets are, already open', async () => {
		await show();
		await choose('Shape');
		await settle();
		expect(groups()).toHaveLength(0);
		expect(document.querySelector('[data-slot="accordion"]')).toBeNull();
		expect(setNames()).toEqual(['radius']);
		expect(rows().map((r) => r.getAttribute('data-token'))).toEqual(['radius']);
	});
});

describe('a set', () => {
	it('lists its tokens: a swatch of the color at the left, its name, and the value at the right', async () => {
		await show();
		await press(group('Tones'));
		await settle();
		const step = row('tone.pineGreen.50') as HTMLElement;
		expect(step.firstElementChild?.getAttribute('data-swatch')).not.toBeNull();
		expect(step.querySelector<HTMLElement>('[data-swatch]')?.style.backgroundColor).toBe('rgb(16, 128, 98)');
		expect(step.textContent).toContain('50');
		expect(step.lastElementChild?.textContent).toBe('#108062');
		// Where it is written, line and all, for whoever wants to find it.
		expect(step.getAttribute('title')).toBe('src/colors/tones/pineGreen.ts:3');
	});

	it('says which tone a palette role points at, and its opacity', async () => {
		await show();
		await press(group('Light'));
		await settle();
		expect(row('palette.light.primaryBorder.main')?.textContent).toContain('pineGreen 20 at 40%');
		expect(row('palette.light.primary.main')?.textContent).toContain('pineGreen 50');
	});

	it('shows a dimension as its value, with no swatch', async () => {
		await show();
		await choose('Shape');
		await settle();
		const radius = row('radius') as HTMLElement;
		expect(radius.textContent).toContain('8px');
		expect(radius.querySelector('[data-swatch]')).toBeNull();
	});
});

describe('searching', () => {
	it('is the app’s own search box, with its icon, as on the Projects screen', async () => {
		await show();
		const box = search('Color') as HTMLInputElement;
		expect(box.closest('[data-slot="input-group"]')?.querySelector('.lucide-search')).not.toBeNull();
		expect(box.placeholder).toBe('Search color');
	});

	it('clears with Escape', async () => {
		await show();
		await typeInto(search('Color') as HTMLInputElement, 'primary');
		await act(async () => void (search('Color') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
		expect((search('Color') as HTMLInputElement).value).toBe('');
	});

	it('is in each tab, with its own box, and shows only what matches in that tab, opened to it', async () => {
		await show();
		await typeInto(search('Color') as HTMLInputElement, 'primary');
		await settle();
		expect(groups().map((t) => t.querySelector('[data-name]')?.textContent)).toEqual(['Light', 'Dark']);
		expect(rows().map((r) => r.getAttribute('data-token'))).toEqual(['palette.light.primary.main', 'palette.light.primaryBorder.main', 'palette.dark.primary.main']);
	});

	it('is kept apart: what is typed in one tab leaves the others as they were, and is there when you come back', async () => {
		await show();
		await typeInto(search('Color') as HTMLInputElement, 'primary');
		await settle();
		await choose('Spacing');
		await settle();
		expect((search('Spacing') as HTMLInputElement).value).toBe('');
		expect(sets()).toHaveLength(1);
		await choose('Color');
		await settle();
		expect((search('Color') as HTMLInputElement).value).toBe('primary');
		expect(rows()).toHaveLength(3);
	});

	it('finds a color by its value, and says when nothing matches', async () => {
		await show();
		await typeInto(search('Color') as HTMLInputElement, '#ba1a1a');
		await settle();
		expect(rows().map((r) => r.getAttribute('data-token'))).toEqual(['tone.red.40']);
		await typeInto(search('Color') as HTMLInputElement, 'nothing like this');
		await settle();
		expect(text()).toContain('No token matches.');
	});
});

describe('what it could not read', () => {
	it('is not said in the panel, which keeps its room: it is told beside Sync, in a dialog', async () => {
		await show({ ...TOKENS, problems: [{ file: 'src/colors/tones/neutral.ts', line: 10, reason: "neutral 94 is '@ECEEEB', not a hex color, so this step is not read" }] });
		expect(text()).not.toContain('could not be read');
		expect(text()).not.toContain('neutral.ts:10');
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});

	it('is said plainly when no tokens were found, with where it looked', async () => {
		await show({ source: null, tokens: [], problems: [], looked: ['theme files', 'CSS variables', 'token files'] });
		expect(text()).toContain('No tokens were found in this library.');
		expect(text()).toContain('Looked for theme files, CSS variables, token files.');
		expect(tabs()).toHaveLength(0);
		expect(document.querySelector('input[type="search"]')).toBeNull();
	});
});
