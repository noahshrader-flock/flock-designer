// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Primitives } from '../src/renderer/Primitives';
import type { Catalog, DesignToken, DesignTokens, TokenEdit } from '../src/shared/contract';
import { specimenAddress } from '../src/shared/catalog';
import { typeSpecimens } from '../src/shared/specimens';
import { TOKEN_PROBLEM } from './fixtures';
import { fakeApp, ok, render, settle, unmountAll } from './reviewHarness';

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
	token({
		path: 'palette.light.primary.main',
		category: 'Color',
		group: 'Light',
		set: 'primary',
		name: 'main',
		value: '#108062',
		ref: { path: 'tone.pineGreen.50' },
	}),
	token({ path: 'palette.light.primary.contrastText', category: 'Color', group: 'Light', set: 'primary', name: 'contrastText', value: '#FFFFFF' }),
	token({ path: 'palette.dark.primary.main', category: 'Color', group: 'Dark', set: 'primary', name: 'main', value: '#C7E7DD' }),
	token({ path: 'spacing', category: 'Spacing', group: 'Spacing', set: 'spacing', name: 'base', value: '8px' }),
	token({ path: 'radius', category: 'Shape', group: 'Radius', set: 'radius', name: 'base', value: '0.5rem' }),
];
const tokens = (list = TOKENS, more: Partial<DesignTokens> = {}): DesignTokens => ({
	source: 'theme files',
	tokens: list,
	problems: [],
	looked: ['theme files', 'CSS variables', 'design token files'],
	...more,
});
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

/** Typography, all four parts: a design system that defines every primitive DSNR can read. */
const font = (group: string, set: string, name: string, value: string) =>
	token({ path: `typography.${set}.${name}`, kind: 'font', category: 'Typography', group, set, name, value });
const FAMILY = font('Family', 'base', 'fontFamily', '"Inter",sans-serif');
const TYPE = [
	FAMILY,
	font('Size', 'h1', 'fontSize', '6rem'),
	font('Weight', 'h1', 'fontWeight', '300'),
	font('Line height', 'h1', 'lineHeight', '1.167'),
];
const BASE = 'http://127.0.0.1:1/previews/abc/';
const MORE = [
	token({ path: 'border.thin', category: 'Borders', group: 'Borders', set: 'border', name: 'thin', value: '1px' }),
	token({ path: 'breakpoints.md', category: 'Breakpoints', group: 'Breakpoints', set: 'breakpoints', name: 'md', value: '900px' }),
	token({ path: 'motion.fast', kind: 'duration', category: 'Motion', group: 'Duration', set: 'motion', name: 'fast', value: '150ms' }),
	token({ path: 'motion.out', kind: 'easing', category: 'Motion', group: 'Easing', set: 'motion', name: 'out', value: 'cubic-bezier(0, 0, 0.2, 1)' }),
];
const ELEVATION = [
	token({
		path: 'shadows.1',
		kind: 'shadow',
		category: 'Elevation',
		group: 'Shadows',
		set: 'shadows',
		name: '1',
		value: '0px 1px 3px rgba(0, 0, 0, 0.2)',
	}),
];

let current: Awaited<ReturnType<typeof render>> | null = null;
let app: ReturnType<typeof fakeApp>;
const show = async (
	catalog: Catalog | null = ready(),
	edits: TokenEdit[] = [],
	{ hidden = false, preview = ok({ state: 'ready', base: BASE }) as unknown } = {},
) => {
	app = fakeApp({ storyPreview: async () => preview });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Primitives, { catalog, edits, hidden }));
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

describe('its heading', () => {
	it('is the page’s title and a line that says what it is for, as the other tabs have, above everything else', async () => {
		await show();
		const heading = document.querySelector('[data-page-heading]') as HTMLElement;
		expect(heading.querySelector('h2')?.textContent).toBe('Primitives');
		expect(heading.querySelector('p')?.textContent).toBe('The basics: color, type, spacing, shape and more.');
		expect(heading.compareDocumentPosition(document.querySelector('[data-coverage]') as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});

describe('what it defines, at the top', () => {
	it('is a chip for each primitive, in the vocabulary’s order, with how many tokens it has', async () => {
		await show(ready(tokens([...TOKENS, ...TYPE, ...ELEVATION])));
		expect(chips().map((c) => c.textContent)).toEqual([
			'Color 6',
			'Typography 4',
			'Spacing 1',
			'Shape 1',
			'Elevation 1',
			'Borders not defined',
			'Breakpoints not defined',
			'Motion not defined',
		]);
	});

	it('says which parts a primitive made of parts has, when it lacks some: Flock’s typography is a family and nothing else', async () => {
		await show(ready(tokens([...TOKENS, FAMILY])));
		expect(chips()[1]!.textContent).toBe('Typography 1 · family only');
	});

	it('takes you to a primitive’s section when its chip is pressed', async () => {
		const scroll = vi.fn();
		const original = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = scroll;
		try {
			await show();
			await act(async () => void chips()[3]!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
			expect(scroll).toHaveBeenCalledOnce();
			expect(scroll.mock.contexts[0]).toBe(section('Shape'));
		} finally {
			// Put back, so a later test's tab that is focused does not scroll into a stub left here.
			Element.prototype.scrollIntoView = original;
		}
	});

	it('says a primitive is not defined when it has no tokens, as a chip of its own', async () => {
		await show(ready(tokens([...TOKENS.filter((t) => t.category !== 'Shape'), ...TYPE])));
		expect(chips().map((c) => c.textContent)).toEqual([
			'Color 6',
			'Typography 4',
			'Spacing 1',
			'Shape not defined',
			'Elevation not defined',
			'Borders not defined',
			'Breakpoints not defined',
			'Motion not defined',
		]);
		expect(chips()[3]!.getAttribute('data-defined')).toBe('false');
	});
});

describe('each primitive, drawn', () => {
	it('is a section for each, in the vocabulary’s order, and one the vocabulary does not know after them', async () => {
		const other = token({ path: 'size.icon', category: 'Sizing', group: 'Sizing', set: 'size', name: 'icon', value: '24px' });
		// Out of order on purpose, with the one it does not know first: the order is the vocabulary's, not the list's.
		await show(ready(tokens([other, ...TYPE, ...[...TOKENS].reverse()])));
		expect(sections()).toEqual(['Color', 'Typography', 'Spacing', 'Shape', 'Sizing']);
		expect(chips().map((c) => c.textContent)).toEqual([
			'Color 6',
			'Typography 4',
			'Spacing 1',
			'Shape 1',
			'Elevation not defined',
			'Borders not defined',
			'Breakpoints not defined',
			'Motion not defined',
			'Sizing 1',
		]);
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

	it('draws a shadow on a box, as it would raise one, with its name and what it is', async () => {
		await show(ready(tokens([...TOKENS, ...ELEVATION])));
		const box = section('Elevation').querySelector<HTMLElement>('[data-shadow-sample]')!;
		expect(box.style.boxShadow).toBe('0px 1px 3px rgba(0, 0, 0, 0.2)');
		expect(section('Elevation').textContent).toContain('shadows 1');
		expect(section('Elevation').textContent).toContain('0px 1px 3px rgba(0, 0, 0, 0.2)');
	});

	it('says a design system that sets no shadows does not define elevation, as Flock’s does not', async () => {
		await show();
		expect(notDefined()!.textContent).toContain('Elevation');
		expect(chips().map((c) => c.textContent)).toContain('Elevation not defined');
	});

	it('shows borders, breakpoints and motion as plain tables of their names and values, motion’s durations and easings together', async () => {
		await show(ready(tokens([...TOKENS, ...MORE])));
		const rows = (name: string) =>
			[...section(name).querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((d) => d.textContent));
		expect(rows('Borders')).toEqual([['border thin', '1px']]);
		expect(rows('Breakpoints')).toEqual([['breakpoints md', '900px']]);
		expect(rows('Motion')).toEqual([
			['motion fast', '150ms'],
			['motion out', 'cubic-bezier(0, 0, 0.2, 1)'],
		]);
		expect(section('Motion').querySelectorAll('table')).toHaveLength(1);
	});

	it('says which part of motion a design system leaves out, as typography’s', async () => {
		await show(ready(tokens([...TOKENS, MORE[2]!])));
		expect(chips().find((c) => c.textContent?.startsWith('Motion'))!.textContent).toBe('Motion 1 · duration only');
		expect(notDefined()!.textContent).toContain('Motion easing');
	});

	it('shows anything with no drawing of its own as a plain table of its names and values', async () => {
		const other = token({ path: 'size.icon', category: 'Sizing', group: 'Sizing', set: 'size', name: 'icon', value: '24px' });
		await show(ready(tokens([...TOKENS, other])));
		const rows = [...section('Sizing').querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((d) => d.textContent));
		expect(rows).toEqual([['size icon', '24px']]);
	});

	it('changes nothing: there is no control on it, only the picture', async () => {
		await show();
		await unmountAll(current!.root);
		await show(ready(tokens([...TOKENS, ...TYPE])));
		expect(document.querySelectorAll('input, [role="slider"]')).toHaveLength(0);
		expect([...document.querySelectorAll('button')].every((b) => b.hasAttribute('data-primitive-chip'))).toBe(true);
	});
});

describe('typography', () => {
	const typography = () => section('Typography');

	it('is a specimen drawn in the design system’s own preview, so its fonts are its own, and its values under it', async () => {
		await show(ready(tokens([...TOKENS, ...TYPE])));
		const frame = typography().querySelector('iframe')!;
		expect(frame.getAttribute('src')).toBe(specimenAddress(BASE, typeSpecimens(TYPE)));
		expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
		expect(app.calls.storyPreview).toEqual([[[]]]);
		// The values, as written, for reading off: the specimen shows them, this says them.
		const rows = [...typography().querySelectorAll('tbody tr')].map((r) => r.textContent);
		expect(rows).toEqual(['base fontFamily"Inter",sans-serif', 'h1 fontSize6rem', 'h1 fontWeight300', 'h1 lineHeight1.167']);
	});

	it('is one drawing of the whole, not one for each part', async () => {
		await show(ready(tokens([...TOKENS, ...TYPE])));
		expect(typography().querySelectorAll('iframe')).toHaveLength(1);
		expect(typography().querySelectorAll('h3')).toHaveLength(0);
	});

	it('does not ask for the preview while the tab is not shown', async () => {
		await show(ready(tokens([...TOKENS, ...TYPE])), [], { hidden: true });
		expect(app.calls.storyPreview).toBeUndefined();
	});

	it('says why there is no specimen when the preview cannot be built here, and still says the values', async () => {
		await show(ready(tokens([...TOKENS, ...TYPE])), [], { preview: ok({ state: 'no-packages', root: '/h/GitHub/fui' }) });
		expect(typography().querySelector('iframe')).toBeNull();
		expect(typography().textContent).toContain('The specimen is drawn in the design system’s preview, which cannot be built here');
		expect(typography().querySelectorAll('tbody tr')).toHaveLength(4);
	});
});

describe('what it does not define', () => {
	it('is listed after the rest, each with where DSNR looked: in the design system’s own tokens', async () => {
		await show(ready(tokens([...TOKENS.filter((t) => t.category !== 'Shape'), ...TYPE])));
		expect(sections()).toEqual(['Color', 'Typography', 'Spacing']);
		expect(notDefined()!.textContent).toContain('Shape');
		expect(notDefined()!.textContent).toContain('Not defined in its theme files.');
	});

	it('says every primitive is not defined, and every place it looked, when no tokens are found at all', async () => {
		await show(ready(tokens([], { source: null })));
		expect(chips().map((c) => c.textContent)).toEqual([
			'Color not defined',
			'Typography not defined',
			'Spacing not defined',
			'Shape not defined',
			'Elevation not defined',
			'Borders not defined',
			'Breakpoints not defined',
			'Motion not defined',
		]);
		expect(notDefined()!.textContent).toContain('No tokens were found. Looked for theme files, CSS variables and design token files.');
	});

	it('is not there when the design system defines every primitive DSNR can read, and every part of each', async () => {
		await show(ready(tokens([...TOKENS, ...TYPE, ...ELEVATION, ...MORE])));
		expect(notDefined()).toBeNull();
	});

	it('lists the parts a primitive leaves out, as Flock’s typography leaves out a size, a weight and a line height', async () => {
		await show(ready(tokens([...TOKENS, FAMILY])));
		expect(notDefined()!.textContent).toContain('Typography size, weight and line height');
		expect(notDefined()!.textContent).toContain('Not defined in its theme files.');
		expect(sections()).toContain('Typography');
	});
});

describe('with the rest of the tab', () => {
	it('shows the change being tried on the Components tab, and says so', async () => {
		await show(ready(), [{ path: 'tone.pineGreen.50', value: '#000000' }]);
		const swatch = section('Color').querySelector<HTMLElement>('[data-primitive-set="Tones/pineGreen"] [data-swatch]')!;
		expect(swatch.style.backgroundColor).toBe('rgb(0, 0, 0)');
		expect(document.body.textContent).toContain('Showing the change being tried on the Components tab');
	});

	it('does not say what it could not read: the design system’s row does, on every view', async () => {
		await show(ready(tokens(TOKENS, { problems: [TOKEN_PROBLEM] })));
		expect(document.body.textContent).not.toContain('couldn’t be read');
	});

	it('shows the shape of what is coming while the design system is read, and says to connect one when there is none', async () => {
		await show(null);
		expect(document.querySelector('[role="status"]')?.textContent).toContain('Reading the design system');
		await unmountAll(current!.root);
		await show({ state: 'none' } as Catalog);
		expect(document.body.textContent).toContain('Connect a design system on the Components tab to see its primitives.');
	});
});
