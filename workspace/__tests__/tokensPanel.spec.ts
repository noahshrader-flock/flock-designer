// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TokensPanel } from '../src/renderer/TokensPanel';
import type { DesignToken, DesignTokens, TokenEdit } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, typeInto, unmountAll } from './reviewHarness';
import { useTokenBranch } from '../src/renderer/useTokenBranch';

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
		color('palette.light.primary.main', 'Light', 'primary', 'main', '#108062', { ref: { path: 'tone.pineGreen.50' } }),
		color('palette.light.primaryBorder.main', 'Light', 'primaryBorder', 'main', '#18372F66', { ref: { path: 'tone.pineGreen.20', alpha: '66' } }),
		color('palette.dark.primary.main', 'Dark', 'primary', 'main', '#C7E7DD', { ref: { path: 'tone.pineGreen.90' } }),
		{ path: 'spacing', kind: 'dimension', category: 'Spacing', group: 'Spacing', set: 'spacing', name: 'base', value: '8px', source: { file: 'src/utils/theme.ts', line: 2 } },
		{ path: 'radius', kind: 'dimension', category: 'Shape', group: 'Radius', set: 'radius', name: 'base', value: '8px', source: { file: 'src/utils/theme.ts', line: 5 } },
	],
};

let current: Awaited<ReturnType<typeof render>> | null = null;
/** Every change the panel made, newest last: the tab keeps the change, as `DesignSystem` does. */
let made: TokenEdit[][] = [];
const Tab = ({ tokens, live }: { tokens: DesignTokens; live: boolean }) => {
	const [edits, setEdits] = useState<TokenEdit[]>([]);
	const onEdits = (e: TokenEdit[]) => (made.push(e), setEdits(e));
	const branch = useTokenBranch('acme/ui', edits, onEdits);
	return createElement(TokensPanel, { tokens, edits, live, onEdits, branch });
};
/** The app the panel saves and proposes through: a stand-in, so nothing is written or opened. */
let app: ReturnType<typeof fakeApp>;
const show = async (tokens: DesignTokens = TOKENS, live = true, more: Record<string, (...a: never[]) => unknown> = {}) => {
	made = [];
	app = fakeApp(more);
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Tab, { tokens, live }));
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
	it('run edge to edge across the panel: nothing around them is padded, only the content under them is', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		const panel = list.closest('[data-slot="panel-tabs"]') as HTMLElement;
		expect(panel).not.toBeNull();
		// No ancestor between the strip and the panel's edge has padding of its own.
		for (let el = list.parentElement; el && el !== panel.parentElement; el = el.parentElement) expect(el.className, el.tagName).not.toMatch(/(^|\s)p[xtblr]?-\d/);
		// The padding is the content's, which also scrolls on its own, so the strip stays at the top.
		const content = document.querySelector('[data-slot="tabs-content"]') as HTMLElement;
		expect(content.className.split(' ')).toEqual(expect.arrayContaining(['p-4', 'overflow-y-auto']));
	});

	it('rest on a bottom border, so there is a line between them and what is under them', async () => {
		await show();
		const list = document.querySelector('[data-slot="tabs-list"]') as HTMLElement;
		expect(list.className.split(' ')).toEqual(expect.arrayContaining(['border-b', 'w-full']));
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
	it('on the Color tab are the library’s, in order, each with its count, and all open at first', async () => {
		await show();
		expect(groups().map((t) => [t.querySelector('[data-name]')?.textContent, t.querySelector('[data-count]')?.textContent])).toEqual([
			['Tones', '3'],
			['Light', '2'],
			['Dark', '1'],
		]);
		expect(groups().map((t) => t.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'true']);
		expect(rows()).toHaveLength(6);
	});

	it('have headers that stick to the top of the panel while the group is shown, each within its own group', async () => {
		await show();
		for (const item of document.querySelectorAll<HTMLElement>('[data-token-group]')) {
			// The header is what sticks, on the panel's own background so what scrolls under it is hidden, and the item is its limit.
			expect(item.className.split(' ')).toEqual(expect.arrayContaining(['[&>h3]:sticky', '[&>h3]:top-0', '[&>h3]:z-10', '[&>h3]:bg-card']));
			expect(item.firstElementChild?.tagName).toBe('H3');
			expect(item.className).not.toContain('overflow');
			// Flush under the tabs: the scrolling content has nothing above it that a stuck header could leave a gap for.
			expect(item.closest('[role="tabpanel"]')?.className.split(' ')).toContain('pt-0');
		}
	});

	it('close and open again on a press, each on its own', async () => {
		await show();
		await press(group('Light'));
		await settle();
		expect(groups().map((t) => t.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'true']);
		expect(rows().map((r) => r.getAttribute('data-token'))).not.toContain('palette.light.primary.main');
		await press(group('Light'));
		await settle();
		expect(group('Light').getAttribute('aria-expanded')).toBe('true');
	});

	it('open straight to their sets, each its name over its colors, with no second accordion inside', async () => {
		await show();
		expect(setNames()).toEqual(['pineGreen', 'red', 'primary', 'primaryBorder', 'primary']);
		// Every color of every set is listed already: nothing is left to open.
		expect(rows().map((r) => r.getAttribute('data-token'))).toEqual([
			'tone.pineGreen.50',
			'tone.pineGreen.20',
			'tone.red.40',
			'palette.light.primary.main',
			'palette.light.primaryBorder.main',
			'palette.dark.primary.main',
		]);
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
		const step = row('tone.pineGreen.50')?.querySelector('button') as HTMLElement;
		expect(step.firstElementChild?.getAttribute('data-swatch')).not.toBeNull();
		expect(step.querySelector<HTMLElement>('[data-swatch]')?.style.backgroundColor).toBe('rgb(16, 128, 98)');
		expect(step.textContent).toContain('50');
		expect(step.lastElementChild?.textContent).toBe('#108062');
		// Where it is written, line and all, for whoever wants to find it.
		expect(row('tone.pineGreen.50')?.getAttribute('title')).toBe('src/colors/tones/pineGreen.ts:3');
	});

	it('says which tone a palette role points at, and its opacity', async () => {
		await show();
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

	it('is in each tab, with its own box, and shows only what matches in that tab', async () => {
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
	it('is one alert above the tabs, its details in a dialog and not in the panel, which keeps its room', async () => {
		await show({ ...TOKENS, problems: [{ file: 'src/colors/tones/neutral.ts', line: 10, reason: "neutral 94 is '@ECEEEB', not a hex color, so this step is not read" }] });
		const alert = document.querySelector('[role="alert"]') as HTMLElement;
		expect(alert.textContent).toBe('1 value couldn’t be readView');
		expect(alert.compareDocumentPosition(tabs()[0] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(text()).not.toContain('neutral.ts:10');
	});

	it('is not there when everything was read', async () => {
		await show();
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});

	it('is said plainly when no tokens were found, with where it looked', async () => {
		await show({ source: null, tokens: [], problems: [], looked: ['theme files', 'CSS variables', 'token files'] });
		expect(text()).toContain('No tokens were found in this library.');
		expect(text()).toContain('Looked for theme files, CSS variables, token files.');
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(tabs()).toHaveLength(0);
		expect(document.querySelector('input[type="search"]')).toBeNull();
	});
});

describe('changing a token (T3)', () => {
	/** Opens a token's control from its row, as a press does. */
	const open = async (path: string) => {
		await press(row(path)?.querySelector('button') as HTMLElement);
		await settle();
		return document.querySelector<HTMLElement>(`[data-token-editor="${path}"]`) as HTMLElement;
	};
	const changedList = () => document.querySelector<HTMLElement>('[data-changed-tokens]');
	/** Sets a color input as a person picking one does, then closes the picker (its `change`). */
	const pick = (input: HTMLInputElement, value: string, close = true) =>
		act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			if (close) input.dispatchEvent(new Event('change', { bubbles: true }));
		});

	it('opens from a row, beside the panel: no control is on a row until it is opened', async () => {
		await show();
		expect(document.querySelector('input[type="color"]')).toBeNull();
		const editor = await open('palette.light.primary.main');
		expect(editor.textContent).toContain('Light primary main');
		expect(editor.textContent).toContain('src/colors/theme/light.ts:3');
	});

	it('points a role at another step of its tone by default, which keeps the link', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		expect(editor.textContent).toContain('Points at pineGreen 50');
		const steps = [...editor.querySelectorAll<HTMLButtonElement>('[aria-label="Steps of pineGreen"] button')];
		expect(steps.map((s) => s.getAttribute('aria-label'))).toEqual(['pineGreen 50', 'pineGreen 20']);
		expect(steps.map((s) => s.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
		// No color picker until it is asked for: a custom color is the second choice.
		expect(editor.querySelector('input[type="color"]')).toBeNull();
		await press(steps[1] as HTMLButtonElement);
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'palette.light.primary.main', ref: 'tone.pineGreen.20' }]);
		expect(row('palette.light.primary.main')?.textContent).toContain('pineGreen 20');
		expect(row('palette.light.primary.main')?.textContent).toContain('#18372F');
		expect(row('palette.light.primary.main')?.hasAttribute('data-changed')).toBe(true);
	});

	it('gives a role a custom color only when asked, saying it cuts the link', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		await press(button('Use a custom color', editor));
		await settle();
		expect(editor.textContent).toContain('A custom color replaces the pointer: a later change to pineGreen will not reach it.');
		const hex = editor.querySelector<HTMLInputElement>('input[aria-label="Hex"]') as HTMLInputElement;
		await typeInto(hex, '#123456');
		await act(async () => void hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'palette.light.primary.main', value: '#123456' }]);
		expect(row('palette.light.primary.main')?.textContent).not.toContain('pineGreen');
	});

	it('changes a tone with a picker and its hex, when the picker is closed, and the roles that point at it follow', async () => {
		await show();
		const editor = await open('tone.pineGreen.50');
		expect(editor.textContent).toContain('Used by 1 role');
		const picker = editor.querySelector<HTMLInputElement>('input[type="color"]') as HTMLInputElement;
		// Moving through colors builds nothing: only closing the picker does.
		await pick(picker, '#0a6b52', false);
		expect(made).toEqual([]);
		await pick(picker, '#0a6b52');
		expect(made.at(-1)).toEqual([{ path: 'tone.pineGreen.50', value: '#0A6B52' }]);
		expect(row('palette.light.primary.main')?.textContent).toContain('#0A6B52');
	});

	it('refuses a hex that is not one, and keeps what it was', async () => {
		await show();
		const editor = await open('tone.pineGreen.50');
		const hex = editor.querySelector<HTMLInputElement>('input[aria-label="Hex"]') as HTMLInputElement;
		await typeInto(hex, 'green');
		await act(async () => void hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
		await settle();
		expect(made).toEqual([]);
		expect(hex.value).toBe('#108062');
	});

	it('changes a dimension with a slider and its number, when the slider is let go of', async () => {
		await show();
		await choose('Spacing');
		const editor = await open('spacing');
		const thumb = editor.querySelector<HTMLElement>('[role="slider"]') as HTMLElement;
		expect(thumb.getAttribute('aria-label')).toBe('spacing base');
		expect(thumb.getAttribute('aria-valuemax')).toBe('32');
		await act(async () => void thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'spacing', value: '9px' }]);
	});

	it('lists what was changed above the tabs, from what it was to what it is, with a reset for each and for all', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		await press(editor.querySelector('[aria-label="pineGreen 20"]') as HTMLElement);
		await settle();
		const list = changedList() as HTMLElement;
		expect(list.compareDocumentPosition(tabs()[0] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(list.querySelector('h3')?.textContent).toBe('Changed 1');
		expect(list.querySelector('[data-change="palette.light.primary.main"]')?.textContent).toContain('pineGreen 50 → pineGreen 20');
		expect(list.textContent).toContain('Tried in the previews.');
		await press(button('Reset Light primary main'));
		await settle();
		expect(made.at(-1)).toEqual([]);
		expect(changedList()).toBeNull();
	});

	it('resets every change at once', async () => {
		await show();
		await open('tone.pineGreen.50');
		await pick(document.querySelector('input[type="color"]') as HTMLInputElement, '#000000');
		await press(button('Change Tones red 40'));
		await settle();
		await pick(document.querySelector('[data-token-editor="tone.red.40"] input[type="color"]') as HTMLInputElement, '#FFFFFF');
		expect(made.at(-1)).toHaveLength(2);
		await press(button('Reset all'));
		await settle();
		expect(made.at(-1)).toEqual([]);
	});

	it('makes no change, and so builds nothing, when the same change is made again', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		await press(editor.querySelector('[aria-label="pineGreen 50"]') as HTMLElement);
		await settle();
		const hex = (await open('tone.pineGreen.50')).querySelector<HTMLInputElement>('input[aria-label="Hex"]') as HTMLInputElement;
		await act(async () => void hex.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
		await settle();
		expect(made).toEqual([]);
	});

	it('is no change when a token is changed back to what the library has', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		await press(editor.querySelector('[aria-label="pineGreen 20"]') as HTMLElement);
		await settle();
		await press(document.querySelector('[data-token-editor="palette.light.primary.main"] [aria-label="pineGreen 50"]') as HTMLElement);
		await settle();
		expect(made.at(-1)).toEqual([]);
	});

	it('says to open a component when none is open, as nothing on the list shows a change', async () => {
		await show(TOKENS, false);
		await open('tone.pineGreen.50');
		await pick(document.querySelector('input[type="color"]') as HTMLInputElement, '#000000');
		expect(changedList()?.textContent).toContain('Open a component to see them.');
	});

	describe('what it says a change does', () => {
		const PAIR: DesignTokens = {
			...TOKENS,
			tokens: [
				color('palette.light.primary.main', 'Light', 'primary', 'main', '#108062'),
				color('palette.light.primary.contrastText', 'Light', 'primary', 'contrastText', '#FFFFFF'),
				// Written once, in a palette both modes spread in: one place, two tokens.
				color('palette.light.info.main', 'Light', 'info', 'main', '#0000FF', { source: { file: 'src/colors/theme/shared.ts', line: 4 } }),
				color('palette.dark.info.main', 'Dark', 'info', 'main', '#0000FF', { source: { file: 'src/colors/theme/shared.ts', line: 4 } }),
			],
		};

		it('shows a pair’s contrast on the row read under the other, and warns below AA', async () => {
			await show(PAIR);
			const ratio = () => row('palette.light.primary.main')?.querySelector<HTMLElement>('[data-contrast]');
			expect(ratio()?.textContent).toBe('4.8:1');
			expect(ratio()?.className).toContain('text-muted-foreground');
			expect(row('palette.light.primary.contrastText')?.querySelector('[data-contrast]')).toBeNull();
			const editor = await open('palette.light.primary.main');
			expect(editor.textContent).toContain('Contrast with contrastText: 4.8:1, passes AA for text');
			await pick(editor.querySelector('input[type="color"]') as HTMLInputElement, '#BBBBBB');
			expect(ratio()?.textContent).toBe('1.9:1');
			expect(ratio()?.className).toContain('text-warning');
			expect(document.querySelector('[data-token-editor]')?.textContent).toContain('below AA, which asks 4.5:1 for text');
		});

		it('says when a token is written in one place with another, and marks both as changed', async () => {
			await show(PAIR);
			const editor = await open('palette.light.info.main');
			expect(editor.textContent).toContain('Also changes Dark info main: written in one place.');
			await pick(editor.querySelector('input[type="color"]') as HTMLInputElement, '#00FF00');
			expect(row('palette.dark.info.main')?.hasAttribute('data-changed')).toBe(true);
			expect(row('palette.dark.info.main')?.textContent).toContain('#00FF00');
		});
	});
});

describe('naming and reach (T3)', () => {
	it('names a token with where it is shown, without saying a word twice', async () => {
		await show();
		await choose('Shape');
		expect(row('radius')?.querySelector('button')?.getAttribute('aria-label')).toBe('Change Radius base');
	});

	it('says a step of a family roles point at is used by none, when none points at it', async () => {
		await show();
		await press(row('tone.pineGreen.20')?.querySelector('button') as HTMLElement);
		await settle();
		// primaryBorder points at pineGreen 20; red is a family no role points into, so it says nothing.
		expect(document.querySelector('[data-token-editor="tone.pineGreen.20"] [data-reach]')?.textContent).toBe('Used by 1 role');
		await press(row('tone.red.40')?.querySelector('button') as HTMLElement);
		await settle();
		expect(document.querySelector('[data-token-editor="tone.red.40"] [data-reach]')).toBeNull();
	});
});

describe('saving and proposing a change (T4, T5)', () => {
	const BRANCH = { branch: 'dsnr/tokens-20261009-ab12', saves: 1, saved: [{ path: 'tone.pineGreen.50', value: '#000000' }], pullRequest: null };
	const branchShown = () => document.querySelector<HTMLElement>('[data-token-branch]');
	const changedList = () => document.querySelector<HTMLElement>('[data-changed-tokens]');
	const changeTone = async () => {
		await press(row('tone.pineGreen.50')?.querySelector('button') as HTMLElement);
		await settle();
		const picker = document.querySelector('[data-token-editor="tone.pineGreen.50"] input[type="color"]') as HTMLInputElement;
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(picker, '#000000');
			picker.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await settle();
	};

	it('offers to save a change to a branch, and only Save until it is saved', async () => {
		await show(TOKENS, true, { saveTokens: async () => ok(BRANCH) });
		await changeTone();
		expect([...(branchShown()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Save to a branch']);
		await press(button('Save to a branch'));
		await settle();
		expect(app.calls.saveTokens).toEqual([[[{ path: 'tone.pineGreen.50', value: '#000000' }]]]);
		expect(branchShown()?.textContent).toContain('dsnr/tokens-20261009-ab12');
		expect(branchShown()?.textContent).toContain('1 save');
		// Saved, so it can be proposed; nothing new to save.
		expect([...(branchShown()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Propose', 'Start over']);
	});

	it('offers Save again, not Propose, once the change is not the one saved', async () => {
		await show(TOKENS, true, { saveTokens: async () => ok(BRANCH) });
		await changeTone();
		await press(button('Save to a branch'));
		await settle();
		await press(button('Reset Tones pineGreen 50'));
		await settle();
		expect([...(branchShown()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Save', 'Start over']);
		// With nothing changed the branch is still there, to save back to the library's values, propose, or leave.
		expect(changedList()?.textContent).toContain('Every token is as the library has it.');
	});

	it('proposes it as a draft pull request, linked, and links Chromatic’s build once the library’s CI has made one', async () => {
		const proposed = { ...BRANCH, pullRequest: { number: 42, url: 'https://github.com/acme/ui/pull/42', chromatic: null } };
		await show(TOKENS, true, { saveTokens: async () => ok(BRANCH), proposeTokens: async () => ok(proposed) });
		await changeTone();
		await press(button('Save to a branch'));
		await settle();
		await press(button('Propose'));
		await settle();
		expect(app.calls.proposeTokens).toHaveLength(1);
		const link = [...(branchShown()?.querySelectorAll('a') ?? [])].find((a) => a.textContent === 'Draft pull request #42') as HTMLAnchorElement;
		expect(link.getAttribute('href')).toBe('https://github.com/acme/ui/pull/42');
		expect(link.getAttribute('target')).toBe('_blank');
		expect(branchShown()?.textContent).toContain('Chromatic’s build is linked here once the library’s CI has made it.');
		expect([...(branchShown()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Start over']);
	});

	it('says why a save did not work, and keeps the change', async () => {
		await show(TOKENS, true, { saveTokens: async () => fail('Author identity unknown') });
		await changeTone();
		await press(button('Save to a branch'));
		await settle();
		expect(branchShown()?.querySelector('[role="alert"]')?.textContent).toBe('Author identity unknown');
		expect(made.at(-1)).toEqual([{ path: 'tone.pineGreen.50', value: '#000000' }]);
	});

	it('puts back the change last saved when the panel opens with none, as after the app was closed', async () => {
		await show(TOKENS, true, { tokenBranch: async () => ok(BRANCH) });
		await settle();
		expect(made.at(-1)).toEqual(BRANCH.saved);
		expect(branchShown()?.textContent).toContain('dsnr/tokens-20261009-ab12');
	});

	it('does not start over when the branch could not be forgotten, and says why: it would only come back', async () => {
		await show(TOKENS, true, { tokenBranch: async () => ok(BRANCH), forgetTokenBranch: async () => fail('The disk is full') });
		await settle();
		await press(button('Start over'));
		await settle();
		expect(branchShown()?.textContent).toContain('dsnr/tokens-20261009-ab12');
		expect(branchShown()?.querySelector('[role="alert"]')?.textContent).toBe('The disk is full');
		expect(made.at(-1)).toEqual(BRANCH.saved);
	});

	it('starts over: forgets the branch and empties the change, leaving the branch and its pull request where they are', async () => {
		await show(TOKENS, true, { tokenBranch: async () => ok(BRANCH), forgetTokenBranch: async () => ok(null) });
		await settle();
		await press(button('Start over'));
		await settle();
		expect(app.calls.forgetTokenBranch).toHaveLength(1);
		expect(made.at(-1)).toEqual([]);
		expect(changedList()).toBeNull();
	});
});
