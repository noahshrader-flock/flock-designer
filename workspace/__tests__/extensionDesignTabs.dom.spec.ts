import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentTab } from '../extension/webview/ComponentTab';
import { PrimitivesTab } from '../extension/webview/PrimitivesTab';
import { readTab } from '../extension/webview/tab';
import { PREVIEW_HEIGHT, PREVIEW_TRY, previewAddress } from '../src/shared/catalog';
import { SAMPLE_CATALOG } from './extensionSamples';
import { answer, button, calls, mount, press, say, sent, type } from './webviewHarness';
import { ASK_EVERY_MS } from '../src/renderer/askWhile';

/**
 * The design system's tabs in the editor (ELECTRON_MIGRATION_PLAN 6.1): a component's, its stories live and what it is
 * made from, and Primitives, the design system drawn whole. Each reads the design system shown through the bridge, as the
 * panel does, and is told the change being tried by the extension.
 */

const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
const BASE = 'http://127.0.0.1:4321/previews-abc/';

describe('which tab a page is', () => {
	it('is read from its body as the extension wrote it, and anything else is the panel', () => {
		expect(readTab(JSON.stringify({ kind: 'component', id: BUTTON, name: 'FSButton' }))).toEqual({ kind: 'component', id: BUTTON, name: 'FSButton' });
		expect(readTab('{"kind":"primitives"}')).toEqual({ kind: 'primitives' });
		expect(readTab(undefined)).toBeNull();
		expect(readTab('{"kind":"component"}')).toBeNull();
		expect(readTab('not json')).toBeNull();
	});
});

describe('a component’s tab', () => {
	const open = async () => {
		await mount(createElement(ComponentTab, { id: BUTTON }));
		await answer('designSystemCatalog', SAMPLE_CATALOG);
	};

	it('says it is ready, reads the design system shown, and is titled for its component, with its links', async () => {
		await open();
		expect(sent[0]).toEqual({ type: 'ready' });
		expect(calls('designSystemCatalog')[0]?.args).toEqual([false]);
		expect(document.querySelector('.tab-title')?.textContent).toBe('FSButton');
		await press(button('Storybook'));
		expect(sent.at(-1)).toEqual({ type: 'component-link', id: BUTTON, link: 'storybook' });
		await press(button('GitHub'));
		expect(sent.at(-1)).toEqual({ type: 'component-link', id: BUTTON, link: 'source' });
	});

	it('marks its links as going out of VS Code: the external link icon after each one’s words, not read aloud', async () => {
		await open();
		for (const name of ['Storybook', 'GitHub']) {
			const link = button(name);
			const icon = link.lastElementChild as HTMLElement;
			expect(icon.classList.contains('codicon-link-external')).toBe(true);
			expect(icon.getAttribute('aria-hidden')).toBe('true');
			expect(link.firstElementChild?.textContent).toBe(name);
		}
	});

	it('keeps its name, description and links apart from what scrolls: the stories and the analysis are panes of their own under it', async () => {
		await open();
		const page = document.querySelector('main.tab') as HTMLElement;
		expect(page.classList.contains('tab-split')).toBe(true);
		const [header, layout] = [page.querySelector('.tab-header'), page.querySelector('.component-layout')];
		expect(header?.parentElement).toBe(page);
		expect(layout?.parentElement).toBe(page);
		// Two panes, each its own scroll in the stylesheet, and the header outside both.
		expect([...layout!.children].map((c) => c.className)).toEqual(['component-stories', 'component-aside']);
		expect(layout!.contains(header!)).toBe(false);
	});

	it('draws its stories live, from this machine’s server', async () => {
		await open();
		expect(calls('storyPreview')[0]?.args).toEqual([[]]);
		await answer('storyPreview', { state: 'ready', base: BASE });
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		expect(frame.getAttribute('src')).toBe(previewAddress(BASE, BUTTON));
		expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
	});

	it('says the height its stories’ page reports as a variable, which the stylesheet uses, or overrides where the frame fills its pane', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		await say({ [PREVIEW_HEIGHT]: 640 }, { source: frame.contentWindow, origin: 'http://127.0.0.1:4321' });
		expect(frame.style.getPropertyValue('--frame-height')).toBe('640px');
		// Not a height of its own: that would win over the stylesheet's, and the frame could not fill its pane.
		expect(frame.style.height).toBe('');
	});

	it('builds them again with the change the extension says is being tried, keeping the last until it is built', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const edits = [{ path: 'tone.pineGreen.50', value: '#000000' }];
		await say({ type: 'token-edits', edits });
		expect(calls('storyPreview').at(-1)?.args).toEqual([edits]);
		expect(document.querySelector('iframe')).not.toBeNull();
		expect(document.querySelector('.stories-building')?.textContent).toBe('Building…');
		await answer('storyPreview', { state: 'ready', base: 'http://127.0.0.1:4321/trial-1/' });
		expect(document.querySelector('iframe')?.getAttribute('src')).toBe(previewAddress('http://127.0.0.1:4321/trial-1/', BUTTON));
	});

	it('builds nothing again when it is told the change it already has (the extension says every change to every page)', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		await say({ type: 'token-edits', edits: [] });
		expect(calls('storyPreview')).toHaveLength(1);
		const edits = [{ path: 'tone.pineGreen.50', value: '#000000' }];
		await say({ type: 'token-edits', edits });
		await say({ type: 'token-edits', edits: [...edits] });
		expect(calls('storyPreview')).toHaveLength(2);
	});

	it('hears only VS Code, on its own origin: no story it frames, nor any frame inside one, can pass itself off as the extension', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const forged = { type: 'token-edits', edits: [{ path: 'tone.pineGreen.50', value: '#000000' }] };
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		await say(forged, { source: frame.contentWindow, origin: 'http://127.0.0.1:4321' });
		// A frame inside a framed page, with no origin of its own: not the window above, however deep it is.
		const outer = document.body.appendChild(document.createElement('iframe'));
		const inner = outer.contentDocument?.body.appendChild(outer.contentDocument.createElement('iframe'));
		await say(forged, { source: inner?.contentWindow ?? null, origin: 'null' });
		outer.remove();
		expect(calls('storyPreview')).toHaveLength(1);
		// What the extension says is still heard.
		await say(forged);
		expect(calls('storyPreview')).toHaveLength(2);
	});

	it('says why its previews could not be built, with a way to try again', async () => {
		await open();
		await answer('storyPreview', { state: 'no-packages', root: '/work/lib' });
		expect(document.querySelector('.notice')?.textContent).toContain("The design system's packages are not installed in /work/lib.");
		await press(button('Try again'));
		expect(calls('storyPreview')).toHaveLength(2);
	});

	/** What the analysis of FSButton found: the tokens it draws with and how often, the values it sets itself, and what axe found. */
	const STORY = (name: string) => `src/components/${name}/${name}.stories.tsx`;
	/** Each value's instances, by key, as the analysis gives them: one key per instance, named by its row and variant. */
	const targeted = (values: {
		state: string;
		rows?: Record<string, { property: string; by?: string | null; cells: { variant: string | null; instances: number; of?: unknown }[] }[] | null>;
	}) =>
		values.rows === undefined
			? values
			: {
					...values,
					rows: Object.fromEntries(
						Object.entries(values.rows).map(([mode, rows]) => [
							mode,
							rows?.map((row) => ({
								...row,
								// And what each is drawn with, as the reader says it, for a row told apart by one prop: its variant is that prop's value.
								cells: row.cells.map((c) => ({
									...c,
									targets: Array.from({ length: c.instances }, (_, i) => `${row.property}:${c.variant}:${i}`),
									...(c.of === undefined && row.by && !row.by.includes(', ') && c.variant !== null ? { of: [{ [row.by]: c.variant }] } : {}),
								})),
							})) ?? null,
						]),
					),
				};
	const analysis = (over: Record<string, unknown> = {}) =>
		withTargets({
			state: 'ready',
			uses: [
				{ path: 'palette.light.primary.main', uses: 3 },
				{ path: 'palette.dark.primary.main', uses: 2 },
				{ path: 'palette.light.primary.contrastText', uses: 1 },
				{ path: 'radius', uses: 5 },
				{ path: 'spacing', uses: 4 },
			],
			sharedWith: {
				'palette.light.primary.main': [STORY('FSIconButton')],
				radius: [STORY('FSIconButton'), STORY('FSSplitButton')],
			},
			notTokens: [
				{ kind: 'color', value: 'rgb(1, 2, 3)', uses: 2 },
				{ kind: 'spacing', value: '13px', uses: 1 },
			],
			derived: 1,
			accessibility: {
				violations: [
					{
						rule: 'color-contrast',
						help: 'Text needs more contrast',
						url: 'https://axe.example/cc',
						criteria: ['1.4.3'],
						impact: 'serious',
						nodes: 2,
						states: ['default'],
						elements: [
							{
								target: 'button.ghost > span',
								html: '<span>Ghost</span>',
								fix: 'Fix any of the following:\n  Element has insufficient color contrast of 3.1',
								state: 'default',
							},
						],
					},
				],
				incomplete: [
					{
						rule: 'aria-allowed-attr',
						help: 'Check this attribute',
						url: 'https://axe.example/aa',
						criteria: ['4.1.2'],
						impact: 'minor',
						nodes: 1,
						states: ['default'],
						elements: [],
					},
				],
				bestPractice: {
					violations: [
						{
							rule: 'heading-order',
							help: 'Heading levels should only increase by one',
							url: 'https://axe.example/ho',
							criteria: [],
							impact: 'moderate',
							nodes: 1,
							states: ['default'],
							elements: [{ target: 'h4', html: '<h4>', fix: 'Fix any of the following:\n  Heading order invalid', state: 'default' }],
						},
					],
					incomplete: [],
				},
				notAutomated: ['2.4.7'],
				ran: { axe: '4.10', target: 'WCAG 2.2 AA', states: ['default'] },
			},
			values: {
				state: 'read',
				instances: 12,
				unmarked: 0,
				rows: {
					light: [
						{
							property: 'height',
							by: 'size',
							cells: ['sm', 'md', 'lg', 'xl'].map((variant, i) => ({
								variant,
								value: ['28px', '36px', '48px', '56px'][i],
								kind: 'own',
								tokens: [],
								instances: 3,
							})),
						},
						{ property: 'radius', by: null, cells: [{ variant: null, value: '8px', kind: 'token', tokens: ['radius'], instances: 12 }] },
						{
							property: 'background',
							by: 'variant',
							cells: [
								{ variant: 'primary', value: 'rgb(16, 128, 98)', kind: 'token', tokens: ['palette.light.primary.main'], instances: 6 },
								{ variant: 'ghost', value: 'none', kind: 'own', tokens: [], instances: 6 },
							],
						},
						{ property: 'fontSize', by: null, cells: [{ variant: null, value: '16px', kind: 'unchecked', tokens: [], instances: 12 }] },
					],
					// Dark: the same stories, a background that is the Dark token, and a height that does not change with the theme.
					dark: [
						{
							property: 'height',
							by: 'size',
							cells: ['sm', 'md', 'lg', 'xl'].map((variant, i) => ({
								variant,
								value: ['28px', '36px', '48px', '56px'][i],
								kind: 'own',
								tokens: [],
								instances: 3,
							})),
						},
						{
							property: 'background',
							by: 'variant',
							cells: [
								{ variant: 'primary', value: 'rgb(43, 180, 138)', kind: 'token', tokens: ['palette.dark.primary.main'], instances: 6 },
								{ variant: 'ghost', value: 'none', kind: 'own', tokens: [], instances: 6 },
							],
						},
					],
				},
			},
			...over,
		});
	const withTargets = (a: Record<string, unknown>): Record<string, unknown> => ({
		...a,
		values: targeted(a.values as Parameters<typeof targeted>[0]) as unknown,
	});
	const analysed = async (over: Record<string, unknown> = {}) => {
		await open();
		await answer('componentTokens', analysis(over));
	};
	const section = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
	/** Its Changes dialog, opened from the button in its header: what is tried is there, not in the column. */
	const openChanges = async () => {
		if (!document.querySelector('[role="dialog"][aria-label="Changes"]')) await press(document.querySelector('.tab-actions button') as HTMLElement);
	};

	it('reads in three parts: its values, the tokens it draws with (closed), and what is wrong with it', async () => {
		await analysed();
		expect([...document.querySelectorAll('.component-aside > [aria-label]')].map((e) => e.getAttribute('aria-label'))).toEqual([
			'Values',
			'Tokens used',
			'Accessibility',
		]);
		// The sixth, its name and links, is the header above.
		expect(document.querySelector('.tab-title')?.textContent).toBe('FSButton');
	});

	/** Chooses the variant shown with a prop's picker: a value from its dropdown, or its switch pressed. */
	const pick = async (prop: string, value: string) => {
		const select = document.querySelector(`[data-picker="${prop}"] select`) as HTMLSelectElement;
		await act(async () => {
			select.value = value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		});
	};
	const shownIn = (property: string) =>
		[...(section('Values')?.querySelectorAll<HTMLElement>(`[data-value-row="${property}"] [data-value-cell]`) ?? [])].filter(
			(c) => !c.closest('details'),
		);

	it('lays its values out as an inspector: a picker for each prop they are told apart by, then a row a value in its group', async () => {
		await analysed();
		const values = section('Values')!;
		// What the stories drew, on which version, is not said above the values: the rows are the answer.
		expect(values.querySelector('[data-values-from]')).toBeNull();
		// Light until dark is chosen, and chosen in the panel: the tab has no switch of its own.
		expect(values.querySelector('[role="radio"]')).toBeNull();
		expect([...values.querySelectorAll('[data-picker]')].map((p) => p.getAttribute('data-picker'))).toEqual(['size', 'variant']);
		expect([...values.querySelectorAll('[data-picker] label')].map((l) => l.textContent)).toEqual(['Size', 'Variant']);
		expect([...values.querySelectorAll('[data-value-group]')].map((g) => g.getAttribute('data-value-group'))).toEqual([
			'Layout',
			'Typography',
			'Appearance',
			'Fill',
		]);
		expect([...values.querySelectorAll('[data-value-row]')].map((r) => r.getAttribute('data-value-row'))).toEqual([
			'height',
			'fontSize',
			'radius',
			'background',
		]);
		// One value a row, for the variant it opens on (each prop's first drawn): its property's name on the left, its value on the right.
		expect(shownIn('height').map((c) => c.textContent)).toEqual(['Height28px']);
		await pick('size', 'lg');
		expect(shownIn('height').map((c) => c.textContent)).toEqual(['Height48px']);
		// The component's own is the default: nothing is said of it.
		expect(shownIn('height')[0]?.querySelector('[data-value-kind]')).toBeNull();
	});

	it('says which token a value is as a chip after its name, with where else it is used on hover; or nothing, its own or not checked', async () => {
		await analysed();
		const radius = shownIn('radius')[0]?.querySelector('button') as HTMLElement;
		expect(radius.textContent).toBe('RadiusRadius8px');
		expect(radius.querySelector('.value-chip')?.textContent).toBe('Radius');
		expect(radius.title).toContain('Radius · also FSIconButton, FSSplitButton');
		expect(shownIn('background').map((c) => c.textContent)).toEqual(['BackgroundLight primary main#108062']);
		expect(shownIn('background')[0]?.querySelector('button')?.title).toContain('also FSIconButton');
		// A colour that draws nothing is said as none, with no swatch and no chip.
		await pick('variant', 'ghost');
		expect(shownIn('background').map((c) => c.textContent)).toEqual(['Backgroundnone']);
		const size = shownIn('fontSize')[0] as HTMLElement;
		expect(size.textContent).toBe('Font size16px');
		expect(size.querySelector('button')?.title).toContain('Not checked: no token of this kind is marked');
	});

	it('says a value worked out from a token as from one, and a combination its stories never drew as not drawn, with the nearest', async () => {
		const rows = (analysis().values as { rows: { light: unknown[] } }).rows.light;
		const mixed = {
			property: 'text',
			by: 'variant',
			cells: [
				{ variant: 'primary', value: 'rgb(255, 255, 255)', kind: 'token', tokens: ['palette.light.primary.main'], instances: 2 },
				{ variant: 'hover', value: 'rgb(10, 100, 80)', kind: 'derived', tokens: [], instances: 2 },
				{ variant: 'plain', value: 'rgb(1, 2, 3)', kind: 'own', tokens: [], instances: 2 },
			],
		};
		await analysed({ values: { state: 'read', instances: 12, unmarked: 0, rows: { light: [...rows, mixed], dark: null } } });
		expect(shownIn('text').map((c) => c.textContent)).toEqual(['Text colorLight primary main#FFFFFF']);
		await pick('variant', 'hover');
		expect(shownIn('text').map((c) => c.textContent)).toEqual(['Text colorFrom a token#0A6450']);
		// The background was never drawn hovered: said, never guessed.
		const background = section('Values')?.querySelector('[data-value-row="background"]') as HTMLElement;
		expect(background.hasAttribute('data-not-drawn')).toBe(true);
		expect(background.textContent).toBe('BackgroundNot drawn with this');
		expect(background.querySelector('[title]')?.getAttribute('title')).toContain('Nearest:');
		await pick('variant', 'plain');
		expect(shownIn('text').map((c) => c.textContent)).toEqual(['Text color#010203']);
	});

	it('chooses a prop that is true or false with a switch, as FSButton’s disabled is: its colours by variant and disabled together', async () => {
		const rows = (analysis().values as { rows: { light: { property: string }[] } }).rows.light.filter((r) => r.property !== 'background');
		const background = {
			property: 'background',
			by: 'variant, disabled',
			cells: [
				{
					variant: 'primary',
					value: 'rgb(16, 128, 98)',
					kind: 'own',
					tokens: [],
					instances: 2,
					of: [
						{ variant: 'primary', disabled: null },
						{ variant: 'primary', disabled: 'false' },
					],
				},
				{
					variant: 'primary · disabled',
					value: 'rgb(200, 200, 200)',
					kind: 'own',
					tokens: [],
					instances: 1,
					of: [{ variant: 'primary', disabled: 'true' }],
				},
			],
		};
		await analysed({ values: { state: 'read', instances: 3, unmarked: 0, rows: { light: [...rows, background], dark: null } } });
		const toggle = section('Values')?.querySelector('[data-picker="disabled"] [role="switch"]') as HTMLElement;
		expect(toggle.getAttribute('aria-checked')).toBe('false');
		expect(shownIn('background').map((c) => c.textContent)).toEqual(['Background#108062']);
		await press(toggle);
		expect(toggle.getAttribute('aria-checked')).toBe('true');
		expect(shownIn('background').map((c) => c.textContent)).toEqual(['Background#C8C8C8']);
	});

	it('says a radius that makes its ends round as full, with no control, and the radii that are sizes as they are (Phase 5.5)', async () => {
		const rows = (analysis().values as { rows: { light: { property: string }[] } }).rows.light.filter((r) => r.property !== 'radius');
		const radius = {
			property: 'radius',
			by: 'shape',
			cells: [
				// As Values reads them: written short, a corner that makes its end round said as full.
				{ variant: 'pill', value: 'full', kind: 'own', tokens: [], instances: 1 },
				{ variant: 'square', value: '6px', kind: 'own', tokens: [], instances: 1 },
			],
		};
		await analysed({ values: { state: 'read', instances: 2, unmarked: 0, rows: { light: [...rows, radius], dark: null } } });
		const read = () => shownIn('radius').map((c) => [c.textContent, c.querySelector('button') !== null]);
		expect(read()).toEqual([['Radiusfull', false]]);
		await pick('shape', 'square');
		expect(read()).toEqual([['Radius6px', true]]);
	});

	it('shows a row no prop explains by the value most instances draw, and the rest under it, each with how many draw it', async () => {
		const rows = (analysis().values as { rows: { light: unknown[] } }).rows.light;
		const many = {
			property: 'border',
			by: null,
			cells: Array.from({ length: 14 }, (_, i) => ({ variant: null, value: `rgb(${i}, 0, 0)`, kind: 'own', tokens: [], instances: 14 - i })),
		};
		await analysed({ values: { state: 'read', instances: 14, unmarked: 0, rows: { light: [...rows, many], dark: null } } });
		expect(shownIn('border').map((c) => c.textContent)).toEqual(['Border#000000']);
		const more = section('Values')?.querySelector('[data-value-row="border"] details') as HTMLElement;
		expect(more.querySelector('summary')?.textContent).toBe('13 more');
		expect(more.querySelectorAll('[data-value-cell]')).toHaveLength(13);
		expect(more.querySelector('[data-value-cell]')?.textContent).toBe('13 instances#010000');
	});

	it('shows dark’s values when dark is chosen in the panel, as the stories draw it there, and light’s again when light is', async () => {
		await analysed();
		const values = section('Values')!;
		await say({ type: 'mode', mode: 'dark' });
		expect([...values.querySelectorAll('[data-value-row]')].map((r) => r.getAttribute('data-value-row'))).toEqual(['height', 'background']);
		expect(shownIn('background').map((c) => c.textContent)).toEqual(['BackgroundDark primary main#2BB48A']);
		await say({ type: 'mode', mode: 'light' });
		expect(values.querySelector('[data-value-row="radius"]')).not.toBeNull();
	});

	it('shows light when dark is chosen but its stories did not draw it, or drew it the same: never a dark that changes nothing', async () => {
		const light = (analysis().values as { rows: { light: object[] } }).rows.light;
		await analysed({ values: { ...(analysis().values as { rows: object }), rows: { light, dark: null } } });
		await say({ type: 'mode', mode: 'dark' });
		// Light's rows: the radius row is in light and not in dark.
		expect(section('Values')?.querySelector('[data-value-row="radius"]')).not.toBeNull();
		document.body.innerHTML = '';
		// A library DSNR cannot turn dark draws its light twice.
		await analysed({ values: { ...(analysis().values as { rows: object }), rows: { light, dark: light } } });
		await say({ type: 'mode', mode: 'dark' });
		expect(section('Values')?.querySelector('[data-value-row="radius"]')).not.toBeNull();
		expect(section('Values')?.querySelector('[data-values-none]')).toBeNull();
	});

	it('says when a length it calls its own may be a token no tag could be given', async () => {
		await analysed();
		expect(section('Values')?.querySelector('[data-values-unmarked]')).toBeNull();
		document.body.innerHTML = '';
		await analysed({ values: { ...(analysis().values as object), unmarked: 2 } });
		expect(section('Values')?.querySelector('[data-values-unmarked]')?.textContent).toBe(
			'2 lengths in the design system are written in em or %, which cannot be marked, so a length said to be its own may be one of them.',
		);
	});

	it('says why it has no values when it only wraps what it is given, when its stories did not draw, and when reading them failed', async () => {
		const says = async (values: object) => {
			document.body.innerHTML = '';
			await analysed({ values });
			return section('Values')?.textContent;
		};
		expect(await says({ state: 'wraps' })).toContain('Its stories draw it around other content');
		expect(await says({ state: 'not-drawn' })).toContain('Its stories did not finish drawing');
		expect(await says({ state: 'failed', error: 'No component here' })).toContain('Its values could not be read: No component here');
	});

	it('says why it has no values when its stories name no component', async () => {
		await analysed({ values: { state: 'no-component' } });
		expect(section('Values')?.textContent).toContain('Its stories do not say which component they are of');
	});

	it('says why it has no values when its stories draw none of it', async () => {
		await analysed({ values: { state: 'none-drawn' } });
		expect(section('Values')?.textContent).toContain('Its stories draw no FSButton on the page, so its values cannot be read.');
	});

	it('lists every token it draws with in Tokens used, closed until opened, by category then group and set, with uses and who shares it', async () => {
		await analysed();
		const used = section('Tokens used')!;
		const details = used.querySelector('details') as HTMLDetailsElement;
		expect(details.open).toBe(false);
		expect(details.querySelector('summary')?.textContent).toBe('Tokens used5');
		// Every token Made from and Color tokens listed, colours with the rest: one list.
		expect([...used.querySelectorAll('[data-token]')].map((t) => t.getAttribute('data-token'))).toEqual([
			'palette.light.primary.main',
			'palette.light.primary.contrastText',
			'palette.dark.primary.main',
			'radius',
			'spacing',
		]);
		expect([...used.querySelectorAll('[data-tokens-used]')].map((c) => c.getAttribute('data-tokens-used'))).toEqual(['Color', 'Shape', 'Spacing']);
		// A colour by its theme, then its role, as the Tokens tab lists it.
		const color = used.querySelector('[data-tokens-used="Color"]') as HTMLElement;
		expect([...color.querySelectorAll('[data-token-group]')].map((g) => g.getAttribute('data-token-group'))).toEqual(['Light', 'Dark']);
		const radius = used.querySelector('[data-token="radius"]') as HTMLElement;
		expect(radius.querySelector('[data-part="name"]')?.textContent).toBe('radius');
		expect(radius.querySelector('[data-part="value"]')?.textContent).toBe('4px');
		expect(radius.querySelector('[data-token-use]')?.textContent).toBe('5 uses · also FSIconButton, FSSplitButton');
		expect(used.querySelector('[data-token="spacing"] [data-token-use]')?.textContent).toBe('4 uses · no other component');
	});

	it('opens a token’s own control from Tokens used, a colour’s as any other’s, as the panel’s row does, and closes it with its X', async () => {
		await analysed();
		for (const path of ['radius', 'palette.light.primary.main']) {
			await press(section('Tokens used')!.querySelector(`[data-token="${path}"] button.token-button`) as HTMLElement);
			expect(document.querySelector('[role="dialog"]')).not.toBeNull();
			await press(document.querySelector('[role="dialog"] [aria-label="Close"]') as HTMLElement);
			expect(document.querySelector('[role="dialog"]')).toBeNull();
		}
	});

	it('says in a line how far its tokens reach: the components that share them, and how often it uses them', async () => {
		await analysed();
		expect(section('Tokens used')?.querySelector('[data-usage]')?.textContent).toBe(
			'Shares its tokens with 2 components; 15 token uses in its stories drawn.',
		);
	});

	it('lists what it sets itself under Tokens used, by kind with their uses, the first few, and keeps the rest to open', async () => {
		const colors = Array.from({ length: 10 }, (_, i) => ({ kind: 'color', value: `rgb(${i}, 0, 0)`, uses: 10 - i }));
		await analysed({ notTokens: [...colors, { kind: 'spacing', value: '13px', uses: 1 }] });
		const values = section('Tokens used')?.querySelector('[data-own-values]') as HTMLElement;
		expect(values.querySelector('h3')?.textContent).toBe('Set in the component itself');
		expect([...values.querySelectorAll('[data-not-token-kind]')].map((g) => g.getAttribute('data-not-token-kind'))).toEqual(['color', 'spacing']);
		const shown = (kind: string) =>
			[...values.querySelectorAll(`[data-not-token-kind="${kind}"] > ul > [data-not-token]`)].map((li) => li.textContent);
		expect(shown('color')).toHaveLength(8);
		expect(shown('color')[0]).toContain('rgb(0, 0, 0)');
		expect(shown('spacing')).toEqual(['13px1 use']);
		// The other two are inside one that is closed until it is opened, said by how many.
		const more = values.querySelector('[data-not-token-kind="color"] details') as HTMLDetailsElement;
		expect(more.open).toBe(false);
		expect(more.querySelector('summary')?.textContent).toBe('Show 2 more');
		expect([...more.querySelectorAll('[data-not-token]')]).toHaveLength(2);
		await press(more.querySelector('summary') as HTMLElement);
		expect(more.open).toBe(true);
		// What is worked out from a token is said once, below.
		expect(values.textContent).toContain('1 use is a shade worked out from a token');
	});

	it('has no part for values it sets itself when it sets none', async () => {
		await analysed({ notTokens: [], derived: 0 });
		expect(section('Non-token values')).toBeNull();
	});

	it('says what axe found in a line, what it was checked with and what is a person’s, and keeps the findings to open', async () => {
		await analysed();
		const a11y = section('Accessibility')!;
		expect(a11y.querySelector('[data-accessibility-summary]')?.textContent).toBe('1 automated issue, 1 needs a person');
		expect(a11y.textContent).toContain('Checked with axe-core 4.10 at WCAG 2.2 AA');
		expect(a11y.textContent).toContain('No automated check covers 2.4.7');
		const details = a11y.querySelector('details') as HTMLDetailsElement;
		expect(details.open).toBe(false);
		expect(details.querySelector('summary')?.textContent).toBe('Show the findings');
		expect(details.textContent).toContain('Text needs more contrast');
		expect(details.textContent).toContain('Check this attribute');
		expect(details.textContent).toContain('WCAG 1.4.3');
		// Which element, and what to change on it; the rest counted.
		const elements = details.querySelector('[data-issue-elements="color-contrast"]') as HTMLElement;
		expect([...elements.querySelectorAll('li')].map((l) => l.textContent)).toEqual([
			'button.ghost > span: Fix any of the following: Element has insufficient color contrast of 3.1',
			'and 1 more element',
		]);
		// Best practice, apart and never counted: the summary above says only what WCAG's rules found.
		const best = details.querySelector('[aria-label="Best practice, beside WCAG (not counted as it)"]') as HTMLElement;
		expect(best.textContent).toContain('Heading levels should only increase by one');
		expect(best.querySelector('[data-issue-elements="heading-order"] code')?.textContent).toBe('h4');
	});

	describe('saving the values tried where they are written (Phase 4)', () => {
		afterEach(() => void vi.useRealTimers());
		const SMALL = { property: 'height', value: '32px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] };
		const ID = 'height\u0000height:sm:0\u0001height:sm:1\u0001height:sm:2';
		/** The tab with Small's height tried at 32px. */
		const tryingSmall = async () => {
			await analysed();
			await answer('storyPreview', { state: 'ready', base: BASE });
			await press(section('Values')?.querySelector('[aria-label="Change Height · sm"]') as HTMLElement);
			await type(document.querySelector('input[type="range"][aria-label="Height"]') as HTMLInputElement, '32');
			await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
			await openChanges();
		};
		const changed = () => section('Value changes') as HTMLElement;
		const found = (over: Record<string, unknown> = {}) => ({
			state: 'ready',
			values: [{ id: ID, state: 'found', places: [{ file: 'src/utils/theme.ts', line: 158, written: '28px', writes: '32px' }] }],
			reach: {
				state: 'ready',
				moved: [
					{ file: BUTTON, changes: [{ mode: 'light', property: 'height', variant: 'sm', from: '28px', to: '32px', instances: 3 }], inside: false },
				],
				unchanged: 12,
				notDrawn: [],
			},
			...over,
		});

		it('changes a token’s value through the token’s own control, which every page shares, so it is saved as the panel’s changes are', async () => {
			await analysed();
			// The radius is the shared token's: its control is the token's, not a value of the component's own.
			await press(section('Values')?.querySelector('[aria-label="Change Radius"]') as HTMLElement);
			const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
			expect(dialog).not.toBeNull();
			expect(document.querySelector('[data-value-cell] [role="dialog"]')).toBeNull();
			const slider = dialog.querySelector('input[type="range"]') as HTMLInputElement;
			await type(slider, '12');
			// Let go: a token's change is built, so it is made then, not as it moves.
			await act(async () => void slider.dispatchEvent(new Event('pointerup', { bubbles: true })));
			// Told to the extension, which keeps the change for every page: the panel's Changed, and its Save, have it.
			const told = sent.filter((m) => m.type === 'token-edits').at(-1) as { edits: unknown[] } | undefined;
			expect(told?.edits).toEqual([{ path: 'radius', value: '12px' }]);
			expect(changed()).toBeNull();
		});

		it('is not there with nothing tried and no branch, and asks for none', async () => {
			await analysed();
			expect(changed()).toBeNull();
			expect(calls('valueSources')).toHaveLength(0);
			expect(calls('valueBranch').at(-1)?.args).toEqual([BUTTON]);
		});

		it('offers Save only once every value is found where it is written, each place opening the library at its line', async () => {
			await tryingSmall();
			await answer('valueSources', found());
			expect(changed().querySelector('[data-value-places]')?.textContent).toBe('Written in src/utils/theme.ts, line 158');
			await press(changed().querySelector('[data-value-places] button') as HTMLElement);
			expect(sent.at(-1)).toEqual({ type: 'open-library-source', file: 'src/utils/theme.ts', line: 158 });
			expect(changed().textContent).toContain('Saving writes 1 value where it is written, and nothing else.');
			// And what writing it moves, as a token change's is said.
			expect(section('Moved by these values')?.querySelector('[data-reach-summary]')?.textContent).toBe(
				'It moves 1 component; 12 unchanged, in their stories drawn.',
			);
		});

		it('says why a value cannot be saved, in words, where it is, and offers no Save', async () => {
			await tryingSmall();
			await answer('valueSources', {
				state: 'ready',
				values: [{ id: ID, state: 'refused', why: '28px is written in 2 places that each draw it here, so which to change cannot be said.' }],
				reach: { state: 'none' },
			});
			expect(changed().querySelector('[data-value-refused]')?.textContent).toBe(
				'28px is written in 2 places that each draw it here, so which to change cannot be said.',
			);
			expect(section('Moved by these values')).toBeNull();
		});

		it('has no Save, Propose or Start over here: they are in the panel’s Changes, which it opens', async () => {
			await tryingSmall();
			await answer('valueSources', found());
			expect(button('Save to a branch')).toBeUndefined();
			expect(button('Propose')).toBeUndefined();
			expect(button('Start over')).toBeUndefined();
			await press(changed().querySelector('[data-actions-elsewhere]') as HTMLElement);
			expect(sent.at(-1)).toEqual({ type: 'open-changes' });
		});

		it('tells the extension what is tried, on the commit it is tried on, so every page has it', async () => {
			await tryingSmall();
			expect(sent.filter((m) => m.type === 'value-trial').at(-1)).toEqual({ type: 'value-trial', file: BUTTON, commit: 'abc123', values: [SMALL] });
		});

		it('offers the agent where a value cannot be found, asks it once pressed, and says what it wrote and why', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
			await tryingSmall();
			await answer('valueSources', {
				state: 'ready',
				values: [{ id: ID, state: 'refused', why: '28px is not written in the design system’s own files for it.', agent: 'write' }],
				reach: { state: 'none' },
			});
			await press(changed().querySelector('[data-value-agent]') as HTMLElement);
			expect(changed().querySelector('[data-value-agent]')?.textContent).toBe('Have the agent write it');
			expect(calls('writeValue').at(-1)?.args).toEqual([BUTTON, SMALL]);
			await answer('writeValue', null);
			// Asked again once it is: being written, and asked again until it is.
			await answer('valueSources', { state: 'ready', values: [{ id: ID, state: 'writing' }], reach: { state: 'none' } });
			expect(changed().textContent).toContain('The agent is writing it…');
			// Asked again while it writes.
			const asks = calls('valueSources').length;
			await act(async () => void (await vi.advanceTimersByTimeAsync(ASK_EVERY_MS)));
			expect(calls('valueSources').length).toBe(asks + 1);
			await answer(
				'valueSources',
				found({
					values: [
						{
							id: ID,
							state: 'found',
							by: 'agent',
							said: 'MUI’s default sets it, so the theme’s override does.',
							places: [{ file: 'src/utils/theme.ts', line: 59, written: '', writes: "height: '32px'," }],
						},
					],
				}),
			);
			expect(changed().querySelector('[data-value-places]')?.textContent).toBe('Written by the agent in src/utils/theme.ts, line 59');
			expect(changed().textContent).toContain('MUI’s default sets it, so the theme’s override does.');
			expect(changed().textContent).toContain('Saving writes 1 value where it is written, and nothing else.');
		});

		it('offers to follow a token whose value its own value is, from the value’s popover, and has the agent write it', async () => {
			const own = {
				state: 'read',
				instances: 12,
				unmarked: 0,
				rows: {
					light: [{ property: 'radius', by: null, cells: [{ variant: null, value: '4px', kind: 'own', tokens: [], instances: 12 }] }],
					dark: null,
				},
			};
			await analysed({ values: own });
			await answer('storyPreview', { state: 'ready', base: BASE });
			await press(section('Values')?.querySelector('[aria-label="Change Radius"]') as HTMLElement);
			const follow = document.querySelector('[data-value-cell] [role="dialog"] [data-value-follow="radius"]') as HTMLElement;
			expect(follow.textContent).toBe('Follow Radius');
			await press(follow);
			const asked = calls('writeValue').at(-1)?.args as [string, { follows: string; value: string }];
			expect(asked[0]).toBe(BUTTON);
			expect(asked[1]).toMatchObject({ property: 'radius', value: '4px', follows: 'radius' });
			await openChanges();
			expect(changed().querySelector('[data-value-change] .value-cell')?.textContent).toBe('Radius4px → follows Radius');
			expect(document.querySelector('[data-value-following]')?.textContent).toContain('Follows Radius');
		});

		it('offers no token to follow for a value no token has', async () => {
			await analysed();
			await press(section('Values')?.querySelector('[aria-label="Change Height · sm"]') as HTMLElement);
			expect(document.querySelector('[data-value-follow]')).toBeNull();
		});

		it('offers no token to follow for a value worked out from a token already, though it is that token’s value', async () => {
			const derived = {
				state: 'read',
				instances: 12,
				unmarked: 0,
				rows: {
					light: [{ property: 'radius', by: null, cells: [{ variant: null, value: '4px', kind: 'derived', tokens: [], instances: 12 }] }],
					dark: null,
				},
			};
			await analysed({ values: derived });
			await press(section('Values')?.querySelector('[aria-label="Change Radius"]') as HTMLElement);
			expect(document.querySelector('[data-value-cell] [role="dialog"]')).not.toBeNull();
			expect(document.querySelector('[data-value-follow]')).toBeNull();
		});

		it('puts back the values a branch saved when the tab opens with none tried', async () => {
			await analysed();
			await answer('storyPreview', { state: 'ready', base: BASE });
			await answer('valueBranch', { branch: 'dsnr/values-20261016-ab12', saved: [SMALL], saves: 1, pullRequest: null });
			await openChanges();
			expect(changed().querySelector('[data-value-change] .value-cell')?.textContent).toBe('Height · sm28px → 32px');
			expect(calls('valueSources').at(-1)?.args).toEqual([BUTTON, [SMALL]]);
			// Every value put back: the branch can be saved so, back as the library draws them, in the panel's Changes.
			await press(button('Reset all'));
			expect(changed().textContent).toContain('Every value is as the library draws it.');
			// With nothing tried, the branch can still be reached: the button says so and can be pressed.
			await press(document.querySelector('[role="dialog"][aria-label="Changes"] [aria-label="Close"]') as HTMLElement);
			const count = document.querySelector('.tab-actions button') as HTMLButtonElement;
			expect(count.textContent).toBe('No changes');
			expect(count.disabled).toBe(false);
		});
	});

	describe('every case its props declare, in the Values’ pickers (Phase 5)', () => {
		const READY = {
			state: 'ready',
			props: [
				{ name: 'size', values: ['sm', 'md', 'lg', 'xl', '2xl'] },
				{ name: 'variant', values: ['primary', 'ghost'] },
			],
			fixed: ['variant'],
			unvaried: [
				{ name: 'children', why: 'content' },
				{ name: 'sx', why: 'object' },
				{ name: 'onClick', why: 'callback' },
			],
			values: {
				state: 'read',
				instances: 2,
				unmarked: 0,
				rows: {
					light: [
						{
							property: 'height',
							by: 'size',
							// Its stories drew no 2xl; its props declare one, drawn on one of its stories.
							cells: [
								{ variant: 'sm', value: '28px', kind: 'own', tokens: [], instances: 1, targets: ['v:sm'], of: [{ size: 'sm' }] },
								{ variant: '2xl', value: '64px', kind: 'own', tokens: [], instances: 1, targets: ['v:2xl'], of: [{ size: '2xl' }] },
							],
						},
					],
					dark: null,
				},
			},
		};
		const notes = () => [...(section('Values')?.querySelectorAll('[data-variant-note]') ?? [])].map((n) => n.textContent);

		it('is asked for by the story file, and says under the pickers that it is being drawn until it is', async () => {
			await analysed();
			expect(calls('componentVariants').at(-1)?.args).toEqual([BUTTON]);
			expect(notes()).toEqual(['Reading its props, and drawing it with each of their values.']);
			// No section of its own: the pickers are where a variant is chosen.
			expect(section('Every variant')).toBeNull();
		});

		it('offers a case only its props declare, shown from their drawing and never tried; and says what its story sets and what cannot be varied', async () => {
			await analysed();
			await answer('componentVariants', READY);
			const size = section('Values')?.querySelector('[data-picker="size"] select') as HTMLSelectElement;
			expect([...size.options].map((o) => o.textContent)).toEqual(['sm', 'md', 'lg', 'xl', '2xl']);
			// Where its stories drew it, theirs, which can be tried.
			expect(shownIn('height')[0]?.querySelector('button')).not.toBeNull();
			await pick('size', '2xl');
			const height = shownIn('height')[0] as HTMLElement;
			expect(height.textContent).toBe('Height64px');
			expect(height.hasAttribute('data-still')).toBe(true);
			expect(height.querySelector('button')).toBeNull();
			expect(height.querySelector('[title]')?.getAttribute('title')).toContain('Drawn from its props');
			expect(notes()).toEqual([
				'Its story sets variant itself: drawn with another value, it draws as the story has it.',
				'Not varied: children (content), sx (an object), onClick (a callback).',
			]);
		});

		it('adds nothing when its stories name no component whose props can be read', async () => {
			await analysed();
			await answer('componentVariants', { state: 'none' });
			expect(notes()).toEqual([]);
			const size = section('Values')?.querySelector('[data-picker="size"] select') as HTMLSelectElement;
			expect([...size.options].map((o) => o.textContent)).toEqual(['sm', 'md', 'lg', 'xl']);
		});

		it('says why it could not be drawn', async () => {
			await analysed();
			await answer('componentVariants', { state: 'failed', error: 'Its story did not draw with its props changed.' });
			expect(notes()).toEqual(['Its variants could not be drawn: Its story did not draw with its props changed.']);
		});
	});

	describe('what a token change moves (Phase 3)', () => {
		const RED = [{ path: 'tone.pineGreen.50', value: '#C80000' }];
		const moved = (over: Record<string, unknown> = {}) => ({
			state: 'ready',
			moved: [
				{
					file: BUTTON,
					changes: [{ mode: 'light', property: 'background', variant: 'primary', from: 'rgb(16, 128, 98)', to: 'rgb(200, 0, 0)', instances: 6 }],
					inside: false,
				},
				{
					file: STORY('FSIconButton'),
					changes: [{ mode: 'dark', property: 'radius', variant: 'sm', from: '8px', to: '12px', instances: 2 }],
					inside: false,
				},
				{ file: STORY('FSTextField'), changes: [], inside: true },
			],
			unchanged: 40,
			notDrawn: [STORY('FSSelect')],
			...over,
		});
		const part = () => section('Moved by the change');

		it('is not there, and not asked for, while no token change is tried', async () => {
			await analysed();
			expect(part()).toBeNull();
			expect(calls('changeReach')).toHaveLength(0);
		});

		it('is asked for once the Changes dialog is opened with a change being tried, and says it is drawing every component until it is answered', async () => {
			await analysed();
			await say({ type: 'token-edits', edits: RED });
			// Not while the dialog is shut: drawing every component is for someone who asked to see what it moves.
			expect(calls('changeReach')).toHaveLength(0);
			await openChanges();
			expect(calls('changeReach').at(-1)?.args).toEqual([RED]);
			expect(part()?.textContent).toContain('Drawing every component with the change');
		});

		it('names each component the change moves, with what changed as the Values say it, and how many it does not move', async () => {
			await analysed();
			await say({ type: 'token-edits', edits: RED });
			await openChanges();
			await answer('changeReach', moved());
			const reach = part() as HTMLElement;
			expect(reach.querySelector('[data-reach-summary]')?.textContent).toBe(
				'It moves 3 components; 40 unchanged, in their stories drawn. 1 component did not draw, so cannot be said.',
			);
			// This component first, as itself; the others by name, each opening its own tab.
			const here = reach.querySelector(`[data-moved="${BUTTON}"]`) as HTMLElement;
			expect(here.querySelector('h3')?.textContent).toBe('FSButtonThis one');
			expect(here.querySelector('.value-cell')?.textContent).toBe('Background · primary#108062 → #C80000');
			const icon = reach.querySelector(`[data-moved="${STORY('FSIconButton')}"]`) as HTMLElement;
			expect(icon.querySelector('.value-cell')?.textContent).toBe('Radius · sm · dark8px → 12px');
			await press(icon.querySelector('h3 button') as HTMLElement);
			expect(sent.at(-1)).toEqual({ type: 'open-component', id: STORY('FSIconButton') });
			// Moved in a part its values do not read: said as that.
			expect(reach.querySelector(`[data-moved="${STORY('FSTextField')}"]`)?.textContent).toContain('in a part its values do not read');
		});

		it('says when the change moves nothing, and when it could not be drawn', async () => {
			await analysed();
			await say({ type: 'token-edits', edits: RED });
			await openChanges();
			await answer('changeReach', moved({ moved: [], unchanged: 44, notDrawn: [] }));
			expect(part()?.querySelector('[data-reach-summary]')?.textContent).toBe(
				'It moves no component, in their stories drawn: 44 components unchanged.',
			);
			await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.50', value: '#000000' }] });
			await answer('changeReach', { state: 'failed', error: 'the change did not build' });
			expect(part()?.textContent).toContain('the change did not build');
		});
	});

	describe('trying its values in its stories (Phase 2)', () => {
		/** The tab with its stories drawn and its values read, and what its stories' frame is told. */
		const tryingOpen = async (over: Record<string, unknown> = {}) => {
			await analysed(over);
			await answer('storyPreview', { state: 'ready', base: BASE });
			const frame = document.querySelector('iframe.story-frame') as HTMLIFrameElement;
			const told = vi.spyOn(frame.contentWindow as Window, 'postMessage');
			const tried = () => told.mock.calls.map(([m]) => (m as Record<string, unknown>)[PREVIEW_TRY]).at(-1);
			return { frame, told, tried };
		};
		const values = () => section('Values') as HTMLElement;
		const change = (label: string) => values().querySelector(`[aria-label="Change ${label}"]`) as HTMLElement;
		/** A value of its own's control: a popover inside its cell, not a dialog over the panel. */
		const popover = () => values().querySelector('[data-value-cell] [role="dialog"]') as HTMLElement | null;
		const editor = () => (popover()?.querySelector('[data-value-editor]') as HTMLElement | null | undefined) ?? null;
		const slider = (label: string) => popover()?.querySelector(`input[type="range"][aria-label="${label}"]`) as HTMLInputElement;
		const escape = () => act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
		const pressElsewhere = () => act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));

		it('moves nothing when a value is tried: the column is as it was, and only the count in its header changes', async () => {
			const { tried } = await tryingOpen();
			const column = document.querySelector('.component-aside') as HTMLElement;
			const first = column.firstElementChild;
			const count = document.querySelector('.tab-actions button') as HTMLButtonElement;
			expect(count.textContent).toBe('No changes');
			expect(count.disabled).toBe(true);
			// What is after it stays, the same element.
			const after = count.nextElementSibling;
			expect(after).not.toBeNull();
			await press(change('Height · sm'));
			await type(slider('Height'), '30');
			expect(tried()).toHaveLength(1);
			expect(column.firstElementChild).toBe(first);
			expect(
				column.querySelector('[aria-label="Value changes"], [aria-label="Moved by the change"], [aria-label="Moved by these values"]'),
			).toBeNull();
			expect(count.textContent).toBe('1 change');
			expect(count.disabled).toBe(false);
			expect(count.nextElementSibling).toBe(after);
			// A token change being tried moves its stories too, so it is counted here as well; and still nothing is put in the column.
			await say({ type: 'token-edits', edits: [{ path: 'radius', value: '12px' }] });
			expect(count.textContent).toBe('2 changes');
			expect(column.firstElementChild).toBe(first);
			expect(document.querySelector('.tab')?.textContent).not.toContain('Showing the change being tried');
		});

		it('opens a value of its own as a slider, tries it on the instances that draw it as it moves, and marks it tried', async () => {
			const { tried } = await tryingOpen();
			await press(change('Height · sm'));
			expect(popover()?.getAttribute('aria-label')).toBe('Height · sm');
			// Small: its title and its slider with its value, nothing else to read; what is tried and not saved is said once, on the tab.
			expect(editor()?.textContent).toBe('Height · sm28px');
			await type(slider('Height'), '30');
			// Told at once, without letting go: nothing is built for a value of its own.
			expect(tried()).toEqual([{ property: 'height', value: '30px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] }]);
			const cell = values().querySelector('[data-value-row="height"] [data-tried]') as HTMLElement;
			expect(cell.querySelector('.value-cell')?.textContent).toBe('Height30px');
			expect(cell.querySelector('[data-changed-mark]')).not.toBeNull();
			// Said once, in its Changes dialog: changed, and where it is written is being found.
			await openChanges();
			const changed = section('Value changes') as HTMLElement;
			expect(changed.querySelector('[data-value-change] .value-cell')?.textContent).toBe('Height · sm28px → 30px');
			expect(changed.textContent).toContain('Finding where it is written…');
			expect(calls('valueSources').at(-1)?.args).toEqual([BUTTON, tried()]);
		});

		it('is a small popover under its value, not a dialog over the panel: no scrim, the button says it is open', async () => {
			await tryingOpen();
			const opener = change('Height · sm');
			expect(opener.getAttribute('aria-expanded')).toBe('false');
			expect(popover()).toBeNull();
			await press(opener);
			expect(opener.getAttribute('aria-expanded')).toBe('true');
			// Inside the cell it is opened from, and not modal: nothing is dimmed, and the panel behind stays reachable.
			expect(opener.closest('[data-value-cell]')?.contains(popover())).toBe(true);
			expect(popover()?.getAttribute('aria-modal')).toBeNull();
			expect(document.querySelector('.scrim')).toBeNull();
			// The focus is in it, on the panel and not on its first field: the slider is not drawn as chosen the moment it opens.
			expect(document.activeElement).toBe(popover());
			expect(document.activeElement).not.toBe(slider('Height'));
		});

		it('closes with Escape, the focus going back to its button; with a press elsewhere; and with its button again; not with a press inside it', async () => {
			await tryingOpen();
			const opener = change('Height · sm');
			await press(opener);
			await escape();
			expect(popover()).toBeNull();
			expect(document.activeElement).toBe(opener);
			await press(opener);
			await act(async () => void slider('Height').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
			expect(popover()).not.toBeNull();
			await pressElsewhere();
			expect(popover()).toBeNull();
			await press(opener);
			await press(opener);
			expect(popover()).toBeNull();
		});

		it('keeps a value tried when its popover is closed, and shows it again when it is opened', async () => {
			const { tried } = await tryingOpen();
			await press(change('Height · sm'));
			await type(slider('Height'), '30');
			await escape();
			expect(tried()).toHaveLength(1);
			await press(change('Height · sm'));
			expect(slider('Height').value).toBe('30');
			expect(popover()?.textContent).toContain('Reset');
		});

		it('draws what the extension says is tried: none once it forgets them (another mode chosen), and none tried on another commit', async () => {
			const { tried } = await tryingOpen();
			await press(change('Height · sm'));
			await type(slider('Height'), '30');
			expect(tried()).toHaveLength(1);
			await escape();
			await say({ type: 'value-trials', trials: {} });
			expect(tried()).toEqual([]);
			expect(values().querySelector('[data-tried]')).toBeNull();
			// Its instances are named by its drawing on a commit: what was tried on another is not this one's.
			const tall = { property: 'height', value: '40px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] };
			await say({ type: 'value-trials', trials: { [BUTTON]: { commit: 'def456', values: [tall] } } });
			expect(tried()).toEqual([]);
			await say({ type: 'value-trials', trials: { [BUTTON]: { commit: 'abc123', values: [tall] } } });
			expect(tried()).toEqual([tall]);
		});

		it('puts a value back with Reset, and every value with Reset all', async () => {
			const { tried } = await tryingOpen();
			await press(change('Height · sm'));
			await type(slider('Height'), '30');
			await press(button('Reset'));
			expect(tried()).toEqual([]);
			expect(values().querySelector('[data-tried]')).toBeNull();
			await type(slider('Height'), '31');
			// Another value opened (md, chosen with the Size picker): this one's popover is shut, and what was tried stays tried.
			await pick('size', 'md');
			await press(change('Height · md'));
			expect(values().querySelectorAll('[data-value-cell] [role="dialog"]')).toHaveLength(1);
			await type(slider('Height'), '40');
			expect(tried()).toHaveLength(2);
			await escape();
			await openChanges();
			await press(button('Reset all'));
			expect(tried()).toEqual([]);
			expect(section('Value changes')).toBeNull();
			expect(document.querySelector('[role="dialog"][aria-label="Changes"]')?.textContent).toContain('Nothing is being tried.');
		});

		it('tells the frame again when it loads, so a new build of the stories has what is tried', async () => {
			const { frame, told, tried } = await tryingOpen();
			await press(change('Height · sm'));
			await type(slider('Height'), '30');
			told.mockClear();
			frame.dispatchEvent(new Event('load'));
			expect(tried()).toEqual([{ property: 'height', value: '30px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] }]);
		});

		it('tries a colour as its picker moves, keeping the opacity it is drawn with', async () => {
			const rows = (analysis().values as { rows: { light: unknown[] } }).rows.light;
			const veil = {
				property: 'border',
				by: null,
				cells: [{ variant: null, value: 'rgba(16, 128, 98, 0.5)', kind: 'own', tokens: [], instances: 1 }],
			};
			const { tried } = await tryingOpen({ values: { state: 'read', instances: 12, unmarked: 0, rows: { light: [...rows, veil], dark: null } } });
			await press(change('Border'));
			await type(popover()?.querySelector('input[type="color"]') as HTMLInputElement, '#123456');
			expect(tried()).toEqual([{ property: 'border', value: '#12345680', targets: ['border:null:0'] }]);
		});

		it('opens a value that is a token as the token’s own control, since it moves every component that draws with it', async () => {
			const { tried } = await tryingOpen();
			await press(change('Radius'));
			expect(document.querySelector('[role="dialog"] [data-token-editor="radius"]')).not.toBeNull();
			expect(editor()).toBeNull();
			expect(tried() ?? []).toEqual([]);
		});

		it('gives each part of a value written with several its own slider, and a colour its picker and hex', async () => {
			const rows = (analysis().values as { rows: { light: unknown[] } }).rows.light;
			const padding = { property: 'padding', by: null, cells: [{ variant: null, value: '0px 10px', kind: 'own', tokens: [], instances: 12 }] };
			const { tried } = await tryingOpen({ values: { state: 'read', instances: 12, unmarked: 0, rows: { light: [...rows, padding], dark: null } } });
			await press(change('Padding'));
			expect([...(popover()?.querySelectorAll('input[type="range"]') ?? [])].map((r) => r.getAttribute('aria-label'))).toEqual([
				'Top and bottom',
				'Left and right',
			]);
			await type(slider('Left and right'), '12');
			// Every part in full, as the page sets it; said short on its cell.
			expect(tried()).toEqual([
				{ property: 'padding', value: '0px 12px 0px 12px', targets: Array.from({ length: 12 }, (_, i) => `padding:null:${i}`) },
			]);
			expect(values().querySelector('[data-value-row="padding"] [data-tried] .value-drawn')?.textContent).toBe('0px 12px');
			// Made one value by the drag, its two parts stay two sliders, so it can be split again.
			await type(slider('Left and right'), '0');
			expect([...(popover()?.querySelectorAll('input[type="range"]') ?? [])].map((r) => r.getAttribute('aria-label'))).toEqual([
				'Top and bottom',
				'Left and right',
			]);
			await type(slider('Left and right'), '12');
			await pick('variant', 'ghost');
			await press(change('Background · ghost'));
			const hex = popover()?.querySelector('input[aria-label="Hex"]') as HTMLInputElement;
			expect(hex).not.toBeNull();
			await type(hex, '#123456');
			await act(async () => void hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
			expect((tried() as { property: string; value: string }[]).find((t) => t.property === 'background')?.value).toBe('#123456');
		});
	});

	it('has no findings to open when axe found nothing', async () => {
		await analysed({
			accessibility: {
				violations: [],
				incomplete: [],
				bestPractice: { violations: [], incomplete: [] },
				notAutomated: [],
				ran: { axe: '4.10', target: 'WCAG 2.2 AA', states: ['default'] },
			},
		});
		expect(section('Accessibility')!.querySelector('details')).toBeNull();
		expect(section('Accessibility')!.querySelector('[data-accessibility-summary]')?.textContent).toBe('No issues found by automated checks');
	});

	it('says it is finding them while the first reading is drawn, with none of the parts yet', async () => {
		await open();
		await answer('componentTokens', { state: 'building' });
		expect(document.querySelector('.component-aside')?.textContent).toContain('Finding the tokens FSButton draws with');
		expect(section('Made from')).toBeNull();
	});

	it('says, when the design system cannot be read here, that the panel says why, and reads it again on Try again', async () => {
		await mount(createElement(ComponentTab, { id: BUTTON }));
		await answer('designSystemCatalog', { state: 'no-branch', root: '/work/lib', branch: 'develop' });
		expect(document.querySelector('.tab-note')?.textContent).toContain('The design system cannot be read here: the DSNR panel says why.');
		await press(button('Try again'));
		expect(calls('designSystemCatalog')).toHaveLength(2);
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		expect(document.querySelector('.tab-title')?.textContent).toBe('FSButton');
	});

	it('says why it could not be read, with Try again', async () => {
		await mount(createElement(PrimitivesTab));
		const call = calls('designSystemCatalog').at(-1);
		await say({ type: 'answer', id: call?.id, result: { ok: false, error: 'git could not read it.' } });
		expect(document.querySelector('.tab-note')?.textContent).toContain('git could not read it.');
		await press(button('Try again'));
		expect(calls('designSystemCatalog')).toHaveLength(2);
	});

	it('says when the design system shown no longer has it', async () => {
		await mount(createElement(ComponentTab, { id: 'src/Gone.stories.tsx' }));
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		expect(document.querySelector('.tab-note')?.textContent).toBe('The design system shown no longer has this component. Close this tab.');
	});
});

describe('the Primitives tab', () => {
	const open = async () => {
		await mount(createElement(PrimitivesTab));
		await answer('designSystemCatalog', SAMPLE_CATALOG);
	};

	it('has a chip for each primitive, how many it has or that it is not defined, in the vocabulary’s order', async () => {
		await open();
		expect([...document.querySelectorAll('[data-primitive-chip]')].map((c) => c.textContent)).toEqual([
			'Color 5',
			'Typography 1 · family only',
			'Spacing 1',
			'Shape 1',
			'Elevation not defined',
			'Borders not defined',
			'Breakpoints not defined',
			'Motion not defined',
		]);
	});

	it('draws each as the vocabulary says, and lists what it does not define, with where DSNR looked', async () => {
		await open();
		expect([...document.querySelectorAll('[data-primitive]')].map((s) => s.getAttribute('data-primitive'))).toEqual([
			'Color',
			'Typography',
			'Spacing',
			'Shape',
		]);
		expect(document.querySelectorAll('[data-primitive="Color"] [data-swatch]')).toHaveLength(5);
		expect(document.querySelector('[data-spacing-bar]')).not.toBeNull();
		expect(document.querySelector('[data-radius-sample]')).not.toBeNull();
		expect(document.querySelector('[data-not-defined]')?.textContent).toContain('Elevation Not defined in its theme files.');
	});

	it('draws its type specimen in the design system’s own preview', async () => {
		await open();
		expect(calls('storyPreview')[0]?.args).toEqual([[]]);
		await answer('storyPreview', { state: 'ready', base: BASE });
		expect(document.querySelector('[data-primitive="Typography"] iframe')?.getAttribute('src')).toMatch(
			/^http:\/\/127\.0\.0\.1:4321\/previews-abc\/\?/,
		);
	});

	it('shows the change being tried in the panel', async () => {
		await open();
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.60', value: '#000000' }] });
		expect(document.querySelector('.tab')?.textContent).toContain('Showing the change being tried in the panel (1 token).');
	});
});
