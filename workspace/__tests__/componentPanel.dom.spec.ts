import { act, createElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComponentPanel } from '../src/renderer/ComponentPanel';
import { TokenChangesProvider, useTokenChangesFor } from '../src/renderer/tokenChanges';
import type { CatalogComponent, ComponentTokens, DesignToken, TokenEdit } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';
import { undeclared } from '../src/shared/wcag';

/**
 * The side panel's Component view (T6 of the design system plan): the tokens the open component draws with, as the
 * tokens panel's own rows, who else shares each, and what it sets itself. Against a fake app.
 */

const component = (name: string, group = 'Buttons'): CatalogComponent => ({
	id: `src/components/${name}/${name}.stories.tsx`,
	name,
	group,
	subtitle: null,
	storybook: null,
	source: '',
});
const BUTTON = component('FSButton');
const COMPONENTS = [BUTTON, component('FSCard', 'Surfaces'), component('FSTextField', 'Inputs'), component('FSTabs'), component('FSChip')];
const color = (path: string, group: string, set: string, name: string, value: string): DesignToken => ({
	path,
	kind: 'color',
	category: 'Color',
	group,
	set,
	name,
	value,
	source: { file: 'src/theme.ts', line: 3 },
});
const TOKENS: DesignToken[] = [
	color('palette.light.primary.main', 'Light', 'primary', 'main', '#108062'),
	color('palette.dark.primary.main', 'Dark', 'primary', 'main', '#80D6B9'),
	{
		path: 'radius',
		kind: 'dimension',
		category: 'Shape',
		group: 'Radius',
		set: 'radius',
		name: 'base',
		value: '8px',
		source: { file: 'src/utils/theme.ts', line: 5 },
	},
];
const READY: ComponentTokens = {
	state: 'ready',
	uses: [
		{ path: 'radius', uses: 73 },
		{ path: 'palette.light.primary.main', uses: 48 },
		{ path: 'palette.dark.primary.main', uses: 40 },
	],
	sharedWith: {
		radius: [COMPONENTS[1], COMPONENTS[2], COMPONENTS[3], COMPONENTS[4]].map((c) => (c as CatalogComponent).id),
		'palette.light.primary.main': [(COMPONENTS[3] as CatalogComponent).id],
		'palette.dark.primary.main': [],
	},
	notTokens: [
		{ kind: 'color', value: 'rgba(0, 0, 0, 0.87)', uses: 22 },
		{ kind: 'spacing', value: '16px', uses: 41 },
	],
	derived: 7,
	accessibility: {
		ran: { axe: '4.14.0', tags: ['wcag2a'], target: 'WCAG 2.0 Level A', declared: true, at: '2026-10-10T00:00:00.000Z', states: ['default'] },
		violations: [
			{
				rule: 'button-name',
				help: 'Buttons must have discernible text',
				impact: 'critical',
				criteria: ['4.1.2'],
				nodes: 2,
				url: 'https://x',
				states: ['default'],
			},
		],
		incomplete: [],
		notAutomated: [],
	},
};

const NO_TARGET = undeclared('Acme has no .dsnr/manifest.md');
let current: Awaited<ReturnType<typeof render>> | null = null;
let made: TokenEdit[][] = [];
let app: ReturnType<typeof fakeApp>;
const Tab = () => {
	const [edits, setEdits] = useState<TokenEdit[]>([]);
	const changes = useTokenChangesFor(TOKENS, edits, (e) => (made.push(e), setEdits(e)), NO_TARGET);
	return createElement(TokenChangesProvider, { value: changes }, createElement(ComponentPanel, { component: BUTTON, components: COMPONENTS }));
};
const show = async (answer: () => Promise<unknown>) => {
	made = [];
	app = fakeApp({ componentTokens: answer });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Tab));
	await settle();
};
const text = () => document.body.textContent ?? '';
const row = (path: string) => document.querySelector<HTMLElement>(`[data-token="${path}"]`);
afterEach(async () => {
	vi.useRealTimers();
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the component view', () => {
	it('says it is finding the tokens while every story is drawn, and asks again until it has them', async () => {
		// Time still passes, so the page settles; the panel's three seconds are skipped.
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const answers = [ok({ state: 'building' }), ok(READY)];
		await show(async () => answers.shift() ?? ok(READY));
		expect(text()).toContain('Finding the tokens FSButton draws with…');
		expect(app.calls.componentTokens).toEqual([[BUTTON.id]]);
		await act(async () => void vi.advanceTimersByTime(3000));
		await settle();
		expect(app.calls.componentTokens).toHaveLength(2);
		expect(text()).toContain('Made from');
	});

	it('lists what it is made from as the tokens panel’s own rows, by category, the most drawn first', async () => {
		await show(async () => ok(READY));
		const categories = [...document.querySelectorAll('[data-made-from]')].map((c) => c.getAttribute('data-made-from'));
		expect(categories).toEqual(['Shape', 'Color']);
		expect([...document.querySelectorAll('[data-made-from="Color"] p')].map((p) => p.textContent)).toEqual(['Light', 'Dark']);
		expect(row('radius')?.querySelector('button')?.getAttribute('aria-label')).toBe('Change Radius base');
	});

	it('says under each token how often it is drawn and which other components share it', async () => {
		await show(async () => ok(READY));
		expect(row('radius')?.querySelector('[data-token-use]')?.textContent).toBe('73 uses · also FSCard, FSTextField, FSTabs and 1 more');
		expect(row('palette.light.primary.main')?.querySelector('[data-token-use]')?.textContent).toBe('48 uses · also FSTabs');
		expect(row('palette.dark.primary.main')?.querySelector('[data-token-use]')?.textContent).toBe('40 uses · no other component');
		// Every one, when the row names only a few.
		expect(row('radius')?.querySelector('[data-token-use]')?.getAttribute('title')).toBe('FSCard\nFSTextField\nFSTabs\nFSChip');
	});

	it('changes a token, not the component: its row opens the same editor, and the change is the tab’s', async () => {
		await show(async () => ok(READY));
		await press(row('palette.light.primary.main')?.querySelector('button') as HTMLElement);
		await settle();
		const picker = document.querySelector('[data-token-editor="palette.light.primary.main"] input[type="color"]') as HTMLInputElement;
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(picker, '#000000');
			picker.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await settle();
		expect(made.at(-1)).toEqual([{ path: 'palette.light.primary.main', value: '#000000' }]);
		expect(row('palette.light.primary.main')?.textContent).toContain('#000000');
	});

	it('lists what the component sets itself, and how much is a shade worked out from a token', async () => {
		await show(async () => ok(READY));
		const section = document.querySelector('[aria-label="Not tokens"]') as HTMLElement;
		expect([...section.querySelectorAll('[data-not-token]')].map((li) => li.textContent)).toEqual([
			'colorrgba(0, 0, 0, 0.87)22 uses',
			'spacing16px41 uses',
		]);
		expect(section.textContent).toContain('7 uses are shades worked out from a token');
	});

	it('says what axe found in its stories at the library’s target, in the words used everywhere, and never a pass (T7)', async () => {
		await show(async () => ok(READY));
		const section = document.querySelector('[aria-label="Accessibility"]') as HTMLElement;
		expect(section.querySelector('[data-accessibility-summary]')?.textContent).toBe('1 automated issue');
		expect(section.textContent).toContain('Checked with axe-core 4.14.0 at WCAG 2.0 Level A');
		expect(section.textContent).toContain('Buttons must have discernible text');
		expect(section.textContent).toContain('WCAG 4.1.2 · critical · 2 elements');
		expect(section.textContent).toContain('this is not a pass');
	});

	it('says a component was not checked when its check did not come back, rather than that it has no issues', async () => {
		await show(async () => ok({ ...READY, accessibility: null }));
		const section = document.querySelector('[aria-label="Accessibility"]') as HTMLElement;
		expect(section.textContent).toContain('Not checked');
		expect(section.textContent).not.toContain('No issues');
	});

	it('says when a component draws with none of the library’s tokens', async () => {
		await show(async () => ok({ state: 'ready', uses: [], sharedWith: {}, notTokens: [], derived: 0, accessibility: null }));
		expect(text()).toContain('FSButton draws with none of the library’s tokens.');
		expect(document.querySelector('[aria-label="Not tokens"]')).toBeNull();
	});

	it('says why the tokens could not be found, and tries again', async () => {
		const answers = [fail('The previews could not be built.'), ok(READY)];
		await show(async () => answers.shift());
		expect(text()).toContain('The previews could not be built.');
		await press(button('Try again'));
		await settle();
		expect(text()).toContain('Made from');
	});
});
