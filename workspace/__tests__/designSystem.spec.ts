// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignSystem } from '../src/renderer/DesignSystem';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import type { Catalog, CatalogComponent, CatalogUpdate, DesignTokens } from '../src/shared/contract';
import { button, fail, fakeApp, menuItem, ok, openMenu, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * The Design System tab (S3 of the design system plan): the component library's catalog as a grouped list with links
 * out, against a fake app.
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
	tokens: [{ path: 'tone.pineGreen.50', kind: 'color', category: 'Color', group: 'Tones', set: 'pineGreen', name: '50', value: '#108062', source: { file: 'src/colors/tones/pineGreen.ts', line: 3 } }],
};

const ready = (update: CatalogUpdate = 'unchanged', components = COMPONENTS): Catalog => ({
	state: 'ready',
	branch: 'develop',
	commit: 'fc2658f0123456789',
	committedAt: '2026-10-07T19:03:13Z',
	update,
	components,
	tokens: TOKENS,
});

/** The design systems connected (P4): FUI, by its Storybook's brand, and a second one. */
const FUI_SYSTEM = { id: 'flocksafety/flock-react-component-lib', name: 'Flock React Component Lib', repository: 'flocksafety/flock-react-component-lib', root: '/h/GitHub/flock-react-component-lib', folder: '', branch: 'develop' };
const ACME = { id: 'acme/acme:packages/ui', name: 'Acme UI', repository: 'acme/acme', root: '/h/GitHub/acme', folder: 'packages/ui', branch: 'main' };
const SYSTEMS = { systems: [FUI_SYSTEM, ACME], current: FUI_SYSTEM.id };
const switcher = (name = FUI_SYSTEM.name) => button(`Design system ${name}: switch design system`);

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (answers: (refresh: boolean) => ReturnType<typeof ok<Catalog>> | ReturnType<typeof fail>, hidden = false, more: Record<string, (...a: never[]) => unknown> = {}) => {
	const app = fakeApp({ designSystemCatalog: async (refresh: boolean) => answers(refresh), designSystems: async () => ok(SYSTEMS), storyPreview: async () => ok({ state: 'ready', base: 'http://127.0.0.1:1/p/' }), ...more });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(DesignSystem, { hidden }));
	return app;
};
/** A row's component, by the name it shows. */
const nameOf = (li: Element) => li.querySelector('.font-medium')?.textContent ?? '';
const rows = () => [...document.querySelectorAll('[data-component]')].map(nameOf);
const row = (name: string) => [...document.querySelectorAll('[data-component]')].find((li) => nameOf(li) === name) as HTMLElement;
/** The component list's groups: not the tokens panel's sets, which are sections too. */
const groups = () => [...document.querySelectorAll('section:not([data-token-set])')].map((s) => s.getAttribute('aria-label'));
const text = () => document.body.textContent ?? '';

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
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

describe('finding a component', () => {
	const finder = () => button('Find a component');
	const choices = () => [...document.querySelectorAll('[cmdk-item]')].map((i) => i.textContent);

	it('lists every component in a searchable dropdown, the New modal’s own, and narrows it as you type', async () => {
		await open(() => ok(ready()));
		await press(finder());
		await settle();
		expect(choices()).toEqual(['FSButton', 'FSCard', 'FSCardHeader', 'PopoverHeader', 'Loose']);
		const search = document.querySelector('[cmdk-input]') as HTMLInputElement;
		await typeInto(search, 'card');
		await settle();
		expect(choices().filter((c) => c === 'FSCard' || c === 'FSCardHeader')).toHaveLength(2);
		await typeInto(search, 'nothing like it');
		await settle();
		expect(text()).toContain('No component matches.');
	});

	it('opens the component chosen in the finder on its own page', async () => {
		await open(() => ok(ready()));
		await press(finder());
		await settle();
		await act(async () => void [...document.querySelectorAll('[cmdk-item]')].find((i) => i.textContent === 'PopoverHeader')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		await settle();
		expect(document.querySelector('h3')?.textContent).toBe('PopoverHeader');
		// The finder is the list's, so it goes with the list and comes back with it.
		expect(finder().closest('[hidden]')).not.toBeNull();
	});

	it('shows a name two components share with its group in the finder, and opens the one chosen', async () => {
		await open(() =>
			ok(ready('unchanged', [component('Overview', { id: 'a/Overview.stories.tsx', group: 'Buttons' }), component('Overview', { id: 'b/Overview.stories.tsx', group: 'Surfaces', subtitle: 'The surfaces one.' })])),
		);
		await press(finder());
		await settle();
		expect(choices()).toEqual(['Buttons / Overview', 'Surfaces / Overview']);
		await act(async () => void [...document.querySelectorAll('[cmdk-item]')].find((i) => i.textContent === 'Surfaces / Overview')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		await settle();
		expect(text()).toContain('The surfaces one.');
	});

	it('is in the components view, above the list, and not in the toolbar', async () => {
		await open(() => ok(ready()));
		const toolbar = switcher().parentElement!;
		expect(toolbar.contains(finder())).toBe(false);
		// Above the first group, in the same place as the list it searches.
		const first = document.querySelector('section[aria-label="Buttons"]') as HTMLElement;
		expect(finder().compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(finder().closest('[hidden]')).toBeNull();
	});

	it('says in an alert at the top of the tokens panel, above its tabs, how many values could not be read, and nothing when all were', async () => {
		await open(() => ok(ready()));
		expect(document.body.textContent).not.toContain('couldn’t be read');
		await unmountAll(current!.root);
		const problems = [{ file: 'src/colors/tones/neutral.ts', line: 10, reason: 'one' }, { file: 'src/colors/tones/neutral.ts', line: 15, reason: 'two' }];
		await open(() => ok({ ...ready(), tokens: { ...TOKENS, problems } }));
		const alert = document.querySelector('[role="alert"]') as HTMLElement;
		expect(alert.querySelector('[data-slot="alert-title"]')?.textContent).toBe('2 values couldn’t be read');
		// In the panel at the right, before its tabs; not in the toolbar, which has only Sync and More beside the name.
		const panel = document.querySelector('[role="separator"][aria-label="Resize the tokens panel"]')?.nextElementSibling as HTMLElement;
		expect(panel.contains(alert)).toBe(true);
		expect(alert.compareDocumentPosition(panel.querySelector('[role="tablist"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(switcher().parentElement?.contains(alert)).toBe(false);
		// Its details are in the dialog it opens, not in the panel.
		expect(panel.textContent).not.toContain('neutral.ts');
		await press(button('View', alert));
		await settle();
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain('src/colors/tones/neutral.ts:15');
	});

	it('has the design system’s name and branch, then Sync and More at the toolbar’s right, and nothing else', async () => {
		await open(() => ok(ready()));
		const toolbar = switcher().parentElement!;
		expect(toolbar.textContent).toBe('Flock React Component LibSync');
		expect(toolbar.contains(button('More for Flock React Component Lib'))).toBe(true);
		expect(switcher().compareDocumentPosition(button('Sync')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect([...toolbar.querySelectorAll('button')].some((b) => b.textContent === 'Tokens')).toBe(false);
	});

	it('has no switcher between components and composites, and no count', async () => {
		await open(() => ok(ready()));
		// Not in the list: the only tabs are the tokens panel's, at the right of the divider.
		const list = document.querySelector('[role="separator"][aria-label="Resize the tokens panel"]')!.previousElementSibling!;
		expect(list.querySelector('[role="tablist"]')).toBeNull();
		expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(1);
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
		expect(radios.map((r) => r.textContent)).toEqual(['Flock React Component Libflocksafety/flock-react-component-lib', 'Acme UIacme/acme · packages/ui']);
		expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
		expect(menuItem(items, 'Connect a design system')).toBeTruthy();
		await press(radios[1] as HTMLElement);
		await settle();
		expect(app.calls.selectDesignSystem).toEqual([[ACME.id]]);
		// Read afresh for the one now shown.
		expect((app.calls.designSystemCatalog ?? []).length).toBeGreaterThan(1);
	});

	it('connect another from the switcher, with Cancel back to the one shown', async () => {
		await open(() => ok(ready()), false, { listRepositories: async () => ok({ repositories: [], reach: 'account' }) });
		await press(menuItem(await openMenu(switcher()), 'Connect a design system'));
		await settle();
		expect(text()).toContain('Connect your design system');
		await press(button('Cancel'));
		await settle();
		expect(rows()).toHaveLength(5);
	});

	it('remove the one shown from the More menu, and nothing on disk is said to be deleted', async () => {
		const app = await open(() => ok(ready()));
		const items = await openMenu(button('More for Flock React Component Lib'));
		await press(menuItem(items, 'Remove Flock React Component Lib'));
		await settle();
		expect(app.calls.removeDesignSystem).toEqual([[FUI_SYSTEM.id]]);
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
		expect(divider()?.previousElementSibling?.contains(document.querySelector('[data-component]'))).toBe(true);
	});

	it('stays when a component is opened, and when it is closed again, as one panel', async () => {
		await open(() => ok(ready()));
		const before = panel();
		await press(row('FSButton').querySelector('button')!);
		expect(panel()).toBe(before);
		expect(divider()?.previousElementSibling?.textContent).toContain('FSButton');
		await press(button('Back to components'));
		expect(panel()).toBe(before);
	});

	it('is always there: nothing in the toolbar hides it', async () => {
		await open(() => ok(ready()));
		expect(divider()).not.toBeNull();
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Tokens' || b.getAttribute('aria-pressed') !== null)).toBe(false);
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
		expect(document.querySelector('h3')?.textContent).toBe('FSButton');
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
		expect(button('Find a component')).toBeTruthy();
	});

	it('closes a component that a sync removed, back to the list', async () => {
		let n = 0;
		await open(() => ok(n++ === 0 ? ready() : ready('updated', COMPONENTS.filter((c) => c.name !== 'FSCard'))));
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

	it('keeps the list when the update fails, and says so beside Sync, with the reason on hover', async () => {
		await open(() => ok(ready({ failed: 'Could not reach GitHub. Check the internet connection.' })));
		expect(rows()).toHaveLength(5);
		const problem = [...document.querySelectorAll('[role="status"]')].find((e) => e.textContent === 'Could not update from GitHub')!;
		expect(problem.getAttribute('title')).toBe('Could not reach GitHub. Check the internet connection.');
		// Beside Sync, which is beside More.
		expect(problem.nextElementSibling?.textContent).toBe('Sync');
		expect(switcher().parentElement!.contains(problem)).toBe(true);
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
		expect(text()).toContain('Reading the component library…');
	});

	it('shows the Connect screen when none is connected, and the list once one is', async () => {
		let connected = false;
		const app = fakeApp({
			designSystemCatalog: async () => ok(connected ? ready() : { state: 'none' }),
			designSystems: async () => ok(connected ? SYSTEMS : { systems: [], current: null }),
			listRepositories: async () => ok({ repositories: [{ name: FUI_SYSTEM.repository, root: null }], reach: 'account' }),
			clonePlan: async () => ok({ repository: FUI_SYSTEM.repository, place: { state: 'cloned', path: FUI_SYSTEM.root }, where: '~/GitHub/flock-react-component-lib', design: null }),
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
		await act(async () => void [...document.querySelectorAll('[cmdk-item]')].find((i) => i.textContent === FUI_SYSTEM.repository)!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
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
		await press(button('Remove Flock React Component Lib'));
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
