// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Primitives } from '../src/renderer/Primitives';
import type { Catalog, DesignToken, DesignTokens, TokenEdit } from '../src/shared/contract';
import { render, settle, unmountAll } from './reviewHarness';

/**
 * The Primitives tab (R2 of the design system plan): the design system seen whole, from the same list the side panel shows.
 * At its top, what it defines and what it does not; then each primitive drawn (the palette, the spacing scale, the radius),
 * a plain table for anything without a drawing of its own, and the primitives it does not define, with where DSNR looked.
 * Nothing on it is changed: it is a picture.
 */

const token = (more: Partial<DesignToken> & Pick<DesignToken, 'path' | 'category' | 'group' | 'set' | 'name' | 'value'>): DesignToken => ({
	kind: more.category === 'Color' ? 'color' : 'dimension',
	source: { file: 'src/theme.ts', line: 1 },
	...more,
});
const TOKENS: DesignToken[] = [
	token({ path: 'tone.pineGreen.50', category: 'Color', group: 'Tones', set: 'pineGreen', name: '50', value: '#108062' }),
	token({ path: 'tone.pineGreen.20', category: 'Color', group: 'Tones', set: 'pineGreen', name: '20', value: '#18372F' }),
	token({ path: 'tone.red.40', category: 'Color', group: 'Tones', set: 'red', name: '40', value: '#BA1A1A' }),
	token({ path: 'palette.light.primary.main', category: 'Color', group: 'Light', set: 'primary', name: 'main', value: '#108062', ref: { path: 'tone.pineGreen.50' } }),
	token({ path: 'palette.light.primary.contrastText', category: 'Color', group: 'Light', set: 'primary', name: 'contrastText', value: '#FFFFFF' }),
	token({ path: 'palette.dark.primary.main', category: 'Color', group: 'Dark', set: 'primary', name: 'main', value: '#C7E7DD' }),
	token({ path: 'spacing', category: 'Spacing', group: 'Spacing', set: 'spacing', name: 'base', value: '8px' }),
	token({ path: 'radius', category: 'Shape', group: 'Radius', set: 'radius', name: 'base', value: '0.5rem' }),
];
const tokens = (list = TOKENS, more: Partial<DesignTokens> = {}): DesignTokens => ({ source: 'theme files', tokens: list, problems: [], looked: ['theme files', 'CSS variables', 'design token files'], ...more });
const ready = (t: DesignTokens = tokens()): Catalog =>
	({
		state: 'ready',
		branch: 'develop',
		commit: 'abc123',
		committedAt: '2026-10-07T00:00:00Z',
		update: 'unchanged',
		components: [],
		tokens: t,
		accessibility: { declared: false, target: { version: '2.2', level: 'AA' }, tags: [], why: '' },
	}) as unknown as Catalog;

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (catalog: Catalog | null = ready(), edits: TokenEdit[] = []) => {
	current = await render(createElement(Primitives, { catalog, edits }));
	await settle();
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

const chips = () => [...document.querySelectorAll<HTMLElement>('[data-coverage] [data-primitive-chip]')];
const sections = () => [...document.querySelectorAll<HTMLElement>('[data-primitive]')].map((s) => s.getAttribute('data-primitive'));
const section = (name: string) => document.querySelector<HTMLElement>(`[data-primitive="${name}"]`)!;
const notDefined = () => document.querySelector<HTMLElement>('[data-not-defined]');

describe('what it defines, at the top', () => {
	it('is a chip for each primitive, in the vocabulary’s order, with how many tokens it has', async () => {
		await show();
		expect(chips().map((c) => c.textContent)).toEqual(['Color 6', 'Spacing 1', 'Shape 1']);
	});

	it('takes you to a primitive’s section when its chip is pressed', async () => {
		const scroll = vi.fn();
		Element.prototype.scrollIntoView = scroll;
		await show();
		await act(async () => void chips()[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(scroll).toHaveBeenCalledOnce();
		expect(scroll.mock.contexts[0]).toBe(section('Shape'));
	});

	it('says a primitive is not defined when it has no tokens, as a chip of its own', async () => {
		await show(ready(tokens(TOKENS.filter((t) => t.category !== 'Shape'))));
		expect(chips().map((c) => c.textContent)).toEqual(['Color 6', 'Spacing 1', 'Shape not defined']);
		expect(chips()[2]!.getAttribute('data-defined')).toBe('false');
	});
});

describe('each primitive, drawn', () => {
	it('is a section for each, in the vocabulary’s order, and one the vocabulary does not know after them', async () => {
		const other = token({ path: 'size.icon', category: 'Sizing', group: 'Sizing', set: 'size', name: 'icon', value: '24px' });
		// Out of order on purpose, with the one it does not know first: the order is the vocabulary's, not the list's.
		await show(ready(tokens([other, ...[...TOKENS].reverse()])));
		expect(sections()).toEqual(['Color', 'Spacing', 'Shape', 'Sizing']);
		expect(chips().map((c) => c.textContent)).toEqual(['Color 6', 'Spacing 1', 'Shape 1', 'Sizing 1']);
	});

	it('draws the palette as each set in a row of swatches: a tone family’s steps, a role’s variants', async () => {
		await show();
		const color = section('Color');
		expect([...color.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Tones', 'Light', 'Dark']);
		const pineGreen = color.querySelector<HTMLElement>('[data-primitive-set="Tones/pineGreen"]')!;
		expect([...pineGreen.querySelectorAll('[data-swatch-label]')].map((l) => l.textContent)).toEqual(['50', '20']);
		expect((pineGreen.querySelector('[data-swatch]') as HTMLElement).style.backgroundColor).toBe('rgb(16, 128, 98)');
	});

	it('says what a role points at under its swatch, and its value otherwise', async () => {
		await show();
		const primary = section('Color').querySelector<HTMLElement>('[data-primitive-set="Light/primary"]')!;
		const [main, contrast] = [...primary.querySelectorAll<HTMLElement>('[data-primitive-token]')];
		expect(main!.textContent).toContain('pineGreen 50');
		expect(contrast!.textContent).toContain('#FFFFFF');
	});

	it('draws spacing as bars as long as each step, and a radius as a corner of its size', async () => {
		await show();
		const bar = section('Spacing').querySelector<HTMLElement>('[data-spacing-bar]')!;
		expect(bar.style.width).toBe('8px');
		expect(section('Spacing').textContent).toContain('8px');
		const corner = section('Shape').querySelector<HTMLElement>('[data-radius-sample]')!;
		// In pixels, as drawn: half a rem is 8.
		expect(corner.style.borderRadius).toBe('8px');
		expect(section('Shape').textContent).toContain('0.5rem');
	});

	it('shows anything with no drawing of its own as a plain table of its names and values', async () => {
		const other = token({ path: 'size.icon', category: 'Sizing', group: 'Sizing', set: 'size', name: 'icon', value: '24px' });
		await show(ready(tokens([...TOKENS, other])));
		const rows = [...section('Sizing').querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((d) => d.textContent));
		expect(rows).toEqual([['size icon', '24px']]);
	});

	it('changes nothing: there is no control on it, only the picture', async () => {
		await show();
		expect(document.querySelectorAll('input, [role="slider"]')).toHaveLength(0);
		expect([...document.querySelectorAll('button')].every((b) => b.hasAttribute('data-primitive-chip'))).toBe(true);
	});
});

describe('what it does not define', () => {
	it('is listed after the rest, each with where DSNR looked: in the design system’s own tokens', async () => {
		await show(ready(tokens(TOKENS.filter((t) => t.category !== 'Shape'))));
		expect(sections()).toEqual(['Color', 'Spacing']);
		expect(notDefined()!.textContent).toContain('Shape');
		expect(notDefined()!.textContent).toContain('Not defined in its theme files.');
	});

	it('says every primitive is not defined, and every place it looked, when no tokens are found at all', async () => {
		await show(ready(tokens([], { source: null })));
		expect(chips().map((c) => c.textContent)).toEqual(['Color not defined', 'Spacing not defined', 'Shape not defined']);
		expect(notDefined()!.textContent).toContain('No tokens were found. Looked for theme files, CSS variables and design token files.');
	});

	it('is not there when the design system defines every primitive DSNR can read', async () => {
		await show();
		expect(notDefined()).toBeNull();
	});
});

describe('with the rest of the tab', () => {
	it('shows the change being tried on the Components tab, and says so', async () => {
		await show(ready(), [{ path: 'tone.pineGreen.50', value: '#000000' }]);
		const swatch = section('Color').querySelector<HTMLElement>('[data-primitive-set="Tones/pineGreen"] [data-swatch]')!;
		expect(swatch.style.backgroundColor).toBe('rgb(0, 0, 0)');
		expect(document.body.textContent).toContain('Showing the change being tried on the Components tab');
	});

	it('says what it could not read, as the side panel does', async () => {
		await show(ready(tokens(TOKENS, { problems: [{ file: 'src/colors/tones/neutral.ts', line: 10, reason: 'not a literal' }] })));
		expect(document.body.textContent).toContain('1 value couldn’t be read');
	});

	it('shows the shape of what is coming while the design system is read, and says to connect one when there is none', async () => {
		await show(null);
		expect(document.querySelector('[role="status"]')?.textContent).toContain('Reading the design system');
		await unmountAll(current!.root);
		await show({ state: 'none' } as Catalog);
		expect(document.body.textContent).toContain('Connect a design system on the Components tab to see its primitives.');
	});
});
