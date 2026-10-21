import type { Catalog } from '../src/shared/contract';
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentTab } from '../extension/webview/ComponentTab';
import { PrimitivesTab } from '../extension/webview/PrimitivesTab';
import { readTab } from '../extension/webview/tab';
import { PREVIEW_HEIGHT, PREVIEW_TRY, previewAddress } from '../src/shared/catalog';
import { SAMPLE_CATALOG } from './extensionSamples';
import { answer, answerOf, calls, callsOf, lastAsk, mountPage, say, sent, share, shareCatalog, unmount } from './webviewHarness';
import { button, dialog, key, press, type } from './ui';

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
		await mountPage(createElement(ComponentTab, { id: BUTTON }));
		await shareCatalog(SAMPLE_CATALOG);
	};

	it('says it is ready, shows the design system as the extension read it for every page, and is titled for its component, with its links', async () => {
		await open();
		expect(sent[0]).toEqual({ type: 'ready' });
		expect(document.querySelector('.heading-page')?.textContent).toBe('FSButton');
		await press(button('Storybook'));
		expect(lastAsk()).toEqual(['componentLink', [BUTTON, 'storybook']]);
		await press(button('GitHub'));
		expect(lastAsk()).toEqual(['componentLink', [BUTTON, 'source']]);
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

	it('draws its stories in the mode chosen in the panel, light first, and loads again when it changes', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const src = () => document.querySelector('iframe')?.getAttribute('src');
		expect(src()).toBe(previewAddress(BASE, BUTTON, 'light'));
		expect(src()).not.toContain('theme=');
		await share('mode', 'dark');
		expect(src()).toBe(previewAddress(BASE, BUTTON, 'dark'));
		expect(src()).toContain('&theme=dark');
		await share('mode', 'light');
		expect(src()).toBe(previewAddress(BASE, BUTTON));
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

	it('shows another commit of the library when the extension reads one, says which, and builds and reads its component anew', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const tokensAsked = calls('componentTokens').length;
		const branch = 'dsnr/handoff-20261017-ab12';
		await shareCatalog({ ...SAMPLE_CATALOG, commit: 'f00d42', showing: branch } as Catalog);
		expect(document.querySelector('[data-showing]')?.textContent).toContain(`Showing ${branch}, the agent’s branch, not develop.`);
		expect(document.querySelector('.stories')).toBeNull();
		expect(calls('componentTokens').length).toBeGreaterThan(tokensAsked);
		await press(button('Show develop'));
		expect(calls('showLibraryBranch')).toHaveLength(1);
	});

	it('builds them again with the change the extension says is being tried, keeping the last until it is built', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const edits = [{ path: 'tone.pineGreen.50', value: '#000000' }];
		await share('tokenEdits', edits);
		expect(calls('storyPreview').at(-1)?.args).toEqual([edits]);
		expect(document.querySelector('iframe')).not.toBeNull();
		expect(document.querySelector('.stories-building')?.textContent).toBe('Building…');
		await answer('storyPreview', { state: 'ready', base: 'http://127.0.0.1:4321/trial-1/' });
		expect(document.querySelector('iframe')?.getAttribute('src')).toBe(previewAddress('http://127.0.0.1:4321/trial-1/', BUTTON));
	});

	it('builds nothing again when it is told the change it already has (the extension says every change to every page)', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		await share('tokenEdits', []);
		expect(calls('storyPreview')).toHaveLength(1);
		const edits = [{ path: 'tone.pineGreen.50', value: '#000000' }];
		await share('tokenEdits', edits);
		await share('tokenEdits', [...edits]);
		expect(calls('storyPreview')).toHaveLength(2);
	});

	it('hears only VS Code, on its own origin: no story it frames, nor any frame inside one, can pass itself off as the extension', async () => {
		await open();
		await answer('storyPreview', { state: 'ready', base: BASE });
		const forged = { type: 'shared', name: 'tokenEdits', value: [{ path: 'tone.pineGreen.50', value: '#000000' }] };
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		await say(forged, { source: frame.contentWindow, origin: 'http://127.0.0.1:4321' });
		// A frame inside a framed page, with no origin of its own: not the window above, however deep it is.
		const outer = document.body.appendChild(document.createElement('iframe'));
		const inner = outer.contentDocument?.body.appendChild(outer.contentDocument.createElement('iframe'));
		await say(forged, { source: inner?.contentWindow ?? null, origin: 'null' });
		outer.remove();
		expect(calls('storyPreview')).toHaveLength(1);
		await say(forged);
		expect(calls('storyPreview')).toHaveLength(2);
	});

	it('says why its previews could not be built, with a way to try again', async () => {
		await open();
		await answer('storyPreview', { state: 'no-packages', root: '/work/lib' });
		expect(document.querySelector('.message-block.message-warning')?.textContent).toContain(
			"The design system's packages are not installed in /work/lib.",
		);
		await press(button('Try again'));
		expect(calls('storyPreview')).toHaveLength(2);
	});

	const STORY = (name: string) => `src/components/${name}/${name}.stories.tsx`;
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
								// For a row told apart by one prop, each cell's variant is that prop's value, as the reader says it.
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
	/** The count, a link to the side panel's Changes, where what is tried is listed and saved. */
	const changesLink = () => document.querySelector('.tab-header .passing-link') as HTMLElement;

	it('reads in three parts: its styles, the tokens it draws with, and what is wrong with it, each with its title', async () => {
		await analysed();
		expect([...document.querySelectorAll('.component-aside > [aria-label]')].map((e) => e.getAttribute('aria-label'))).toEqual([
			'Styles',
			'Tokens',
			'Accessibility',
		]);
		expect([...document.querySelectorAll('.component-aside > section > .aside-heading > h2')].map((h) => h.textContent)).toEqual([
			'Styles',
			'Tokens',
			'Accessibility',
		]);
		expect(document.querySelector('.component-aside details.aside-disclosure')).toBeNull();
		expect(section('Tokens')?.querySelector('[data-token]')).not.toBeNull();
		expect(document.querySelector('.heading-page')?.textContent).toBe('FSButton');
	});

	const pick = async (prop: string, value: string) => {
		const select = document.querySelector(`[data-picker="${prop}"] select`) as HTMLSelectElement;
		await act(async () => {
			select.value = value;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		});
	};
	const shownIn = (property: string) =>
		[...(section('Styles')?.querySelectorAll<HTMLElement>(`[data-value-row="${property}"] [data-value-cell]`) ?? [])].filter(
			(c) => !c.closest('details'),
		);

	it('lays its values out as an inspector: a picker for each prop they are told apart by, then a row a value in its group', async () => {
		await analysed();
		const values = section('Styles')!;
		expect(values.querySelector('[data-values-from]')).toBeNull();
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
		expect(shownIn('height').map((c) => c.textContent)).toEqual(['Height28px']);
		await pick('size', 'lg');
		expect(shownIn('height').map((c) => c.textContent)).toEqual(['Height48px']);
		expect(shownIn('height')[0]?.querySelector('[data-value-kind]')).toBeNull();
	});

	const dotOf = (cell: Element | undefined) => cell?.querySelector('.color-dot') as HTMLElement;

	it('says nothing on a colour’s dot but the token’s name, in Values and in Tokens used: no hex, no line more, and nothing at all for a colour that is no token', async () => {
		await analysed();
		const dots = [...document.querySelectorAll<HTMLElement>('.color-dot')];
		expect(dots.some((d) => d.closest('[aria-label="Styles"]'))).toBe(true);
		expect(dots.some((d) => d.closest('[aria-label="Tokens"]'))).toBe(true);
		for (const d of dots) expect(d.title, d.getAttribute('aria-label') ?? '').toMatch(/^(|(Light|Dark) [A-Za-z ]+)$/);
	});

	it('says which token a value is by its name where its number would be, with where else it is used on hover; a colour is only its dot, whose hover is the token’s name; or its number, its own or not checked', async () => {
		await analysed();
		const radius = shownIn('radius')[0]?.querySelector('button') as HTMLElement;
		expect(radius.textContent).toBe('RadiusRadius');
		expect(radius.querySelector('.value-drawn')?.textContent).toBe('Radius');
		expect(radius.querySelector('.value-token')?.textContent).toBe('Radius');
		expect(radius.querySelector('.value-chip')).toBeNull();
		expect(radius.title).toContain('Radius · also FSIconButton, FSSplitButton');
		const [fill] = shownIn('background');
		expect(fill?.textContent).toBe('Background');
		expect(fill?.querySelector('.value-chip')).toBeNull();
		expect(fill?.querySelectorAll('[data-swatch]')).toHaveLength(1);
		expect(dotOf(fill).tagName).toBe('BUTTON');
		expect(dotOf(fill).getAttribute('aria-label')).toBe('Change Background · primary');
		expect(dotOf(fill).title).toBe('Light primary main');
		expect(dotOf(fill).getAttribute('aria-description')).toBe(dotOf(fill).title);
		expect((dotOf(fill).querySelector('[data-swatch]') as HTMLElement).style.backgroundColor).toBe('rgb(16, 128, 98)');
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
		expect(shownIn('text').map((c) => c.textContent)).toEqual(['Text color']);
		expect(dotOf(shownIn('text')[0]).title).toBe('Light primary main');
		await pick('variant', 'hover');
		expect(shownIn('text').map((c) => c.textContent)).toEqual(['Text color']);
		expect(dotOf(shownIn('text')[0]).hasAttribute('title')).toBe(false);
		const background = section('Styles')?.querySelector('[data-value-row="background"]') as HTMLElement;
		expect(background.hasAttribute('data-not-drawn')).toBe(true);
		expect(background.textContent).toBe('BackgroundNot drawn with this');
		expect(background.querySelector('[title]')?.getAttribute('title')).toContain('Nearest:');
		await pick('variant', 'plain');
		expect(shownIn('text').map((c) => c.textContent)).toEqual(['Text color']);
		expect(dotOf(shownIn('text')[0]).hasAttribute('title')).toBe(false);
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
		const toggle = section('Styles')?.querySelector('[data-picker="disabled"] [role="switch"]') as HTMLElement;
		expect(toggle.getAttribute('aria-checked')).toBe('false');
		expect(shownIn('background').map((c) => c.textContent)).toEqual(['Background']);
		expect(dotOf(shownIn('background')[0]).hasAttribute('title')).toBe(false);
		expect((dotOf(shownIn('background')[0]).querySelector('[data-swatch]') as HTMLElement).style.backgroundColor).toBe('rgb(16, 128, 98)');
		await press(toggle);
		expect(toggle.getAttribute('aria-checked')).toBe('true');
		expect((dotOf(shownIn('background')[0]).querySelector('[data-swatch]') as HTMLElement).style.backgroundColor).toBe('rgb(200, 200, 200)');
	});

	it('says a radius that makes its ends round as full, with no control, and the radii that are sizes as they are (Phase 5.5)', async () => {
		const rows = (analysis().values as { rows: { light: { property: string }[] } }).rows.light.filter((r) => r.property !== 'radius');
		const radius = {
			property: 'radius',
			by: 'shape',
			cells: [
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
		expect(shownIn('border').map((c) => c.textContent)).toEqual(['Border']);
		expect(dotOf(shownIn('border')[0]).hasAttribute('title')).toBe(false);
		const more = section('Styles')?.querySelector('[data-value-row="border"] details') as HTMLElement;
		expect(more.querySelector('summary')?.textContent).toBe('13 more');
		expect(more.querySelectorAll('[data-value-cell]')).toHaveLength(13);
		expect(more.querySelector('[data-value-cell]')?.textContent).toBe('13 instances');
		expect(dotOf(more.querySelector('[data-value-cell]') as Element).hasAttribute('title')).toBe(false);
	});

	it('shows dark’s values when dark is chosen in the panel, as the stories draw it there, and light’s again when light is', async () => {
		await analysed();
		const values = section('Styles')!;
		await share('mode', 'dark');
		expect([...values.querySelectorAll('[data-value-row]')].map((r) => r.getAttribute('data-value-row'))).toEqual(['height', 'background']);
		expect(shownIn('background').map((c) => c.textContent)).toEqual(['Background']);
		expect(dotOf(shownIn('background')[0]).title).toBe('Dark primary main');
		await share('mode', 'light');
		expect(values.querySelector('[data-value-row="radius"]')).not.toBeNull();
	});

	it('shows light when dark is chosen but its stories did not draw it, or drew it the same: never a dark that changes nothing', async () => {
		const light = (analysis().values as { rows: { light: object[] } }).rows.light;
		await analysed({ values: { ...(analysis().values as { rows: object }), rows: { light, dark: null } } });
		await share('mode', 'dark');
		// Light's rows: the radius row is in light and not in dark.
		expect(section('Styles')?.querySelector('[data-value-row="radius"]')).not.toBeNull();
		document.body.innerHTML = '';
		// A library DSNR cannot turn dark draws its light twice.
		await analysed({ values: { ...(analysis().values as { rows: object }), rows: { light, dark: light } } });
		await share('mode', 'dark');
		expect(section('Styles')?.querySelector('[data-value-row="radius"]')).not.toBeNull();
		expect(section('Styles')?.querySelector('[data-values-none]')).toBeNull();
	});

	it('says when a length it calls its own may be a token no tag could be given', async () => {
		await analysed();
		expect(section('Styles')?.querySelector('[data-values-unmarked]')).toBeNull();
		document.body.innerHTML = '';
		await analysed({ values: { ...(analysis().values as object), unmarked: 2 } });
		expect(section('Styles')?.querySelector('[data-values-unmarked]')?.textContent).toBe(
			'2 lengths in the design system are written in em or %, which cannot be marked, so a length said to be its own may be one of them.',
		);
	});

	it('says why it has no values when it only wraps what it is given, when its stories did not draw, and when reading them failed', async () => {
		const says = async (values: object) => {
			document.body.innerHTML = '';
			await analysed({ values });
			return section('Styles')?.textContent;
		};
		expect(await says({ state: 'wraps' })).toContain('Its stories draw it around other content');
		expect(await says({ state: 'not-drawn' })).toContain('Its stories did not finish drawing');
		expect(await says({ state: 'failed', error: 'No component here' })).toContain('Its values could not be read: No component here');
	});

	it('says why it has no values when its stories name no component', async () => {
		await analysed({ values: { state: 'no-component' } });
		expect(section('Styles')?.textContent).toContain('Its stories do not say which component they are of');
	});

	it('says why it has no values when its stories draw none of it', async () => {
		await analysed({ values: { state: 'none-drawn' } });
		expect(section('Styles')?.textContent).toContain('Its stories draw no FSButton on the page, so its values cannot be read.');
	});

	it('lists every token it draws with under Tokens, open, by category then group and set, with uses and who shares it', async () => {
		await analysed();
		const used = section('Tokens')!;
		expect(used.querySelector('details')).toBeNull();
		expect([...used.querySelectorAll('[data-token]')].map((t) => t.getAttribute('data-token'))).toEqual([
			'palette.light.primary.main',
			'palette.light.primary.contrastText',
			'palette.dark.primary.main',
			'radius',
			'spacing',
		]);
		expect([...used.querySelectorAll('[data-tokens-used]')].map((c) => c.getAttribute('data-tokens-used'))).toEqual(['Color', 'Shape', 'Spacing']);
		const color = used.querySelector('[data-tokens-used="Color"]') as HTMLElement;
		expect([...color.querySelectorAll('[data-token-group]')].map((g) => g.getAttribute('data-token-group'))).toEqual(['Light', 'Dark']);
		const primary = used.querySelector('[data-token="palette.light.primary.main"]') as HTMLElement;
		expect(primary.querySelector('[data-part="name"]')?.textContent).toBe('main');
		expect(primary.querySelector('[data-part="value"], [data-part="ref"]')).toBeNull();
		expect(primary.querySelectorAll('[data-swatch]')).toHaveLength(1);
		expect(dotOf(primary).title).toBe('Light primary main');
		const radius = used.querySelector('[data-token="radius"]') as HTMLElement;
		// Tab goes through a row's name (to its file) and then what opens its control: a length's value, a colour's dot; an info
		// icon between them is not a stop.
		expect([...radius.querySelectorAll('button')].map((b) => b.className)).toEqual(['token-name token-link', 'token-fill token-button']);
		expect([...primary.querySelectorAll('button')].map((b) => b.className.split(' ')[0])).toEqual(['token-name', 'color-dot']);
		expect(radius.querySelector('.info-tip')?.hasAttribute('tabindex')).toBe(false);
		expect(radius.querySelector('[data-part="name"]')?.textContent).toBe('radius');
		expect(radius.querySelector('[data-part="value"]')?.textContent).toBe('4px');
		expect(radius.querySelector('.info-tip')?.getAttribute('title')).toBe('5 uses · also FSIconButton, FSSplitButton');
		expect(radius.querySelector('.info-tip')?.getAttribute('aria-label')).toBe('5 uses · also FSIconButton, FSSplitButton');
		expect(used.querySelector('[data-token="spacing"] .info-tip')?.getAttribute('title')).toBe('4 uses · no other component');
		expect(radius.textContent).not.toMatch(/uses/);
	});

	it('opens a token’s own control from Tokens used, a colour’s as any other’s, as the panel’s row does, and closes it with its X', async () => {
		await analysed();
		for (const path of ['radius', 'palette.light.primary.main']) {
			await press(
				section('Tokens')!.querySelector(`[data-token="${path}"] button.token-button, [data-token="${path}"] button.color-dot`) as HTMLElement,
			);
			expect(dialog()).not.toBeNull();
			await press(button('Close', dialog()!));
			expect(dialog()).toBeNull();
		}
	});

	it('has no line of small print above its tokens: how far they reach is each token’s own info icon, not a paragraph', async () => {
		await analysed();
		const used = section('Tokens') as HTMLElement;
		expect(used.textContent).not.toMatch(/Shares its tokens|token uses in its stories/);
		expect(used.querySelector('p.quiet')).toBeNull();
	});

	it('lists what it sets itself under Tokens used, by kind with their uses, the first few, and keeps the rest to open', async () => {
		const colors = Array.from({ length: 10 }, (_, i) => ({ kind: 'color', value: `rgb(${i}, 0, 0)`, uses: 10 - i }));
		await analysed({ notTokens: [...colors, { kind: 'spacing', value: '13px', uses: 1 }] });
		const values = section('Tokens')?.querySelector('[data-own-values]') as HTMLElement;
		expect(values.querySelector('h3')?.textContent?.trim()).toBe('Set in the component itself');
		expect([...values.querySelectorAll('[data-not-token-kind]')].map((g) => g.getAttribute('data-not-token-kind'))).toEqual(['color', 'spacing']);
		const shown = (kind: string) =>
			[...values.querySelectorAll(`[data-not-token-kind="${kind}"] > ul > [data-not-token]`)].map((li) => li.textContent);
		expect(shown('color')).toHaveLength(8);
		expect(shown('color')[0]).toContain('rgb(0, 0, 0)');
		expect(shown('spacing')).toEqual(['13px1 use']);
		const more = values.querySelector('[data-not-token-kind="color"] details') as HTMLDetailsElement;
		expect(more.open).toBe(false);
		expect(more.querySelector('summary')?.textContent).toBe('Show 2 more');
		expect([...more.querySelectorAll('[data-not-token]')]).toHaveLength(2);
		await press(more.querySelector('summary') as HTMLElement);
		expect(more.open).toBe(true);
		expect(values.querySelector('h3 .info-tip')?.getAttribute('title')).toBe(
			'Not tokens, so they are changed in the design system, not here. 1 use is a shade worked out from a token, such as a hover’s darker color.',
		);
		expect(values.textContent).not.toMatch(/Not tokens, so|shade worked out/);
	});

	it('has no part for values it sets itself when it sets none', async () => {
		await analysed({ notTokens: [], derived: 0 });
		expect(section('Non-token values')).toBeNull();
	});

	it('says what axe found in a line, what it was checked with and what is left, and opens the findings in a dialog from a link', async () => {
		await analysed();
		const a11y = section('Accessibility')!;
		expect(a11y.querySelector('[data-accessibility-summary]')?.textContent).toBe('1 issue to fix');
		expect(a11y.textContent).toContain('axe-core 4.10 checked this against WCAG 2.2 AA. What is left is the manual checklist.');
		expect(a11y.textContent).toContain('Left to check by hand: 2.4.7');
		// What was checked and what is left to do: never what a check could not do, nor a pass.
		expect(a11y.textContent).not.toMatch(/could not|cannot|unable|not a pass|a person|automated/i);
		expect(a11y.querySelector('details')).toBeNull();
		const link = a11y.querySelector('button.link') as HTMLElement;
		expect(link.textContent).toBe('Show the findings');
		expect(a11y.textContent).not.toContain('Text needs more contrast');
		expect(dialog()).toBeNull();
		await press(link);
		const details = dialog('Accessibility findings')!;
		expect(details.getAttribute('aria-modal')).toBe('true');
		expect([...details.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['To fix', 'Best practice, beyond WCAG']);
		expect(details.textContent).toContain('Text needs more contrast');
		// What axe flagged for a closer look is not listed there: nothing is said in its place.
		expect(details.textContent).not.toContain('Check this attribute');
		expect(details.textContent).not.toMatch(/To review/);
		expect(details.textContent).toContain('WCAG 1.4.3');
		const elements = details.querySelector('[data-issue-elements="color-contrast"]') as HTMLElement;
		expect([...elements.querySelectorAll('li')].map((l) => l.textContent)).toEqual([
			'button.ghost > span: Fix any of the following: Element has insufficient color contrast of 3.1',
			'and 1 more element',
		]);
		// Best practice, apart and never counted: the summary above says only what WCAG's rules found.
		const best = details.querySelector('[aria-label="Best practice, beyond WCAG"]') as HTMLElement;
		expect(best.textContent).toContain('Heading levels should only increase by one');
		expect(best.querySelector('[data-issue-elements="heading-order"] code')?.textContent).toBe('h4');
		await press(button('Close', details));
		expect(dialog()).toBeNull();
		expect(a11y.querySelector('button.link')).not.toBeNull();
	});

	describe('saving the values tried where they are written (Phase 4)', () => {
		afterEach(() => void vi.useRealTimers());
		const SMALL = { property: 'height' as const, value: '32px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] };
		const tryingSmall = async () => {
			await analysed();
			await answer('storyPreview', { state: 'ready', base: BASE });
			await press(section('Styles')?.querySelector('[aria-label="Change Height · sm"]') as HTMLElement);
			await type(document.querySelector('input[type="range"][aria-label="Height"]') as HTMLInputElement, '32');
			await key('Escape');
		};

		it('changes a token’s value through the token’s own control, which every page shares, so it is saved as the panel’s changes are', async () => {
			await analysed();
			// The radius is the shared token's: its control is the token's, not a value of the component's own.
			await press(section('Styles')?.querySelector('[aria-label="Change Radius"]') as HTMLElement);
			const editor = dialog()!;
			expect(editor).not.toBeNull();
			expect(document.querySelector('[data-value-cell] [role="dialog"]')).toBeNull();
			const slider = editor.querySelector('input[type="range"]') as HTMLInputElement;
			await type(slider, '12');
			// Let go: a token's change is built, so it is made then, not as it moves.
			await act(async () => void slider.dispatchEvent(new Event('pointerup', { bubbles: true })));
			expect(calls('setTokenEdits').at(-1)?.args).toEqual([[{ path: 'radius', value: '12px' }]]);
			expect(section('Value changes')).toBeNull();
		});

		it('is not there with nothing tried and no branch, and asks for no value’s source', async () => {
			await analysed();
			expect(calls('valueSources')).toHaveLength(0);
			expect(callsOf('changeBranch', 'values').at(-1)?.args).toEqual(['values', BUTTON]);
			expect(changesLink().textContent).toBe('No changes');
			expect(changesLink().querySelector('button')).toBeNull();
		});

		it('counts what is tried as a link to the side panel’s Changes, where it is listed and saved, and opens nothing here', async () => {
			await tryingSmall();
			expect(changesLink().textContent).toBe('1 change');
			expect(dialog('Changes')).toBeNull();
			await press(changesLink().querySelector('button') as HTMLElement);
			expect(lastAsk()).toEqual(['openChanges', []]);
			expect(dialog('Changes')).toBeNull();
		});

		it('tells the extension what is tried, on the commit it is tried on, so every page has it', async () => {
			await tryingSmall();
			expect(calls('setValueTrial').at(-1)?.args).toEqual([BUTTON, 'abc123', [SMALL]]);
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
			await press(section('Styles')?.querySelector('[aria-label="Change Radius"]') as HTMLElement);
			const follow = document.querySelector('[data-value-cell] [role="dialog"] [data-value-follow="radius"]') as HTMLElement;
			expect(follow.textContent).toBe('Follow Radius');
			await press(follow);
			const asked = calls('writeValue').at(-1)?.args as [string, { follows: string; value: string }];
			expect(asked[0]).toBe(BUTTON);
			expect(asked[1]).toMatchObject({ property: 'radius', value: '4px', follows: 'radius' });
			expect(document.querySelector('[data-value-following]')?.textContent).toContain('Follows Radius');
		});

		it('offers no token to follow for a value no token has', async () => {
			await analysed();
			await press(section('Styles')?.querySelector('[aria-label="Change Height · sm"]') as HTMLElement);
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
			await press(section('Styles')?.querySelector('[aria-label="Change Radius"]') as HTMLElement);
			expect(document.querySelector('[data-value-cell] [role="dialog"]')).not.toBeNull();
			expect(document.querySelector('[data-value-follow]')).toBeNull();
		});

		it('puts back the values a branch saved when the tab opens with none tried', async () => {
			await analysed();
			await answer('storyPreview', { state: 'ready', base: BASE });
			expect(changesLink().textContent).toBe('No changes');
			await answerOf('changeBranch', 'values', { branch: 'dsnr/values-20261016-ab12', saved: [SMALL], saves: 1, pullRequest: null });
			expect(calls('setValueTrial').at(-1)?.args).toEqual([BUTTON, 'abc123', [SMALL]]);
			expect(changesLink().textContent).toBe('1 change');
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
		const printed = () => section('Styles')?.textContent ?? '';

		it('is asked for by the story file, and says nothing while it is being drawn', async () => {
			await analysed();
			expect(calls('componentVariants').at(-1)?.args).toEqual([BUTTON]);
			expect(printed()).not.toMatch(/Reading its props|drawing it with each/);
			expect(section('Every variant')).toBeNull();
		});

		it('offers a case only its props declare, shown from their drawing and never tried; and says what its story sets', async () => {
			await analysed();
			await answer('componentVariants', READY);
			const size = section('Styles')?.querySelector('[data-picker="size"] select') as HTMLSelectElement;
			expect([...size.options].map((o) => o.textContent)).toEqual(['sm', 'md', 'lg', 'xl', '2xl']);
			expect(shownIn('height')[0]?.querySelector('button')).not.toBeNull();
			await pick('size', '2xl');
			const height = shownIn('height')[0] as HTMLElement;
			expect(height.textContent).toBe('Height64px');
			expect(height.hasAttribute('data-still')).toBe(true);
			expect(height.querySelector('button')).toBeNull();
			expect(height.querySelector('[title]')?.getAttribute('title')).toContain('Drawn from its props');
			// What cannot be varied (children, sx, a callback) is not said: no one chooses between those.
			expect(printed()).not.toMatch(/Not varied|sets variant itself/);
			expect(section('Styles')?.querySelector('[data-picker="variant"] .info-tip')?.getAttribute('title')).toBe(
				'Its story sets this itself: drawn with another value, it draws as the story has it.',
			);
			expect(section('Styles')?.querySelector('[data-picker="size"] .info-tip')).toBeNull();
		});

		it('adds nothing when its stories name no component whose props can be read', async () => {
			await analysed();
			await answer('componentVariants', { state: 'none' });
			expect(section('Styles')?.querySelector('.info-tip')).toBeNull();
			const size = section('Styles')?.querySelector('[data-picker="size"] select') as HTMLSelectElement;
			expect([...size.options].map((o) => o.textContent)).toEqual(['sm', 'md', 'lg', 'xl']);
		});

		it('says nothing when it could not be drawn: the pickers its stories drew are all there is, and no line says why', async () => {
			await analysed();
			await answer('componentVariants', { state: 'failed', error: 'Its story did not draw with its props changed.' });
			expect(printed()).not.toMatch(/could not be drawn|did not draw with its props/);
			expect(section('Styles')?.querySelectorAll('[data-picker]').length).toBeGreaterThan(0);
		});
	});

	describe('what a token change moves (Phase 3)', () => {
		it('is not drawn here, even while a token change is tried: it is in the side panel’s Changes, and in the token’s own control', async () => {
			await analysed();
			expect(section('Moved by the change')).toBeNull();
			await share('tokenEdits', [{ path: 'tone.pineGreen.50', value: '#C80000' }]);
			expect(section('Moved by the change')).toBeNull();
			expect(calls('changeReach')).toHaveLength(0);
		});
	});

	describe('trying its values in its stories (Phase 2)', () => {
		const tryingOpen = async (over: Record<string, unknown> = {}) => {
			await analysed(over);
			await answer('storyPreview', { state: 'ready', base: BASE });
			const frame = document.querySelector('iframe.story-frame') as HTMLIFrameElement;
			const told = vi.spyOn(frame.contentWindow as Window, 'postMessage');
			const tried = () => told.mock.calls.map(([m]) => (m as Record<string, unknown>)[PREVIEW_TRY]).at(-1);
			return { frame, told, tried };
		};
		const values = () => section('Styles') as HTMLElement;
		const change = (label: string) => values().querySelector(`[aria-label="Change ${label}"]`) as HTMLElement;
		const popover = () => values().querySelector('[data-value-cell] [role="dialog"]') as HTMLElement | null;
		const editor = () => (popover()?.querySelector('[data-value-editor]') as HTMLElement | null | undefined) ?? null;
		const slider = (label: string) => popover()?.querySelector(`input[type="range"][aria-label="${label}"]`) as HTMLInputElement;
		const pressElsewhere = () => act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));

		it('moves nothing when a value is tried: the column is as it was, and only the count in its header changes', async () => {
			const { tried } = await tryingOpen();
			const column = document.querySelector('.component-aside') as HTMLElement;
			const first = column.firstElementChild;
			const count = changesLink();
			expect(count.textContent).toBe('No changes');
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
			expect(count.querySelector('button')).not.toBeNull();
			expect(count.nextElementSibling).toBe(after);
			// A token change being tried moves its stories too, so it is counted here as well; and still nothing is put in the column.
			await share('tokenEdits', [{ path: 'radius', value: '12px' }]);
			expect(count.textContent).toBe('2 changes');
			expect(column.firstElementChild).toBe(first);
			expect(document.querySelector('.tab')?.textContent).not.toContain('Showing the change being tried');
		});

		it('opens a value of its own as a slider, tries it on the instances that draw it as it moves, and marks it tried', async () => {
			const { tried } = await tryingOpen();
			await press(change('Height · sm'));
			expect(popover()?.getAttribute('aria-label')).toBe('Height · sm');
			expect(editor()?.textContent).toBe('Height · sm28px');
			await type(slider('Height'), '30');
			// Told at once, without letting go: nothing is built for a value of its own.
			expect(tried()).toEqual([{ property: 'height', value: '30px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] }]);
			const cell = values().querySelector('[data-value-row="height"] [data-tried]') as HTMLElement;
			expect(cell.querySelector('.value-cell')?.textContent).toBe('Height30px');
			expect(cell.querySelector('[data-changed-mark]')).not.toBeNull();
			expect(changesLink().textContent).toBe('1 change');
		});

		it('is a small popover under its value, not a dialog over the panel: no scrim, the button says it is open', async () => {
			await tryingOpen();
			const opener = change('Height · sm');
			expect(opener.getAttribute('aria-expanded')).toBe('false');
			expect(popover()).toBeNull();
			await press(opener);
			expect(opener.getAttribute('aria-expanded')).toBe('true');
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
			await key('Escape');
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
			await key('Escape');
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
			await key('Escape');
			await share('valueTrials', {});
			expect(tried()).toEqual([]);
			expect(values().querySelector('[data-tried]')).toBeNull();
			// Its instances are named by its drawing on a commit: what was tried on another is not this one's.
			const tall = { property: 'height' as const, value: '40px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] };
			await share('valueTrials', { [BUTTON]: { commit: 'def456', values: [tall] } });
			expect(tried()).toEqual([]);
			await share('valueTrials', { [BUTTON]: { commit: 'abc123', values: [tall] } });
			expect(tried()).toEqual([tall]);
		});

		it('puts a value back with Reset, and counts each value tried as a change; Reset all is in the side panel’s Changes', async () => {
			const { tried } = await tryingOpen();
			await press(change('Height · sm'));
			await type(slider('Height'), '30');
			await press(button('Reset'));
			expect(tried()).toEqual([]);
			expect(values().querySelector('[data-tried]')).toBeNull();
			await type(slider('Height'), '31');
			await pick('size', 'md');
			await press(change('Height · md'));
			expect(values().querySelectorAll('[data-value-cell] [role="dialog"]')).toHaveLength(1);
			await type(slider('Height'), '40');
			expect(tried()).toHaveLength(2);
			await key('Escape');
			expect(changesLink().textContent).toBe('2 changes');
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

		it('lists in a token’s control the components that draw with it under one line that is closed until pressed, each opening its tab, and marks those the change being tried moves', async () => {
			await tryingOpen();
			await press(change('Radius'));
			expect(calls('tokenUsers').at(-1)?.args).toEqual(['radius']);
			await answer('tokenUsers', {
				state: 'ready',
				users: [
					{ file: BUTTON, uses: 5, values: 1 },
					{ file: STORY('FSIconButton'), uses: 2, values: 0 },
				],
			});
			const users = () => [...document.querySelectorAll('[role="dialog"] [data-token-user]')] as HTMLElement[];
			const summary = () => document.querySelector('[data-token-users-summary]')?.textContent;
			const list = () => document.querySelector('[role="dialog"] .token-users details') as HTMLDetailsElement;
			expect(summary()).toBe('Shared with 2 components');
			expect(list().open).toBe(false);
			expect(list().querySelector('summary')?.lastElementChild?.classList.contains('collapse-chevron-end')).toBe(true);
			await press(list().querySelector('summary') as HTMLElement);
			expect(list().open).toBe(true);
			expect(users().map((u) => u.textContent)).toEqual(['FSButton1 value', 'FSIconButtoninside']);
			await press(users()[1]?.querySelector('button') as HTMLElement);
			expect(lastAsk()).toEqual(['openComponent', [STORY('FSIconButton')]]);
			await share('tokenEdits', [{ path: 'radius', value: '12px' }]);
			expect(calls('changeReach').at(-1)?.args).toEqual([[{ path: 'radius', value: '12px' }]]);
			expect(summary()).toBe('Shared with 2 components · drawing the change to see which move');
			await answer('changeReach', {
				state: 'ready',
				moved: [{ file: STORY('FSIconButton'), changes: [], inside: true }],
				unchanged: 1,
				notDrawn: [],
			});
			expect(users().map((u) => u.hasAttribute('data-moved'))).toEqual([false, true]);
			expect(users()[1]?.textContent).toBe('FSIconButtoninside · moved');
			expect(summary()).toBe('Shared with 2 components · 1 moved with the change being tried');
			expect(list().open).toBe(true);
		});

		it('names the parts of a padding written with three or four as CSS reads them, X and Y only where two sides share a part, each slider changing its own', async () => {
			const rows = (analysis().values as { rows: { light: unknown[] } }).rows.light;
			const padding = (value: string) => ({
				property: 'padding',
				by: null,
				cells: [{ variant: null, value, kind: 'own', tokens: [], instances: 2 }],
			});
			const openPadding = async (value: string) => {
				const { tried } = await tryingOpen({
					values: { state: 'read', instances: 2, unmarked: 0, rows: { light: [...rows, padding(value)], dark: null } },
				});
				await press(change('Padding'));
				return tried;
			};
			const shown = () => [...(popover()?.querySelectorAll('.popover-label') ?? [])].map((l) => l.textContent);
			const three = await openPadding('1px 2px 3px');
			expect(shown()).toEqual(['Top', 'X', 'Bottom']);
			await type(slider('X (left and right)'), '9');
			expect((three() as { value: string }[])[0]?.value).toBe('1px 9px 3px 9px');
			await unmount();
			const four = await openPadding('1px 2px 3px 4px');
			expect(shown()).toEqual(['Top', 'Right', 'Bottom', 'Left']);
			await type(slider('Left'), '8');
			expect((four() as { value: string }[])[0]?.value).toBe('1px 2px 3px 8px');
			await unmount();
			await openPadding('4px');
			expect(shown()).toEqual([]);
			expect(slider('All sides')).not.toBeNull();
		});

		it('gives each part of a value written with several its own slider, and a colour its picker and hex', async () => {
			const rows = (analysis().values as { rows: { light: unknown[] } }).rows.light;
			const padding = { property: 'padding', by: null, cells: [{ variant: null, value: '0px 10px', kind: 'own', tokens: [], instances: 12 }] };
			const { tried } = await tryingOpen({ values: { state: 'read', instances: 12, unmarked: 0, rows: { light: [...rows, padding], dark: null } } });
			await press(change('Padding'));
			// X first, as engineers say it.
			expect([...(popover()?.querySelectorAll('input[type="range"]') ?? [])].map((r) => r.getAttribute('aria-label'))).toEqual([
				'X (left and right)',
				'Y (top and bottom)',
			]);
			const labels = [...(popover()?.querySelectorAll<HTMLElement>('.popover-label') ?? [])];
			expect(labels.map((l) => [l.textContent, l.title])).toEqual([
				['X', 'Left and right'],
				['Y', 'Top and bottom'],
			]);
			expect([...(popover()?.querySelectorAll('.popover-field') ?? [])].every((f) => f.classList.contains('popover-field-line'))).toBe(true);
			await type(slider('X (left and right)'), '12');
			expect(tried()).toEqual([
				{ property: 'padding', value: '0px 12px 0px 12px', targets: Array.from({ length: 12 }, (_, i) => `padding:null:${i}`) },
			]);
			expect(values().querySelector('[data-value-row="padding"] [data-tried] .value-drawn')?.textContent).toBe('0px 12px');
			// Made one value by the drag, its two parts stay two sliders, so it can be split again.
			await type(slider('X (left and right)'), '0');
			expect([...(popover()?.querySelectorAll('input[type="range"]') ?? [])].map((r) => r.getAttribute('aria-label'))).toEqual([
				'X (left and right)',
				'Y (top and bottom)',
			]);
			await type(slider('X (left and right)'), '12');
			await pick('variant', 'ghost');
			await press(change('Background · ghost'));
			const hex = popover()?.querySelector('input[aria-label="Hex"]') as HTMLInputElement;
			expect(hex).not.toBeNull();
			await type(hex, '#123456');
			await key('Enter', { on: hex });
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
		expect(section('Accessibility')!.querySelector('details, button.link')).toBeNull();
		expect(section('Accessibility')!.querySelector('[data-accessibility-summary]')?.textContent).toBe('No issues found');
	});

	it('says nothing of what axe flagged for a closer look when that is all it has: no issue to fix, no link to an empty dialog', async () => {
		const flagged = (analysis().accessibility as { incomplete: unknown[] }).incomplete;
		expect(flagged.length).toBeGreaterThan(0);
		await analysed({
			accessibility: {
				violations: [],
				incomplete: flagged,
				bestPractice: { violations: [], incomplete: [] },
				notAutomated: [],
				ran: { axe: '4.10', target: 'WCAG 2.2 AA', states: ['default'] },
			},
		});
		const a11y = section('Accessibility')!;
		expect(a11y.querySelector('[data-accessibility-summary]')?.textContent).toBe('No issues found');
		expect(a11y.querySelector('button.link')).toBeNull();
		expect(a11y.textContent).not.toMatch(/review/i);
	});

	it('says it is finding them while the first reading is drawn, with none of the parts yet', async () => {
		await open();
		await answer('componentTokens', { state: 'building' });
		expect(document.querySelector('.component-aside')?.textContent).toContain('Finding the tokens FSButton draws with');
		expect(section('Made from')).toBeNull();
	});

	it('says, when the design system cannot be read here, that the panel says why, and reads it again on Try again', async () => {
		await mountPage(createElement(ComponentTab, { id: BUTTON }));
		await shareCatalog({ state: 'no-branch', root: '/work/lib', branch: 'develop' });
		expect(document.querySelector('.empty')?.textContent).toContain('The design system cannot be read here: the DSNR panel says why.');
		await press(button('Try again'));
		expect(lastAsk()).toEqual(['syncDesignSystem', []]);
		await shareCatalog(SAMPLE_CATALOG);
		expect(document.querySelector('.heading-page')?.textContent).toBe('FSButton');
	});

	it('says why it could not be read, with Try again', async () => {
		await mountPage(createElement(PrimitivesTab));
		await share('catalog', { system: null, catalog: null, error: 'git could not read it.', syncing: false });
		expect(document.querySelector('.empty')?.textContent).toContain('git could not read it.');
		await press(button('Try again'));
		expect(lastAsk()).toEqual(['syncDesignSystem', []]);
	});

	it('says when the design system shown no longer has it', async () => {
		await mountPage(createElement(ComponentTab, { id: 'src/Gone.stories.tsx' }));
		await shareCatalog(SAMPLE_CATALOG);
		expect(document.querySelector('.empty')?.textContent).toBe('The design system shown no longer has this component. Close this tab.');
	});
});

describe('the Primitives tab', () => {
	const open = async () => {
		await mountPage(createElement(PrimitivesTab));
		await shareCatalog(SAMPLE_CATALOG);
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
		await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
		expect(document.querySelector('.tab')?.textContent).toContain('Showing the change being tried in the panel (1 token).');
	});
});
