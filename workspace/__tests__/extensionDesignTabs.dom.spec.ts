import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ComponentTab } from '../extension/webview/ComponentTab';
import { PrimitivesTab } from '../extension/webview/PrimitivesTab';
import { readTab } from '../extension/webview/tab';
import { PREVIEW_HEIGHT, previewAddress } from '../src/shared/catalog';
import { SAMPLE_CATALOG } from './extensionSamples';
import { answer, button, calls, mount, press, say, sent } from './webviewHarness';

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
		await press(button('Source'));
		expect(sent.at(-1)).toEqual({ type: 'component-link', id: BUTTON, link: 'source' });
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
	const analysis = (over: Record<string, unknown> = {}) => ({
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
				},
			],
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
	const analysed = async (over: Record<string, unknown> = {}) => {
		await open();
		await answer('componentTokens', analysis(over));
	};
	const section = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;

	it('reads in six parts, in an order that goes from what it is made of to what is wrong with it', async () => {
		await analysed();
		expect([...document.querySelectorAll('.component-aside > [aria-label]')].map((e) => e.getAttribute('aria-label'))).toEqual([
			'Values',
			'Made from',
			'Color tokens',
			'Usage',
			'Non-token values',
			'Accessibility',
		]);
		// The sixth, its name and links, is the header above.
		expect(document.querySelector('.tab-title')?.textContent).toBe('FSButton');
	});

	it('lists its drawn values first, by variant, said as its stories draw them on the version shown', async () => {
		await analysed();
		const values = section('Values')!;
		expect(values.querySelector('[data-values-from]')?.textContent).toBe('As its stories draw it, in light: 12 instances, on develop at abc123.');
		// Light until dark is chosen, as a prototype opens.
		expect(values.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('Light');
		expect([...values.querySelectorAll('[data-value-row]')].map((r) => r.getAttribute('data-value-row'))).toEqual([
			'height',
			'radius',
			'background',
			'fontSize',
		]);
		const height = values.querySelector('[data-value-row="height"]') as HTMLElement;
		expect(height.querySelector('h3')?.textContent).toBe('Height · by sizeIts own');
		expect([...height.querySelectorAll('[data-value-cell]')].map((c) => c.textContent)).toEqual(['sm28px', 'md36px', 'lg48px', 'xl56px']);
		// What a row's values are is said once when they are all one kind, not on each.
		expect(height.querySelectorAll('[data-value-cell] [data-value-kind]')).toHaveLength(0);
	});

	it('says which token a value is and which other components share it, or that it is its own, or that it was not checked', async () => {
		await analysed();
		const values = section('Values')!;
		expect(values.querySelector('[data-value-row="radius"] h3 [data-value-kind="token"]')?.textContent).toBe(
			'Radius · also FSIconButton, FSSplitButton',
		);
		// Values of different kinds in one row each say what they are; a colour that draws nothing is said as none.
		// A value that draws nothing is said as none, with no swatch and nothing said of what it is: the rest of its row is one
		// kind, said once on the row.
		const background = values.querySelector('[data-value-row="background"]') as HTMLElement;
		expect([...background.querySelectorAll('[data-value-cell]')].map((c) => c.textContent)).toEqual(['primaryrgb(16, 128, 98)', 'ghostnone']);
		expect(background.querySelector('h3 [data-value-kind="token"]')?.textContent).toBe('Light primary main · also FSIconButton');
		expect(values.querySelector('[data-value-row="fontSize"] [data-value-kind="unchecked"]')?.textContent).toBe('Not checked');
	});

	it('shows dark’s values when dark is chosen, as the stories draw it there, and light’s again when light is', async () => {
		await analysed();
		const values = section('Values')!;
		const radio = (label: string) => [...values.querySelectorAll('[role="radio"]')].find((b) => b.textContent === label) as HTMLElement;
		await press(radio('Dark'));
		expect(values.querySelector('[data-values-from]')?.textContent).toContain('in dark:');
		expect([...values.querySelectorAll('[data-value-row]')].map((r) => r.getAttribute('data-value-row'))).toEqual(['height', 'background']);
		const background = values.querySelector('[data-value-row="background"]') as HTMLElement;
		expect([...background.querySelectorAll('[data-value-cell]')].map((c) => c.textContent)).toEqual(['primaryrgb(43, 180, 138)', 'ghostnone']);
		expect(background.querySelector('h3 [data-value-kind="token"]')?.textContent).toContain('Dark primary main');
		await press(radio('Light'));
		expect(values.querySelector('[data-values-from]')?.textContent).toContain('in light:');
		expect(values.querySelector('[data-value-row="radius"]')).not.toBeNull();
	});

	it('says a mode its stories did not draw is not read, and still shows the other', async () => {
		await analysed({
			values: {
				...(analysis().values as { rows: object }),
				rows: { light: (analysis().values as { rows: { light: object[] } }).rows.light, dark: null },
			},
		});
		const values = section('Values')!;
		await press([...values.querySelectorAll('[role="radio"]')].find((b) => b.textContent === 'Dark') as HTMLElement);
		expect(values.querySelector('[data-values-none="dark"]')?.textContent).toBe(
			'Its stories did not draw it in dark, so its values there cannot be read.',
		);
		expect(values.querySelector('[data-value-row]')).toBeNull();
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

	it('breaks what it is made from down by kind, compactly, apart from its colours, with each token’s uses and who shares it', async () => {
		await analysed();
		const made = section('Made from')!;
		expect([...made.querySelectorAll('[data-made-from]')].map((c) => c.getAttribute('data-made-from'))).toEqual(['Shape', 'Spacing']);
		const radius = made.querySelector('[data-token="radius"]') as HTMLElement;
		expect(radius.querySelector('[data-part="name"]')?.textContent).toBe('radius');
		expect(radius.querySelector('[data-part="value"]')?.textContent).toBe('4px');
		expect(radius.querySelector('[data-token-use]')?.textContent).toBe('5 uses · also FSIconButton, FSSplitButton');
		expect(made.querySelector('[data-token="spacing"] [data-token-use]')?.textContent).toBe('4 uses · no other component');
		// A colour is in Color tokens, not here.
		expect(made.querySelector('[data-token^="palette"]')).toBeNull();
	});

	it('opens a token’s own control from Made from, as the panel’s row does, and closes it with its X', async () => {
		await analysed();
		await press(section('Made from')!.querySelector('[data-token="radius"] button.token-button') as HTMLElement);
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		await press(document.querySelector('[role="dialog"] [aria-label="Close"]') as HTMLElement);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('shows the colours it draws with as the semantic tokens do: each role’s variants, Light and Dark side by side, a swatch that opens its control', async () => {
		await analysed();
		const colors = section('Color tokens')!;
		expect([...colors.querySelectorAll('[data-theme-heading]')].map((h) => h.textContent)).toEqual(['Light', 'Dark']);
		const primary = colors.querySelector('[data-token-set="primary"]') as HTMLElement;
		expect([...primary.querySelectorAll('[data-token-row]')].map((r) => r.getAttribute('data-token-row'))).toEqual(['main', 'contrastText']);
		// Both themes of a variant on one row; a variant it draws in one theme only has a dash for the other.
		expect(primary.querySelectorAll('[data-token-row="main"] [data-token]')).toHaveLength(2);
		expect(primary.querySelectorAll('[data-token-row="contrastText"] [data-token]')).toHaveLength(1);
		await press(colors.querySelector('[data-token="palette.light.primary.main"] button') as HTMLElement);
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it('says in two numbers how far its tokens reach: the components that share them, and how often it uses them', async () => {
		await analysed();
		const usage = section('Usage')!;
		expect(usage.querySelector('[data-usage="sharing"]')?.textContent).toBe('Shares its tokens with2 components');
		expect(usage.querySelector('[data-usage="uses"]')?.textContent).toBe('Token uses15 uses');
	});

	it('groups the values it sets itself by kind with their uses, lists the first few, and keeps the rest to open', async () => {
		const colors = Array.from({ length: 10 }, (_, i) => ({ kind: 'color', value: `rgb(${i}, 0, 0)`, uses: 10 - i }));
		await analysed({ notTokens: [...colors, { kind: 'spacing', value: '13px', uses: 1 }] });
		const values = section('Non-token values')!;
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
	});

	it('has no findings to open when axe found nothing', async () => {
		await analysed({
			accessibility: { violations: [], incomplete: [], notAutomated: [], ran: { axe: '4.10', target: 'WCAG 2.2 AA', states: ['default'] } },
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
