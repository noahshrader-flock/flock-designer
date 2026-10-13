// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DesignSystem } from '../src/renderer/DesignSystem';
import { undeclared } from '../src/shared/wcag';
import { TOKEN_PROBLEM } from './fixtures';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import type { Catalog, CatalogComponent, CatalogUpdate, DesignTokens } from '../src/shared/contract';
import {
	button,
	chooseTab,
	dialog,
	fail,
	fakeApp,
	menuItem,
	ok,
	openMenu,
	press,
	render,
	settle,
	tab,
	typeInto,
	unmountAll,
	alertParts,
} from './reviewHarness';

/**
 * The Design System tab (S3 of the design system plan): the design system's own row, its views as tabs, the components as a
 * grouped list, and the side panel, against a fake app.
 */

/** A component as the catalog gives it: one story file, as Storybook lists it. */
const component = (name: string, more: Partial<CatalogComponent> = {}): CatalogComponent => ({
	id: `src/components/${name}/${name}.stories.tsx`,
	name,
	group: 'Buttons',
	subtitle: null,
	storybook: `https://sb.example/${name}`,
	source: `https://github.com/x/${name}`,
	...more,
});

const COMPONENTS: CatalogComponent[] = [
	component('FSButton', { subtitle: 'Buttons allow users to take actions.' }),
	component('FSCard', { group: 'Surfaces', subtitle: 'Cards contain content.' }),
	component('FSCardHeader', { group: 'Surfaces' }),
	component('PopoverHeader', { id: 'src/compositeComponents/FSPopovers/a.stories.tsx', group: 'Popovers' }),
	component('Loose', { group: 'Ungrouped', storybook: null }),
];

const TOKENS: DesignTokens = {
	source: 'theme files',
	looked: [],
	problems: [],
	tokens: [
		{
			path: 'tone.pineGreen.50',
			kind: 'color',
			category: 'Color',
			group: 'Tones',
			set: 'pineGreen',
			name: '50',
			value: '#108062',
			source: { file: 'src/colors/tones/pineGreen.ts', line: 3 },
		},
	],
};

const ready = (update: CatalogUpdate = 'unchanged', components = COMPONENTS): Catalog => ({
	state: 'ready',
	branch: 'develop',
	commit: 'fc2658f0123456789',
	committedAt: '2026-10-07T19:03:13Z',
	update,
	components,
	tokens: TOKENS,
	accessibility: undeclared('FUI has no .dsnr/manifest.md'),
});

/** The design systems connected (P4): FUI, by its Storybook's brand, and a second one. */
const FUI_SYSTEM = {
	id: 'flocksafety/flock-react-component-lib',
	name: 'Flock React Component Lib',
	repository: 'flocksafety/flock-react-component-lib',
	root: '/h/GitHub/flock-react-component-lib',
	folder: '',
	branch: 'develop',
};
const ACME = { id: 'acme/acme:packages/ui', name: 'Acme UI', repository: 'acme/acme', root: '/h/GitHub/acme', folder: 'packages/ui', branch: 'main' };
const SYSTEMS = { systems: [FUI_SYSTEM, ACME], current: FUI_SYSTEM.id };
const switcher = (name = FUI_SYSTEM.name) => button(`Design system ${name}: switch design system`);
/** The design system's own row, first under the top bar: the switcher's own. */
const systemRow = () => switcher().closest('[data-toolbar]') as HTMLElement;

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (
	answers: (refresh: boolean) => ReturnType<typeof ok<Catalog>> | ReturnType<typeof fail>,
	hidden = false,
	more: Record<string, (...a: never[]) => unknown> = {},
) => {
	const app = fakeApp({
		designSystemCatalog: async (refresh: boolean) => answers(refresh),
		designSystems: async () => ok(SYSTEMS),
		storyPreview: async () => ok({ state: 'ready', base: 'http://127.0.0.1:1/p/' }),
		...more,
	});
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(DesignSystem, { hidden }));
	return app;
};
/** A row's component, by the name it shows. */
const nameOf = (li: Element) => li.querySelector('.font-medium')?.textContent ?? '';
const rows = () => [...document.querySelectorAll('[data-component]')].map(nameOf);
const row = (name: string) => [...document.querySelectorAll('[data-component]')].find((li) => nameOf(li) === name) as HTMLElement;
/** The component list's groups: not the tokens panel's sets, which are sections too. */
const groups = () => [...document.querySelectorAll('[data-component-group]')].map((s) => s.getAttribute('data-component-group'));
/** A group's accordion trigger, by its name: the button that opens and closes it. */
const groupTrigger = (name: string) => document.querySelector(`[data-component-group="${name}"] [data-slot="accordion-trigger"]`) as HTMLElement;
const text = () => document.body.textContent ?? '';

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the tab strip (T9)', () => {
	const tabStrip = () => document.querySelector('[role="tablist"][aria-label="Design System"]') as HTMLElement;
	const divider = () => document.querySelector('[role="separator"][aria-label="Resize the tokens panel"]');
	const shown = (name: string) => !(document.querySelector(`[role="tabpanel"][data-tab="${name}"]`) as HTMLElement).hidden;

	it('has Components, Primitives and Voice and tone, in that order, Components chosen', async () => {
		await open(() => ok(ready()));
		expect([...tabStrip().querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Components', 'Primitives', 'Voice and Tone']);
		expect(tab('Components').getAttribute('aria-selected')).toBe('true');
		// Under the design system's own row, which is first under the top bar and is not part of the tab bar.
		expect(systemRow().compareDocumentPosition(tabStrip()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(tabStrip().contains(systemRow())).toBe(false);
	});

	it('shows Primitives with the design system’s row still above it and no side panel, between the other two', async () => {
		await open(() => ok(ready()));
		await chooseTab('Primitives');
		expect(tab('Primitives').getAttribute('aria-selected')).toBe('true');
		expect(shown('primitives')).toBe(true);
		expect(shown('components')).toBe(false);
		expect(shown('voice-and-tone')).toBe(false);
		expect(divider()?.closest('[hidden]')).not.toBeNull();
		expect(systemRow().closest('[hidden]')).toBeNull();
		await chooseTab('Voice and Tone');
		expect(shown('primitives')).toBe(false);
		expect(shown('voice-and-tone')).toBe(true);
		await chooseTab('Components');
		expect(shown('components')).toBe(true);
	});

	it('shows on Primitives the design system the Components tab read, with no second read of it', async () => {
		const app = await open(() => ok(ready()));
		const reads = (app.calls.designSystemCatalog ?? []).length;
		await chooseTab('Primitives');
		await settle();
		const chips = [...document.querySelectorAll('[data-tab="primitives"] [data-primitive-chip]')].map((c) => c.textContent);
		expect(chips[0]).toMatch(/^Color \d+$/);
		expect((app.calls.designSystemCatalog ?? []).length).toBe(reads);
	});

	it('is the app’s line tabs, and the very same strip as the tokens panel’s, apart from the inset set once on the panel', async () => {
		await open(() => ok(ready()));
		expect(tabStrip().getAttribute('data-variant')).toBe('line');
		expect(tabStrip().closest('[data-slot="tabs"][data-variant="line"]')).not.toBeNull();
		// The same classes, so the same height and tabs: what the strip is, is `tabs.spec`'s to say.
		const panelTabs = document
			.querySelector('[role="separator"][aria-label="Resize the tokens panel"]')!
			.nextElementSibling!.querySelector('[role="tablist"]') as HTMLElement;
		expect(panelTabs.className).toBe(tabStrip().className);
		// The one difference is the inset, set once on the panel's tabs root, to what its own content is padded by.
		expect(panelTabs.closest('[data-slot="tabs"]')?.className).toContain('[--tabs-inset:1rem]');
		expect(tabStrip().closest('[data-slot="tabs"]')?.className).not.toContain('--tabs-inset');
		// And as high as the row above it and the panel's switch row, which are the toolbar's.
		expect(systemRow().className).toContain('h-(--toolbar-height)');
	});

	it('shows Voice and tone with the design system’s row still above it and no side panel, and Components again as it was left', async () => {
		await open(() => ok(ready()));
		await chooseTab('Voice and Tone');
		expect(tab('Voice and Tone').getAttribute('aria-selected')).toBe('true');
		expect(shown('voice-and-tone')).toBe(true);
		expect(shown('components')).toBe(false);
		// The panel is hidden, not left, and the design system's row is on every view: it is the one thing not in a tab.
		expect(divider()?.closest('[hidden]')).not.toBeNull();
		expect(systemRow().closest('[hidden]')).toBeNull();
		await chooseTab('Components');
		expect(shown('components')).toBe(true);
		expect(divider()?.closest('[hidden]')).toBeNull();
		expect(rows()).toHaveLength(5);
	});

	it('is there before the library is read, and when no design system is connected', async () => {
		const app = fakeApp({ designSystemCatalog: () => new Promise(() => undefined) });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(DesignSystem, { hidden: false }));
		expect(tabStrip()).not.toBeNull();
		await unmountAll(current.root);
		await open(() => ok({ state: 'none' }));
		expect(tabStrip()).not.toBeNull();
		expect(text()).toContain('Connect your design system');
	});
});

describe('the list', () => {
	it('shows the components grouped, in the catalog’s order, with the header', async () => {
		await open(() => ok(ready()));
		expect(groups()).toEqual(['Buttons', 'Surfaces', 'Popovers', 'Ungrouped']);
		expect(rows()).toEqual(['FSButton', 'FSCard', 'FSCardHeader', 'PopoverHeader', 'Loose']);
		expect(document.querySelector('[aria-label="Branch develop"]')).not.toBeNull();
		// No commit, no date, and nothing about being up to date: only a problem is said.
		expect(text()).not.toMatch(/fc2658f|2026|Oct|up to date|Checking GitHub/i);
		expect(text()).not.toContain('Chromatic');
	});

	it('has a forward chevron on each row and no menu: the links are on the component page', async () => {
		await open(() => ok(ready()));
		for (const name of rows()) {
			expect(row(name).querySelector('svg.lucide-chevron-right')).not.toBeNull();
			expect(row(name).querySelector('[aria-haspopup]')).toBeNull();
			expect(row(name).querySelectorAll('a')).toHaveLength(0);
		}
		expect(text()).not.toMatch(/Storybook|Source/);
	});

	it('names the branch it shows, from the library, not a fixed one', async () => {
		await open(() => ok({ ...ready(), branch: 'main' }));
		expect(document.querySelector('[aria-label="Branch main"]')).not.toBeNull();
	});

	it('marks no component as missing a story: every component in the list is one of Storybook’s', async () => {
		await open(() => ok(ready()));
		expect(text()).not.toContain('No story');
		expect(rows().every((name) => !row(name).querySelector('button')!.className.includes('pl-10'))).toBe(true);
	});
});

describe('the groups', () => {
	afterEach(() => localStorage.clear());

	it('are accordions, each with its name and how many it holds, all open at first', async () => {
		await open(() => ok(ready()));
		for (const name of ['Buttons', 'Surfaces', 'Popovers', 'Ungrouped']) expect(groupTrigger(name).getAttribute('aria-expanded')).toBe('true');
		expect(groupTrigger('Buttons').textContent).toBe('Buttons1');
		expect(groupTrigger('Surfaces').textContent).toBe('Surfaces2');
		expect(rows()).toHaveLength(5);
	});

	it('close on their own, and open again: the others are as they were, and the count stays', async () => {
		await open(() => ok(ready()));
		await press(groupTrigger('Surfaces'));
		expect(groupTrigger('Surfaces').getAttribute('aria-expanded')).toBe('false');
		expect(rows()).toEqual(['FSButton', 'PopoverHeader', 'Loose']);
		expect(groups()).toEqual(['Buttons', 'Surfaces', 'Popovers', 'Ungrouped']);
		expect(groupTrigger('Surfaces').textContent).toBe('Surfaces2');
		await press(groupTrigger('Buttons'));
		expect(rows()).toEqual(['PopoverHeader', 'Loose']);
		await press(groupTrigger('Surfaces'));
		expect(rows()).toEqual(['FSCard', 'FSCardHeader', 'PopoverHeader', 'Loose']);
	});

	it('close the same way in the grid, and the view chosen keeps what was closed', async () => {
		await open(() => ok(ready()));
		await press(groupTrigger('Surfaces'));
		await press(document.querySelector<HTMLElement>('[aria-label="View"] [aria-label="Grid"]')!);
		expect([...document.querySelectorAll('[data-component-card]')].map((c) => c.getAttribute('data-component-card'))).toEqual([
			COMPONENTS[0]!.id,
			COMPONENTS[3]!.id,
			COMPONENTS[4]!.id,
		]);
		expect(groupTrigger('Surfaces').getAttribute('aria-expanded')).toBe('false');
	});

	it('stay closed while a component is opened and the list comes back, and are all open again for another design system', async () => {
		await open(() => ok(ready()));
		await press(groupTrigger('Buttons'));
		await press(row('FSCard').querySelector('button')!);
		await press(button('Back to components'));
		expect(groupTrigger('Buttons').getAttribute('aria-expanded')).toBe('false');
		await openMenu(switcher());
		await press([...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')][1] as HTMLElement);
		await settle();
		expect(groupTrigger('Buttons').getAttribute('aria-expanded')).toBe('true');
	});
});

describe('searching the components (T9)', () => {
	const search = () => document.querySelector('input[aria-label="Search components"]') as HTMLInputElement;
	const viewButton = (name: 'List' | 'Grid') => document.querySelector<HTMLElement>(`[aria-label="View"] [aria-label="${name}"]`) as HTMLElement;
	const cards = () => [...document.querySelectorAll<HTMLElement>('[data-component-card]')].map((c) => c.getAttribute('data-component-card'));
	afterEach(() => localStorage.clear());

	it('is a search box, not a menu: the list narrows as you type, by name or group, and a group with nothing left goes', async () => {
		await open(() => ok(ready()));
		expect(document.querySelector('[cmdk-input]')).toBeNull();
		expect(text()).not.toContain('Find a component');
		await typeInto(search(), 'card');
		expect(rows()).toEqual(['FSCard', 'FSCardHeader']);
		expect(groups()).toEqual(['Surfaces']);
		// The group's count is what is left of it.
		expect(groupTrigger('Surfaces').textContent).toBe('Surfaces2');
		// A group's name finds its components; every word typed has to match, in any case.
		await typeInto(search(), 'popovers');
		expect(rows()).toEqual(['PopoverHeader']);
		await typeInto(search(), 'SURFACES header');
		expect(rows()).toEqual(['FSCardHeader']);
		await typeInto(search(), '');
		expect(rows()).toHaveLength(5);
	});

	it('says when nothing matches, with a way to clear it, and Escape clears it too', async () => {
		await open(() => ok(ready()));
		await typeInto(search(), 'nothing like it');
		expect(rows()).toHaveLength(0);
		expect(text()).toContain('No component matches “nothing like it”.');
		await press(button('Clear search'));
		expect(search().value).toBe('');
		expect(rows()).toHaveLength(5);
		await typeInto(search(), 'card');
		await act(async () => void search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
		expect(rows()).toHaveLength(5);
	});

	it('narrows the grid by the same rule as the list', async () => {
		await open(() => ok(ready()));
		await press(viewButton('Grid'));
		await typeInto(search(), 'card');
		expect(cards()).toEqual([COMPONENTS[1]!.id, COMPONENTS[2]!.id]);
		expect(groups()).toEqual(['Surfaces']);
	});

	it('opens nothing by itself: a component is opened from its row', async () => {
		await open(() => ok(ready()));
		await typeInto(search(), 'popover');
		expect(document.querySelector('[data-component-title]')?.textContent).not.toBe('PopoverHeader');
		await press(row('PopoverHeader').querySelector('button')!);
		expect(document.querySelector('[data-component-title]')?.textContent).toBe('PopoverHeader');
	});

	it('is in the second row, with List and Grid at its far right, above the list; it goes with the list and comes back after Back', async () => {
		await open(() => ok(ready()));
		const first = systemRow();
		expect(first.contains(search())).toBe(false);
		const second = search().closest('[data-components-search]') as HTMLElement;
		expect(second.lastElementChild?.contains(viewButton('Grid'))).toBe(true);
		const buttons = document.querySelector('[data-component-group="Buttons"]') as HTMLElement;
		expect(search().compareDocumentPosition(buttons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(search().closest('[hidden]')).toBeNull();
		await press(row('FSButton').querySelector('button')!);
		expect(search().closest('[hidden]')).not.toBeNull();
		// The first row stays: it is the frame's, not the list's.
		expect(systemRow().closest('[hidden]')).toBeNull();
		await press(button('Back to components'));
		expect(search().closest('[hidden]')).toBeNull();
	});

	it('keeps what was typed while a component is open, and while Voice and tone is looked at', async () => {
		await open(() => ok(ready()));
		await typeInto(search(), 'card');
		await press(row('FSCard').querySelector('button')!);
		await press(button('Back to components'));
		expect(search().value).toBe('card');
		await chooseTab('Voice and Tone');
		await chooseTab('Components');
		expect(search().value).toBe('card');
		expect(rows()).toEqual(['FSCard', 'FSCardHeader']);
	});

	it('starts empty for another design system', async () => {
		await open(() => ok(ready()));
		await typeInto(search(), 'card');
		await openMenu(switcher());
		await press([...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')][1] as HTMLElement);
		await settle();
		expect(search().value).toBe('');
	});
});

describe('the design system’s first row and the side panel’s top', () => {
	it('says in the design system’s row, directly left of Sync, how many values could not be read, and nothing when all were', async () => {
		await open(() => ok(ready()));
		expect(document.body.textContent).not.toContain('couldn’t be read');
		await unmountAll(current!.root);
		await open(() => ok({ ...ready(), tokens: { ...TOKENS, problems: [TOKEN_PROBLEM, { ...TOKEN_PROBLEM, line: 15 }] } }));
		const problem = button('2 values couldn’t be read');
		// In the row, on every view, right before Sync.
		expect(systemRow().contains(problem)).toBe(true);
		expect(problem.nextElementSibling).toBe(button('Sync'));
		await chooseTab('Primitives');
		expect(systemRow().closest('[hidden]')).toBeNull();
		// Its details are in the dialog it opens, not in the panel.
		const panel = document.querySelector('[role="separator"][aria-label="Resize the tokens panel"]')?.nextElementSibling as HTMLElement;
		expect(panel.textContent).not.toContain('neutral.ts');
		await press(problem);
		await settle();
		expect(dialog()?.textContent).toContain('src/colors/tones/neutral.ts:15');
	});

	it('has, in the first row under the top bar, the design system’s name and branch, then Sync, then More, and nothing else', async () => {
		await open(() => ok(ready()));
		const first = systemRow();
		expect(first.textContent).toBe('Flock React Component LibSync');
		expect(first.contains(document.querySelector('[aria-label="Branch develop"]'))).toBe(true);
		const inOrder = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
		expect(inOrder(switcher(), button('Sync'))).toBeTruthy();
		expect(inOrder(button('Sync'), button('More for Flock React Component Lib'))).toBeTruthy();
		expect(first.contains(button('More for Flock React Component Lib'))).toBe(true);
		// The panel's switch is not in it: it is at the top of the panel.
		expect(first.querySelector('[aria-label="Side panel"]')).toBeNull();
	});

	it('is above the views and the side panel alike, which are side by side under it, the panel running the height beside the tab bar', async () => {
		await open(() => ok(ready()));
		const divider = document.querySelector('[role="separator"][aria-label="Resize the tokens panel"]')!;
		const panelBox = divider.parentElement!;
		const views = panelBox.previousElementSibling!;
		// Under the row, side by side: the tab bar and its views at the left, the panel at the right.
		expect(systemRow().compareDocumentPosition(views) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(views.contains(systemRow())).toBe(false);
		expect(panelBox.contains(systemRow())).toBe(false);
		expect(views.querySelector('[role="tablist"][aria-label="Design System"]')).not.toBeNull();
		expect(panelBox.parentElement).toBe(views.parentElement);
		// The panel's switch is as high as the tab bar, so the two read as one line.
		expect((divider.nextElementSibling!.firstElementChild as HTMLElement).className).toContain('h-(--toolbar-height)');
	});

	it('has the panel’s Component and Tokens as the first thing in the panel, Component first, across the whole panel', async () => {
		await open(() => ok(ready()));
		const panel = document.querySelector('[role="separator"][aria-label="Resize the tokens panel"]')?.nextElementSibling as HTMLElement;
		expect(panel.firstElementChild?.querySelector('[aria-label="Side panel"]')).not.toBeNull();
		const group = document.querySelector('[aria-label="Side panel"]') as HTMLElement;
		expect([...group.querySelectorAll('[data-slot="toggle-group-item"]')].map((b) => b.textContent)).toEqual(['Component', 'Tokens']);
		expect(group.getAttribute('data-full-width')).toBe('true');
		// Still the tokens until a component is opened: the one shown is the second of the two.
		expect(shownView()).toBe('Tokens');
		// The same with a component open, whose panel is under it too.
		await press(row('FSButton').querySelector('button')!);
		expect(panel.firstElementChild?.querySelector('[aria-label="Side panel"]')).not.toBeNull();
		expect(panelView('Tokens').compareDocumentPosition(componentPanel()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('has no switcher between components and composites, and no count', async () => {
		await open(() => ok(ready()));
		// Not in the list: the tabs are the tab bar's, above it, and the tokens panel's, at the right of the divider.
		const list = document.querySelector('[data-tab="components"]')!;
		expect(list.querySelector('[role="tablist"]')).toBeNull();
		expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(2);
		expect(text()).not.toMatch(/\d+ components/);
		expect(rows()).toHaveLength(5);
	});

	it('has no filter for components without a story', async () => {
		await open(() => ok(ready()));
		expect([...document.querySelectorAll('button')].some((b) => /without a story/i.test(b.textContent ?? ''))).toBe(false);
	});
});

describe('the design systems connected (P4)', () => {
	it('are switched between from the name in the toolbar, each with its repository, the one shown checked', async () => {
		const app = await open(() => ok(ready()));
		const items = await openMenu(switcher());
		const radios = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(radios.map((r) => r.textContent)).toEqual([
			'Flock React Component Libflocksafety/flock-react-component-lib',
			'Acme UIacme/acme · packages/ui',
		]);
		expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
		expect(menuItem(items, 'Connect a design system')).toBeTruthy();
		await press(radios[1] as HTMLElement);
		await settle();
		expect(app.calls.selectDesignSystem).toEqual([[ACME.id]]);
		// Read afresh for the one now shown.
		expect((app.calls.designSystemCatalog ?? []).length).toBeGreaterThan(1);
	});

	const modal = () => document.querySelector<HTMLElement>('[data-slot="dialog-content"]');

	it('connect another from the switcher in a modal over the components, which stay as they were, and Cancel closes it', async () => {
		const app = await open(() => ok(ready()), false, { listRepositories: async () => ok({ repositories: [], reach: 'account' }) });
		const reads = (app.calls.designSystemCatalog ?? []).length;
		await press(menuItem(await openMenu(switcher()), 'Connect a design system'));
		await settle();
		expect(modal()!.querySelector('[data-slot="dialog-title"]')!.textContent).toBe('Connect a design system');
		// Not the screen of the first connection: the components are still there, and nothing was read again.
		expect([...document.querySelectorAll('h1')].map((h) => h.textContent)).not.toContain('Connect your design system');
		expect(rows()).toHaveLength(5);
		await press(button('Cancel'));
		await settle();
		expect(modal()).toBeNull();
		expect(rows()).toHaveLength(5);
		expect((app.calls.designSystemCatalog ?? []).length).toBe(reads);
	});

	it('connect another from the modal, which closes, and the one connected is shown', async () => {
		let connected = false;
		const app = await open(() => ok(ready()), false, {
			listRepositories: async () => ok({ repositories: [{ name: ACME.repository, root: null }], reach: 'account' }),
			clonePlan: async () =>
				ok({ repository: ACME.repository, place: { state: 'cloned', path: '/h/GitHub/acme' }, where: '~/GitHub/acme', design: null }),
			connectDesignSystem: async () => {
				connected = true;
				return ok({ state: 'connected', id: ACME.id });
			},
		});
		await press(menuItem(await openMenu(switcher()), 'Connect a design system'));
		await settle();
		await press(button('Choose a repository'));
		await settle();
		await act(
			async () =>
				void [...document.querySelectorAll('[cmdk-item]')]
					.find((i) => i.textContent === ACME.repository)!
					.dispatchEvent(new MouseEvent('click', { bubbles: true })),
		);
		await settle();
		await press(button('Connect'));
		await settle();
		expect(connected).toBe(true);
		expect(modal()).toBeNull();
		expect(app.calls.connectDesignSystem).toEqual([[ACME.repository]]);
	});

	it('remove the one shown from the More menu, and nothing on disk is said to be deleted', async () => {
		const app = await open(() => ok(ready()));
		const items = await openMenu(button('More for Flock React Component Lib'));
		// Just Remove: the menu is already about this design system.
		expect(items.map((i) => i.textContent)).toEqual(['Remove']);
		await press(menuItem(items, 'Remove'));
		await settle();
		expect(app.calls.removeDesignSystem).toEqual([[FUI_SYSTEM.id]]);
	});
});

/** The side panel's two views, as a button group in the toolbar: its buttons by name. */
const panelView = (name: 'Tokens' | 'Component') =>
	[...document.querySelectorAll<HTMLElement>('[aria-label="Side panel"] [data-slot="toggle-group-item"]')].find(
		(b) => b.textContent === name,
	) as HTMLElement;
const shownView = () =>
	[...document.querySelectorAll<HTMLElement>('[aria-label="Side panel"] [data-slot="toggle-group-item"]')].find(
		(b) => b.getAttribute('aria-checked') === 'true',
	)?.textContent;
const tokensShown = () => !document.querySelector('[data-panel="tokens"]')!.hasAttribute('hidden');
const componentPanel = () => document.querySelector<HTMLElement>('[data-panel="component"]');

describe('the components as a list or a grid (P5)', () => {
	const viewButton = (name: 'List' | 'Grid') => document.querySelector<HTMLElement>(`[aria-label="View"] [aria-label="${name}"]`) as HTMLElement;
	const viewShown = () => document.querySelector('[aria-label="View"] [aria-checked="true"]')?.getAttribute('aria-label');
	const cards = () => [...document.querySelectorAll<HTMLElement>('[data-component-card]')];
	afterEach(() => localStorage.clear());

	it('are a list at first, with List and Grid beside the search', async () => {
		await open(() => ok(ready()));
		expect(viewShown()).toBe('List');
		expect(document.querySelector('[data-components-search]')?.contains(viewButton('Grid'))).toBe(true);
		expect(cards()).toHaveLength(0);
	});

	it('are a grid of cards when Grid is pressed, in the same groups, each card the component’s name and group', async () => {
		await open(() => ok(ready()));
		await press(viewButton('Grid'));
		await settle();
		expect(groups()).toEqual(['Buttons', 'Surfaces', 'Popovers', 'Ungrouped']);
		expect(cards().map((c) => c.getAttribute('data-component-card'))).toEqual(COMPONENTS.map((c) => c.id));
		expect(cards()[0]?.textContent).toBe('FSButtonButtons');
		expect(document.querySelectorAll('[data-component]')).toHaveLength(0);
	});

	it('open a component from a card, by a press or by Enter, as a project card does', async () => {
		await open(() => ok(ready()));
		await press(viewButton('Grid'));
		await press(cards()[0] as HTMLElement);
		expect(document.querySelector('[data-component-title]')?.textContent).toBe('FSButton');
		await press(button('Back to components'));
		await act(async () => void (cards()[1] as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
		expect(document.querySelector('[data-component-title]')?.textContent).toBe('FSCard');
	});

	it('remember the view chosen', async () => {
		await open(() => ok(ready()));
		await press(viewButton('Grid'));
		await unmountAll(current!.root);
		await open(() => ok(ready()));
		expect(viewShown()).toBe('Grid');
	});

	it('show each component’s picture in its card, asked for as the tab is shown, in the list as in the grid', async () => {
		const pictures = { [COMPONENTS[0]!.id]: 'http://127.0.0.1:1/component-pictures-x/0123456789abcdef.jpg' };
		const app = await open(() => ok(ready()), false, { componentPictures: async () => ok({ drawing: false, pictures, issues: {} }) });
		await settle();
		// Asked for in the list, which is the view it opens in: the rows have thumbnails.
		expect(app.calls.componentPictures).toHaveLength(1);
		await press(viewButton('Grid'));
		await settle();
		expect(app.calls.componentPictures).toHaveLength(1);
		expect(cards()[0]?.querySelector('img')?.getAttribute('src')).toBe(pictures[COMPONENTS[0]!.id]);
		// The others keep their cover, a placeholder of the same size.
		expect(cards()[1]?.querySelector('img')).toBeNull();
		expect(cards()[1]?.querySelector('[data-picture-area]')).not.toBeNull();
	});

	it('do not ask for the pictures while the tab is hidden', async () => {
		const app = await open(() => ok(ready()), true);
		expect(app.calls.componentPictures).toBeUndefined();
	});
});

describe('a thumbnail in each row of the list', () => {
	const PICTURE = 'http://127.0.0.1:1/component-pictures-x/0123456789abcdef.jpg';
	const thumb = (name: string) => row(name).querySelector('button > [data-thumbnail]') as HTMLElement | null;

	it('is the picture the grid shows, reduced, at the left of the name and its description', async () => {
		await open(() => ok(ready()), false, {
			componentPictures: async () => ok({ drawing: false, pictures: { [COMPONENTS[0]!.id]: PICTURE }, issues: {} }),
		});
		await settle();
		const t = thumb('FSButton')!;
		expect(t).not.toBeNull();
		expect(t.querySelector('img')?.getAttribute('src')).toBe(PICTURE);
		// First in the row, before the name, and the same shape as a card's cover, so it is the same picture, smaller.
		expect(row('FSButton').querySelector('button')!.firstElementChild).toBe(t);
		expect(t.className.split(' ')).toContain('aspect-[1920/960]');
		expect(t.nextElementSibling!.textContent).toContain('FSButton');
		// Decorative: the name is beside it.
		expect(t.querySelector('img')?.getAttribute('alt')).toBe('');
	});

	it('is the soft placeholder, the same as a card’s, for a component with none, and has one on every row', async () => {
		await open(() => ok(ready()), false, { componentPictures: async () => ok({ drawing: false, pictures: {}, issues: {} }) });
		await settle();
		for (const name of rows()) {
			expect(thumb(name)).not.toBeNull();
			expect(thumb(name)!.querySelector('img')).toBeNull();
			expect(thumb(name)!.querySelector('[data-picture-area]')!.className.split(' ')).toContain('bg-muted/40');
		}
	});

	it('is a skeleton while the pictures are being drawn, then the picture', async () => {
		let drawing = true;
		await open(() => ok(ready()), false, {
			componentPictures: async () => ok({ drawing, pictures: drawing ? {} : { [COMPONENTS[0]!.id]: PICTURE }, issues: {} }),
		});
		await settle();
		expect(thumb('FSButton')!.querySelector('[data-picture-waiting]')).not.toBeNull();
		expect(thumb('FSCard')!.querySelector('[data-picture-waiting]')).not.toBeNull();
		drawing = false;
	});

	it('does not open the component by itself, and the whole row still does', async () => {
		await open(() => ok(ready()));
		await settle();
		expect(thumb('FSButton')!.querySelectorAll('button, a')).toHaveLength(0);
		await press(thumb('FSButton')!);
		expect(document.querySelector('[data-component-title]')?.textContent).toBe('FSButton');
	});
});

describe('the side panel’s views', () => {
	it('start on Tokens, with Component off until a component is open', async () => {
		await open(() => ok(ready()));
		expect(shownView()).toBe('Tokens');
		expect(panelView('Component').hasAttribute('disabled')).toBe(true);
		expect(tokensShown()).toBe(true);
		expect(componentPanel()).toBeNull();
	});

	it('switch to Component the moment a component is opened, from the list or from a card', async () => {
		await open(() => ok(ready()));
		await press(row('FSButton').querySelector('button')!);
		expect(shownView()).toBe('Component');
		expect(panelView('Component').hasAttribute('disabled')).toBe(false);
		expect(tokensShown()).toBe(false);
		expect(componentPanel()?.textContent).toContain('FSButton');
		await press(button('Back to components'));
		await press(document.querySelector<HTMLElement>('[aria-label="View"] [aria-label="Grid"]')!);
		await press(document.querySelector<HTMLElement>(`[data-component-card="${COMPONENTS[1]!.id}"]`)!);
		await settle();
		expect(shownView()).toBe('Component');
		expect(componentPanel()?.textContent).toContain('FSCard');
		localStorage.clear();
	});

	it('show, as Component, the tokens the open component draws with, asked for by its story file', async () => {
		const app = await open(() => ok(ready()));
		await press(row('FSButton').querySelector('button')!);
		await settle();
		expect(app.calls.componentTokens).toEqual([['src/components/FSButton/FSButton.stories.tsx']]);
		expect(componentPanel()?.textContent).toContain('Finding the tokens FSButton draws with…');
	});

	it('can be toggled back to Tokens and to Component while a component is open', async () => {
		await open(() => ok(ready()));
		await press(row('FSButton').querySelector('button')!);
		await press(panelView('Tokens'));
		expect(shownView()).toBe('Tokens');
		expect(tokensShown()).toBe(true);
		expect(componentPanel()).toBeNull();
		await press(panelView('Component'));
		expect(shownView()).toBe('Component');
		// The one shown stays shown when pressed again.
		await press(panelView('Component'));
		expect(shownView()).toBe('Component');
	});

	it('go back to Tokens, and Component off, when the component is left', async () => {
		await open(() => ok(ready()));
		await press(row('FSButton').querySelector('button')!);
		await press(button('Back to components'));
		expect(shownView()).toBe('Tokens');
		expect(panelView('Component').hasAttribute('disabled')).toBe(true);
		expect(tokensShown()).toBe(true);
		// Opening another goes to Component again, even after Tokens was chosen for the last one.
		await press(row('FSButton').querySelector('button')!);
		await press(panelView('Tokens'));
		await press(button('Back to components'));
		await press(row('FSCard').querySelector('button')!);
		expect(shownView()).toBe('Component');
	});

	it('go back to Tokens when a sync removes the open component', async () => {
		let n = 0;
		await open(() =>
			ok(
				n++ === 0
					? ready()
					: ready(
							'updated',
							COMPONENTS.filter((c) => c.name !== 'FSCard'),
						),
			),
		);
		await press(row('FSCard').querySelector('button')!);
		await press(button('Sync'));
		await settle();
		expect(shownView()).toBe('Tokens');
		expect(panelView('Component').hasAttribute('disabled')).toBe(true);
	});

	it('keep the tokens panel as it was left: its search, its tab, and what was changed, while a component is looked at', async () => {
		await open(() => ok(ready()));
		const search = document.querySelector('input[aria-label="Search color"]') as HTMLInputElement;
		await typeInto(search, 'pine');
		await press(row('FSButton').querySelector('button')!);
		await press(panelView('Tokens'));
		expect((document.querySelector('input[aria-label="Search color"]') as HTMLInputElement).value).toBe('pine');
	});
});

describe('the tokens panel', () => {
	const divider = () => document.querySelector('[role="separator"][aria-label="Resize the tokens panel"]') as HTMLElement | null;
	const panel = () => divider()?.nextElementSibling as HTMLElement | undefined;

	it('is at the right of the tab, with the library’s tokens, on the list, without opening anything', async () => {
		await open(() => ok(ready()));
		expect(panel()?.querySelector('[role="tab"]')?.textContent).toBe('Color');
		// One group on the tab, so its sets are shown straight away.
		expect(panel()?.textContent).toContain('pineGreen');
		expect(panel()?.querySelector('input[aria-label="Search color"]')).not.toBeNull();
		// The last thing on the row, at the right, with the list before it.
		expect(divider()?.parentElement?.lastElementChild).toBe(panel());
		expect(divider()?.parentElement?.previousElementSibling?.contains(document.querySelector('[data-component]'))).toBe(true);
	});

	it('stays when a component is opened, and when it is closed again, as one panel', async () => {
		await open(() => ok(ready()));
		const before = panel();
		await press(row('FSButton').querySelector('button')!);
		expect(panel()).toBe(before);
		expect(divider()?.parentElement?.previousElementSibling?.textContent).toContain('FSButton');
		await press(button('Back to components'));
		expect(panel()).toBe(before);
	});

	it('is always there: nothing in the toolbar hides it, only chooses what it shows', async () => {
		await open(() => ok(ready()));
		expect(divider()).not.toBeNull();
		// The toolbar's Tokens and Component choose what it shows, one of the two always: neither hides it.
		await press(row('FSButton').querySelector('button')!);
		expect(divider()).not.toBeNull();
		await press(panelView('Tokens'));
		expect(divider()).not.toBeNull();
		expect(shownView()).toBe('Tokens');
	});

	/** Changes the one tone in the panel, as a person does: its row, then its picker, closed on a color. */
	const changeTone = async (value: string) => {
		await press(panel()?.querySelector('[data-token="tone.pineGreen.50"] button') as HTMLElement);
		await settle();
		const picker = document.querySelector('[data-token-editor] input[type="color"]') as HTMLInputElement;
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(picker, value);
			picker.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await settle();
	};

	it('makes the change an open component’s previews are built with, and leaves it for none (T3)', async () => {
		const app = await open(() => ok(ready()));
		await press(row('FSButton').querySelector('button')!);
		await settle();
		await changeTone('#000000');
		expect(app.calls.storyPreview?.at(-1)).toEqual([[{ path: 'tone.pineGreen.50', value: '#000000' }]]);
		await press(button('Reset all'));
		await settle();
		expect(app.calls.storyPreview?.at(-1)).toEqual([[]]);
	});

	it('keeps a change while components are opened and closed, and drops it when another design system is shown', async () => {
		const app = await open(() => ok(ready()));
		await changeTone('#000000');
		await press(row('FSButton').querySelector('button')!);
		await settle();
		// Opened after the change: built with it from the start.
		expect(app.calls.storyPreview?.at(-1)).toEqual([[{ path: 'tone.pineGreen.50', value: '#000000' }]]);
		await press(button('Back to components'));
		expect(document.querySelector('[data-changed-tokens]')).not.toBeNull();
		await openMenu(switcher());
		await press([...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')][1] as HTMLElement);
		await settle();
		expect(app.calls.selectDesignSystem).toEqual([[ACME.id]]);
		expect(document.querySelector('[data-changed-tokens]')).toBeNull();
	});

	it('is not drawn while the library is not connected, where there is nothing to show', async () => {
		await open(() => ok({ state: 'none' }));
		expect(divider()).toBeNull();
		expect(document.querySelector('[role="tab"][aria-selected]')?.textContent).not.toBe('Color');
	});
});

describe('opening a component', () => {
	const listShown = () => !document.querySelector('[data-component]')!.closest('[hidden]');

	it('shows the list by default, and opens a component from a click anywhere on its row', async () => {
		await open(() => ok(ready()));
		expect(listShown()).toBe(true);
		await press(row('FSButton').querySelector('button')!);
		expect(listShown()).toBe(false);
		expect(document.querySelector('[data-component-title]')?.textContent).toBe('FSButton');
		expect(text()).toContain('Buttons allow users to take actions.');
	});

	it('goes back to the list, where it was, with Back', async () => {
		await open(() => ok(ready()));
		const list = document.querySelector('[data-component]')!.closest('div')!;
		await press(row('FSCard').querySelector('button')!);
		await press(button('Back to components'));
		expect(listShown()).toBe(true);
		// The same list, not a new one: what was scrolled stays scrolled.
		expect(document.querySelector('[data-component]')!.closest('div')).toBe(list);
		expect(document.querySelector('input[aria-label="Search components"]')?.closest('[hidden]')).toBeNull();
	});

	it('closes a component that a sync removed, back to the list', async () => {
		let n = 0;
		await open(() =>
			ok(
				n++ === 0
					? ready()
					: ready(
							'updated',
							COMPONENTS.filter((c) => c.name !== 'FSCard'),
						),
			),
		);
		await press(row('FSCard').querySelector('button')!);
		await press(button('Sync'));
		await settle();
		expect(listShown()).toBe(true);
		expect(rows()).not.toContain('FSCard');
	});
});

describe('keeping it current', () => {
	it('shows what the clone has at once, then asks again once GitHub has been checked, and replaces the list', async () => {
		const app = await open((refresh) => ok(refresh ? ready('updated', [...COMPONENTS, component('FSChip')]) : ready('updating')));
		await settle();
		expect(app.calls.designSystemCatalog).toEqual([[false], [true]]);
		expect(rows()).toContain('FSChip');
		expect(text()).not.toContain('Could not update');
	});

	it('says a fetch is running while it is', async () => {
		let finish: (c: Catalog) => void = () => undefined;
		const app = fakeApp({
			designSystemCatalog: (refresh: boolean) => (refresh ? new Promise((r) => (finish = (c) => r(ok(c)))) : Promise.resolve(ok(ready('updating')))),
		});
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(DesignSystem, { hidden: false }));
		// Only the button says so: a running fetch is not a problem.
		expect(button('Syncing…').disabled).toBe(true);
		expect(text()).not.toMatch(/Checking GitHub|Could not update/);
		await act(async () => finish(ready('unchanged')));
		await settle();
		expect(button('Sync').disabled).toBe(false);
	});

	it('keeps the list when the update fails, and says so in a problems button beside Sync, with the reason in its dialog', async () => {
		await open(() => ok(ready({ failed: 'Could not reach GitHub. Check the internet connection.' })));
		expect(rows()).toHaveLength(5);
		const problem = button('Could not update from GitHub');
		// In the design system's row, before Sync, as the other problems are.
		expect(systemRow().contains(problem)).toBe(true);
		expect(problem.nextElementSibling?.textContent).toBe('Sync');
		await press(problem);
		await settle();
		expect(dialog()?.textContent).toContain('Could not reach GitHub. Check the internet connection.');
	});

	it('asks again, waiting for GitHub, when Sync is pressed', async () => {
		const app = await open(() => ok(ready()));
		expect(app.calls.designSystemCatalog).toEqual([[false]]);
		await press(button('Sync'));
		await settle();
		expect(app.calls.designSystemCatalog).toEqual([[false], [true]]);
	});

	it('reads nothing while hidden, and reads once when first shown, not on every visit', async () => {
		const app = fakeApp({ designSystemCatalog: async () => ok(ready()) });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(DesignSystem, { hidden: true }));
		expect(app.calls.designSystemCatalog).toBeUndefined();
		await act(async () => current!.root.render(createElement(TooltipProvider, null, createElement(DesignSystem, { hidden: false }))));
		await settle();
		await act(async () => current!.root.render(createElement(TooltipProvider, null, createElement(DesignSystem, { hidden: true }))));
		await act(async () => current!.root.render(createElement(TooltipProvider, null, createElement(DesignSystem, { hidden: false }))));
		await settle();
		expect(app.calls.designSystemCatalog).toEqual([[false]]);
	});

	it('keeps the list when a refresh fails, and says the error above it', async () => {
		let n = 0;
		await open(() => (n++ === 0 ? ok(ready()) : fail('git broke')));
		await press(button('Sync'));
		await settle();
		expect(rows()).toHaveLength(5);
		expect(text()).toContain('git broke');
	});
});

describe('when there is no list', () => {
	it('says it is reading while the first read runs', async () => {
		const app = fakeApp({ designSystemCatalog: () => new Promise(() => undefined) });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(DesignSystem, { hidden: false }));
		// In the screen's own shape, as a skeleton, with what it is doing said in words for a screen reader.
		const status = document.querySelector('[role="status"][aria-busy="true"]') as HTMLElement;
		expect(status.querySelector('.sr-only')?.textContent).toBe('Reading the component library…');
		expect(status.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1);
		expect(status.querySelector('[data-slot="spinner"]')).toBeNull();
	});

	it('shows the Connect screen when none is connected, and the list once one is', async () => {
		let connected = false;
		const app = fakeApp({
			designSystemCatalog: async () => ok(connected ? ready() : { state: 'none' }),
			designSystems: async () => ok(connected ? SYSTEMS : { systems: [], current: null }),
			listRepositories: async () => ok({ repositories: [{ name: FUI_SYSTEM.repository, root: null }], reach: 'account' }),
			clonePlan: async () =>
				ok({
					repository: FUI_SYSTEM.repository,
					place: { state: 'cloned', path: FUI_SYSTEM.root },
					where: '~/GitHub/flock-react-component-lib',
					design: null,
				}),
			connectDesignSystem: async () => {
				connected = true;
				return ok({ state: 'connected', id: FUI_SYSTEM.id });
			},
		});
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(DesignSystem, { hidden: false }));
		expect(text()).toContain('Connect your design system');
		// Nothing to cancel back to.
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Cancel')).toBe(false);
		await press(button('Choose a repository'));
		await settle();
		await act(
			async () =>
				void [...document.querySelectorAll('[cmdk-item]')]
					.find((i) => i.textContent === FUI_SYSTEM.repository)!
					.dispatchEvent(new MouseEvent('click', { bubbles: true })),
		);
		await settle();
		await press(button('Connect'));
		await settle();
		expect(rows()).toHaveLength(5);
		expect(switcher()).toBeTruthy();
	});

	it('says the one shown is no longer on this computer, with a way to remove it', async () => {
		const app = await open(() => ok({ state: 'lost', name: 'Flock React Component Lib', root: '/h/GitHub/flock-react-component-lib' }));
		expect(text()).toContain('Flock React Component Lib is no longer on this computer');
		expect(text()).toContain('/h/GitHub/flock-react-component-lib');
		// Just Remove: the title says which.
		await press(button('Remove'));
		await settle();
		expect(app.calls.removeDesignSystem).toEqual([[FUI_SYSTEM.id]]);
	});

	it('says the clone has no copy of its branch, naming the clone and the branch, and reads no other', async () => {
		await open(() => ok({ state: 'no-branch', root: '/h/GitHub/fui', branch: 'develop' }));
		expect(text()).toContain('This clone has no develop branch');
		expect(text()).toContain('/h/GitHub/fui');
	});

	it('says the library’s Storybook has no stories when the branch has none', async () => {
		await open(() => ok(ready('unchanged', [])));
		expect(text()).toContain("The library's Storybook has no stories on develop, so there are no components to list.");
	});

	it('says what went wrong when the read fails, and tries again', async () => {
		let n = 0;
		await open(() => (n++ === 0 ? fail('git is not installed') : ok(ready())));
		expect(text()).toContain('Could not read the component library');
		expect(text()).toContain('git is not installed');
		await press(button('Try again'));
		await settle();
		expect(rows()).toHaveLength(5);
	});
});

/** What is said in place of the list: shadcn's alert as it is made, with Try again in its own action slot. */

describe('the notices in place of the list', () => {
	it('has Try again in the alert’s action slot, with an icon, title and description, when the read fails', async () => {
		await open(() => fail('git is not installed'));
		const alert = document.querySelector('[data-slot="alert"]')!;
		expect(alertParts(alert)).toEqual(['icon', 'alert-title', 'alert-description', 'alert-action']);
		expect(alert.querySelector('[data-slot="alert-description"]')!.textContent).toBe('git is not installed');
		expect(alert.querySelector('[data-slot="alert-action"]')!.contains(button('Try again'))).toBe(true);
	});

	it('is the same when the clone has no copy of its branch', async () => {
		await open(() => ok({ state: 'no-branch', root: '/h/fui', branch: 'develop' }));
		const alert = document.querySelector('[data-slot="alert"]')!;
		expect(alertParts(alert)).toEqual(['icon', 'alert-title', 'alert-description', 'alert-action']);
		expect(alert.querySelector('[data-slot="alert-title"]')!.textContent).toBe('This clone has no develop branch');
	});
});

describe('where the design system is read from', () => {
	it('is a hint the keyboard can reach, named by its branch', async () => {
		await open(() => ok(ready()));
		const hint = systemRow().querySelector<HTMLElement>('[aria-label="Branch develop"]')!;
		expect(hint.tabIndex).toBe(0);
	});
});
