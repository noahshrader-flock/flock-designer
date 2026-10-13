// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DesignTokens, TokenEdit } from '../src/shared/contract';
import { undeclared } from '../src/shared/wcag';
import { color, TokensHarness } from './tokensHarness';
import { button, chooseTab, fakeApp, openMenu, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * The Color tab as semantic roles by theme, with the palette behind them (the Color tokens plan): what roles there are, how
 * they differ between themes, what they point at; and, from each theme's value on its own, its source, what it references,
 * the scale it is chosen from, what it resolves to, and its contrast. Against fixtures of how libraries keep their colors.
 */

/** FUI's way: tone families, and roles in Light and Dark pointing into them, some with an opacity, one with a literal color. */
const THEMED: DesignTokens = {
	source: 'theme files',
	looked: [],
	problems: [],
	tokens: [
		color('tone.pine.90', 'Tones', 'pine', '90', '#C7E7DD'),
		color('tone.pine.50', 'Tones', 'pine', '50', '#108062'),
		color('tone.pine.20', 'Tones', 'pine', '20', '#18372F'),
		color('tone.red.40', 'Tones', 'red', '40', '#BA1A1A'),
		color('tone.red.20', 'Tones', 'red', '20', '#5C0D0D'),
		color('palette.light.primary.main', 'Light', 'primary', 'main', '#108062', { ref: { path: 'tone.pine.50' } }),
		color('palette.light.primary.contrastText', 'Light', 'primary', 'contrastText', '#FFFFFF'),
		color('palette.light.primaryBorder.main', 'Light', 'primaryBorder', 'main', '#18372F66', { ref: { path: 'tone.pine.20', alpha: '66' } }),
		color('palette.light.divider.main', 'Light', 'divider', 'main', '#CCCCCC'),
		color('palette.dark.primary.main', 'Dark', 'primary', 'main', '#18372F', { ref: { path: 'tone.pine.20' } }),
		color('palette.dark.primary.contrastText', 'Dark', 'primary', 'contrastText', '#FFFFFF'),
	],
};

let current: Awaited<ReturnType<typeof render>> | null = null;
let made: TokenEdit[][] = [];
const show = async (tokens: DesignTokens = THEMED) => {
	made = [];
	(window as unknown as { workspace: unknown }).workspace = fakeApp().api;
	current = await render(
		createElement(TokensHarness, {
			tokens,
			live: true,
			accessibility: undeclared('Acme has no .dsnr/manifest.md'),
			onEdits: (e) => void made.push(e),
		}),
	);
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const view = () => document.querySelector<HTMLElement>('[aria-label="Color view"]');
const views = () => [...(view()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
const cell = (path: string) => document.querySelector<HTMLElement>(`[data-token="${path}"]`);
const cells = () => [...document.querySelectorAll<HTMLElement>('[data-token]')].map((c) => c.getAttribute('data-token'));
const groups = () => [...document.querySelectorAll<HTMLElement>('[data-token-group] [data-name]')].map((n) => n.textContent);
const themes = () => [...document.querySelectorAll('[data-theme-heading]')].map((h) => h.textContent);
const search = () => document.querySelector<HTMLInputElement>('input[aria-label="Search color"]') as HTMLInputElement;
const text = () => document.body.textContent ?? '';
/** What a value says to assistive technology, and in its tooltip: what it points at (`pine 50`), or its hex when it points at nothing. */
const reads = (path: string) => cell(path)?.querySelector('button')?.getAttribute('aria-description');
/** Opens one theme's value, as a press on it does, and returns what opens. */
const open = async (path: string) => {
	await press(cell(path)?.querySelector('button') as HTMLElement);
	await settle();
	return document.querySelector<HTMLElement>(`[data-token-editor="${path}"]`) as HTMLElement;
};

describe('the two views of Color', () => {
	it('start on Semantic, with the palette a press away', async () => {
		await show();
		expect(views().map((v) => [v.textContent, v.getAttribute('aria-checked')])).toEqual([
			['Semantic', 'true'],
			['Palette', 'false'],
		]);
		expect(cells()).not.toContain('tone.pine.50');
	});

	it('show the palette, organized by its families, when Palette is chosen, and the roles again when Semantic is', async () => {
		await show();
		await press(views()[1] as HTMLElement);
		await settle();
		expect(views()[1]?.getAttribute('aria-checked')).toBe('true');
		expect(cells()).toEqual(['tone.pine.90', 'tone.pine.50', 'tone.pine.20', 'tone.red.40', 'tone.red.20']);
		expect([...document.querySelectorAll('[data-set-name]')].map((n) => n.textContent)).toEqual(['pine', 'red']);
		await press(views()[0] as HTMLElement);
		await settle();
		expect(cells()).not.toContain('tone.pine.50');
	});

	it('are only one, with no choice to make, when the library has roles and no palette, or a palette and no roles', async () => {
		await show({ ...THEMED, tokens: THEMED.tokens.filter((t) => t.group !== 'Tones' && !t.ref) });
		expect(view()).toBeNull();
		expect(cells()).toContain('palette.light.primary.contrastText');
		await unmountAll(current!.root);
		await show({ ...THEMED, tokens: THEMED.tokens.filter((t) => t.group === 'Tones') });
		expect(view()).toBeNull();
		expect(cells()).toContain('tone.pine.50');
	});

	it('start at their top: what was scrolled to in one view is somewhere else in the other', async () => {
		await show();
		const scroller = document.querySelector<HTMLElement>('[data-slot="tabs-content"]') as HTMLElement;
		scroller.scrollTop = 120;
		expect(scroller.scrollTop).toBe(120);
		await press(views()[1] as HTMLElement);
		await settle();
		expect(scroller.scrollTop).toBe(0);
	});

	it('keep what was typed in the search when the view is changed back, and each view its own results', async () => {
		await show();
		await typeInto(search(), 'primary');
		await settle();
		expect(search().value).toBe('primary');
		await press(views()[1] as HTMLElement);
		await settle();
		expect(search().value).toBe('primary');
	});
});

describe('the roles by theme', () => {
	it('are in groups by their role, each with its variants as rows, in the order the library has them', async () => {
		await show();
		expect(groups()).toEqual(['primary', 'primaryBorder', 'divider']);
		expect([...document.querySelectorAll('[data-token-row]')].map((r) => r.getAttribute('data-token-row'))).toEqual([
			'main',
			'contrastText',
			'main',
			'main',
		]);
	});

	it('have a column for each theme, headed by its name, and each value in its own, aligned by name', async () => {
		await show();
		expect(themes()).toEqual(['Light', 'Dark']);
		const primary = document.querySelector('[data-token-row="main"]') as HTMLElement;
		expect([...primary.querySelectorAll('[data-token]')].map((c) => c.getAttribute('data-token'))).toEqual([
			'palette.light.primary.main',
			'palette.dark.primary.main',
		]);
	});

	it('are small square swatches in a small icon button, with no words on them', async () => {
		await show();
		const light = cell('palette.light.primary.main') as HTMLElement;
		const swatch = light.querySelector<HTMLElement>('[data-swatch]') as HTMLElement;
		expect(swatch.style.backgroundColor).toBe('rgb(16, 128, 98)');
		// A block, or its size would be ignored inside a plain button (which jsdom, with no layout, cannot show).
		expect(swatch.className.split(' ')).toEqual(expect.arrayContaining(['size-5', 'block']));
		// A border keeps a light color visible on the panel's own background.
		expect(swatch.className.split(' ')).toContain('border');
		expect(light.textContent).toBe('');
		// Square by having one size, in the app's small icon button, which is square too.
		const trigger = light.querySelector('button') as HTMLElement;
		expect([trigger.getAttribute('data-variant'), trigger.getAttribute('data-size')]).toEqual(['ghost', 'icon-sm']);
		expect(swatch.className).not.toMatch(/\b[hw]-\d/);
	});

	it('give the room to the names: the themes are columns only as wide as a swatch, together at the right', async () => {
		await show();
		const row = document.querySelector('[data-token-row="main"]') as HTMLElement;
		const [name, ...themesCells] = [...row.children] as HTMLElement[];
		// The name takes what is left; each theme's column is a fixed width that does not grow with the panel.
		expect(name!.className.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-w-0']));
		for (const c of themesCells) {
			expect(c.className).toMatch(/\bw-\d+\b/);
			expect(c.className).toContain('shrink-0');
			expect(c.className).not.toContain('flex-1');
		}
		// The headings take the same widths, so they stay over their columns.
		const heads = [...document.querySelectorAll<HTMLElement>('[data-theme-heading]')];
		expect(heads.map((h) => h.className.match(/\bw-\d+\b/)?.[0])).toEqual(themesCells.map((c) => c.className.match(/\bw-\d+\b/)?.[0]));
	});

	it('are centered under their theme’s heading', async () => {
		await show();
		expect(cell('palette.light.primary.main')?.className).toContain('justify-center');
		expect(document.querySelector('[data-theme-heading]')?.className).toContain('text-center');
	});

	it('say what each points at to assistive technology, with its opacity, and not its hex', async () => {
		await show();
		expect(reads('palette.light.primary.main')).toBe('pine 50');
		expect(reads('palette.light.primaryBorder.main')).toBe('pine 20 at 40%');
	});

	it('say what a value points at, and only that, in a tooltip on keyboard focus, as on hover', async () => {
		await show();
		await act(async () => void (cell('palette.light.primary.main')?.querySelector('button') as HTMLElement).focus());
		await settle();
		const tip = [...document.querySelectorAll('[role="tooltip"]')].map((t) => t.textContent);
		expect(tip).toEqual(['pine 50']);
	});

	it('say a color that points at nothing as its hex alone, in its tooltip: there is no reference to say', async () => {
		await show();
		expect(reads('palette.light.divider.main')).toBe('#CCCCCC');
		await act(async () => void (cell('palette.light.divider.main')?.querySelector('button') as HTMLElement).focus());
		await settle();
		expect([...document.querySelectorAll('[role="tooltip"]')].map((t) => t.textContent)).toEqual(['#CCCCCC']);
	});

	it('leave a dash where a theme has no such color, which is not pressed', async () => {
		await show();
		const row = document.querySelector('[data-token-row="main"]:has([data-token="palette.light.primaryBorder.main"])') as HTMLElement;
		expect(row.textContent).toContain('—');
		expect(row.querySelectorAll('button')).toHaveLength(1);
	});

	it('are a plain list, with no heading over each, when a role’s name is its set', async () => {
		await show({
			...THEMED,
			tokens: [
				color('css.light.background', 'Light', 'background', 'background', '#FFFFFF'),
				color('css.dark.background', 'Dark', 'background', 'background', '#000000'),
				color('css.light.border', 'Light', 'border', 'border', '#EEEEEE'),
			],
		});
		expect(groups()).toEqual([]);
		expect([...document.querySelectorAll('[data-token-row]')].map((r) => r.getAttribute('data-token-row'))).toEqual(['background', 'border']);
		expect(reads('css.dark.background')).toBe('#000000');
	});

	it('have as many columns as the library has themes', async () => {
		await show({ ...THEMED, tokens: [...THEMED.tokens, color('palette.contrast.primary.main', 'Contrast', 'primary', 'main', '#000000')] });
		expect(themes()).toEqual(['Light', 'Dark', 'Contrast']);
		expect(reads('palette.contrast.primary.main')).toBe('#000000');
	});

	it('close and open by role, each on its own, and keep every value reachable while open', async () => {
		await show();
		const trigger = [...document.querySelectorAll<HTMLElement>('[data-token-group] h3 button')].find((b) =>
			b.textContent?.startsWith('primary'),
		) as HTMLElement;
		await press(trigger);
		await settle();
		expect(cells()).not.toContain('palette.light.primary.main');
		expect(cells()).toContain('palette.light.divider.main');
	});

	it('are searched by the row: a match in one theme keeps the role’s value in the others', async () => {
		await show();
		await typeInto(search(), '#ba1a1a');
		await settle();
		expect(text()).toContain('No token matches');
		await typeInto(search(), 'pine 20');
		await settle();
		expect(cells()).toEqual(['palette.light.primary.main', 'palette.dark.primary.main', 'palette.light.primaryBorder.main']);
	});
});

describe('one theme’s value', () => {
	it('is the only thing on a row that opens anything: the row, and its name, are not pressed', async () => {
		await show();
		const row = document.querySelector('[data-token-row="main"]') as HTMLElement;
		expect(row.tagName).toBe('LI');
		expect([...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
			'Change Light primary main',
			'Change Dark primary main',
		]);
	});

	it('opens that theme’s own token: Light · primary.main, and Dark · primary.main for the other', async () => {
		await show();
		const light = await open('palette.light.primary.main');
		expect(light.querySelector('[data-token-title]')?.textContent).toBe('Light · primary.main');
		expect(light.textContent).toContain('src/colors/theme/light.ts:3');
		await act(async () => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
		await settle();
		const dark = await open('palette.dark.primary.main');
		expect(dark.querySelector('[data-token-title]')?.textContent).toBe('Dark · primary.main');
		expect(dark.textContent).toContain('src/colors/theme/dark.ts:3');
	});

	it('says what it references, as the role pointing at its palette step', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		const reference = editor.querySelector('[data-reference]') as HTMLElement;
		expect([...reference.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['primary.main', 'pine 50']);
		expect(reference.querySelector('svg')).not.toBeNull();
	});

	it('shows the scale of the family it points into, the step it points at chosen', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		const steps = [...editor.querySelectorAll<HTMLElement>('[aria-label="Steps of pine"] button')];
		expect(steps.map((s) => s.getAttribute('aria-label'))).toEqual(['pine 90', 'pine 50', 'pine 20']);
		expect(steps.map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
	});

	it('points only that theme at another step: the other theme’s value is as it was', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		await press(editor.querySelector('[aria-label="pine 90"]') as HTMLElement);
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'palette.light.primary.main', ref: 'tone.pine.90' }]);
		expect(reads('palette.light.primary.main')).toBe('pine 90');
		expect(reads('palette.dark.primary.main')).toBe('pine 20');
		expect(cell('palette.light.primary.main')?.hasAttribute('data-changed')).toBe(true);
		expect(cell('palette.dark.primary.main')?.hasAttribute('data-changed')).toBe(false);
	});

	it('lets another family be chosen, and a step of it, from the families the library has', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		await openMenu(button('Color family: pine', editor));
		const choices = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(choices.map((c) => c.textContent)).toEqual(['pine', 'red']);
		await press(choices[1] as HTMLElement);
		await settle();
		expect([...editor.querySelectorAll('[aria-label="Steps of red"] button')].map((s) => s.getAttribute('aria-label'))).toEqual(['red 40', 'red 20']);
		// Nothing changes until a step is chosen.
		expect(made).toEqual([]);
		await press(editor.querySelector('[aria-label="red 40"]') as HTMLElement);
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'palette.light.primary.main', ref: 'tone.red.40' }]);
		expect(reads('palette.light.primary.main')).toBe('red 40');
	});

	it('says what it resolves to, with a way to copy it', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void (copied = t) }, configurable: true });
		let copied = '';
		await show();
		const editor = await open('palette.light.primary.main');
		const resolved = editor.querySelector('[data-resolved]') as HTMLElement;
		expect(resolved.textContent).toContain('pine 50');
		expect(resolved.textContent).toContain('#108062');
		await press(button('Copy #108062', resolved));
		await settle();
		expect(copied).toBe('#108062');
	});

	it('says where to read the value when the clipboard refuses it', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('denied')) }, configurable: true });
		await show();
		const resolved = (await open('palette.light.primary.main')).querySelector('[data-resolved]') as HTMLElement;
		await press(button('Copy #108062', resolved));
		await settle();
		expect(resolved.textContent).toContain('Could not copy to the clipboard. Select the value to copy it.');
		expect(resolved.textContent).toContain('#108062');
	});

	it('says the contrast it leaves with the color it is read with, and whether that is enough', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		expect(editor.textContent).toContain('Contrast with contrastText');
		expect(editor.querySelector('[data-contrast]')?.getAttribute('data-contrast')).toBe('4.8');
	});

	it('has only a hex for a color that points at nothing: there is no scale to choose from', async () => {
		await show();
		const editor = await open('palette.light.divider.main');
		expect(editor.querySelector('[aria-label^="Steps of"]')).toBeNull();
		expect(editor.querySelector('[data-reference]')).toBeNull();
		const hex = editor.querySelector<HTMLInputElement>('input[aria-label="Hex"]') as HTMLInputElement;
		await typeInto(hex, '#DDDDDD');
		await act(async () => void hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'palette.light.divider.main', value: '#DDDDDD' }]);
	});

	it('does not repeat itself: no section to pick a different color, since choosing a step is that', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		expect(editor.textContent).not.toContain('Use a different color');
	});
});

describe('the palette behind the roles', () => {
	it('changes a step, and every role that points at it follows, in each theme', async () => {
		await show();
		await press(views()[1] as HTMLElement);
		await settle();
		await press(cell('tone.pine.20')?.querySelector('button') as HTMLElement);
		await settle();
		const hex = document.querySelector<HTMLInputElement>('[data-token-editor="tone.pine.20"] input[aria-label="Hex"]') as HTMLInputElement;
		await typeInto(hex, '#000000');
		await act(async () => void hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'tone.pine.20', value: '#000000' }]);
		await press(views()[0] as HTMLElement);
		await settle();
		const dark = cell('palette.dark.primary.main') as HTMLElement;
		expect(dark.querySelector<HTMLElement>('[data-swatch]')?.style.backgroundColor).toBe('rgb(0, 0, 0)');
		expect(reads('palette.dark.primary.main')).toBe('pine 20');
	});

	it('is not touched by a role pointed elsewhere', async () => {
		await show();
		const editor = await open('palette.light.primary.main');
		await press(editor.querySelector('[aria-label="pine 90"]') as HTMLElement);
		await settle();
		expect(made.at(-1)).toHaveLength(1);
		expect(made.at(-1)?.[0]?.path).toBe('palette.light.primary.main');
	});
});

describe('the other categories', () => {
	it('have no views of their own: Spacing is its sets, as it was', async () => {
		await show({
			...THEMED,
			tokens: [
				...THEMED.tokens,
				{
					path: 'spacing',
					kind: 'dimension',
					category: 'Spacing',
					group: 'Spacing',
					set: 'spacing',
					name: 'base',
					value: '8px',
					source: { file: 'src/utils/theme.ts', line: 2 },
				},
			],
		});
		await chooseTab('Spacing');
		await settle();
		expect(view()).toBeNull();
		expect(cell('spacing')?.textContent).toContain('8px');
	});
});
