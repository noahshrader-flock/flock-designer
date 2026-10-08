// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignSystem } from '../src/renderer/DesignSystem';
import { TooltipProvider } from '../src/renderer/ui/tooltip';
import type { Catalog, CatalogComponent, CatalogUpdate } from '../src/shared/contract';
import { button, fail, fakeApp, ok, press, render, settle, typeInto, unmountAll } from './reviewHarness';

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

const ready = (update: CatalogUpdate = 'unchanged', components = COMPONENTS): Catalog => ({
	state: 'ready',
	branch: 'develop',
	commit: 'fc2658f0123456789',
	committedAt: '2026-10-07T19:03:13Z',
	update,
	components,
});

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (answers: (refresh: boolean) => ReturnType<typeof ok<Catalog>> | ReturnType<typeof fail>, hidden = false) => {
	const app = fakeApp({ designSystemCatalog: async (refresh: boolean) => answers(refresh), storyPreview: async () => ok({ state: 'ready', base: 'http://127.0.0.1:1/p/' }) });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(DesignSystem, { hidden }));
	return app;
};
/** A row's component, by the name it shows. */
const nameOf = (li: Element) => li.querySelector('.font-medium')?.textContent ?? '';
const rows = () => [...document.querySelectorAll('[data-component]')].map(nameOf);
const row = (name: string) => [...document.querySelectorAll('[data-component]')].find((li) => nameOf(li) === name) as HTMLElement;
const groups = () => [...document.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
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

	it('opens the component chosen in the finder on its own page, and the finder names it', async () => {
		await open(() => ok(ready()));
		await press(finder());
		await settle();
		await act(async () => void [...document.querySelectorAll('[cmdk-item]')].find((i) => i.textContent === 'PopoverHeader')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		await settle();
		expect(document.querySelector('h3')?.textContent).toBe('PopoverHeader');
		expect(document.querySelector('[role="combobox"]')?.textContent).toBe('PopoverHeader');
	});

	it('has the finder in the toolbar beside the name and branch, and Sync at its right, as Projects does', async () => {
		await open(() => ok(ready()));
		const toolbar = document.querySelector('h2')!.parentElement!;
		expect(toolbar.contains(finder())).toBe(true);
		expect(toolbar.contains(button('Sync'))).toBe(true);
		expect(toolbar.textContent).toBe('FUIFind a componentSync');
		expect(toolbar.querySelector('h2')!.compareDocumentPosition(finder()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(finder().compareDocumentPosition(button('Sync')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		// The old search box is gone.
		expect(document.querySelector('input[aria-label="Search components"]')).toBeNull();
	});

	it('has no switcher between components and composites, and no count', async () => {
		await open(() => ok(ready()));
		expect(document.querySelector('[role="tablist"]')).toBeNull();
		expect(text()).not.toMatch(/\d+ components/);
		expect(rows()).toHaveLength(5);
	});

	it('has no filter for components without a story', async () => {
		await open(() => ok(ready()));
		expect([...document.querySelectorAll('button')].some((b) => /without a story/i.test(b.textContent ?? ''))).toBe(false);
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
		expect(problem.nextElementSibling?.textContent).toBe('Sync');
		expect(document.querySelector('h2')!.parentElement!.contains(problem)).toBe(true);
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

	it('shows the Connect screen when there is no library, and the list once one is connected', async () => {
		let connected = false;
		const app = fakeApp({
			designSystemCatalog: async () => ok(connected ? ready() : { state: 'no-clone', repository: 'flocksafety/flock-react-component-lib', lost: null }),
			listRepositories: async () => ok([]),
			locateDesignSystem: async () => {
				connected = true;
				return ok(true);
			},
		});
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(DesignSystem, { hidden: false }));
		expect(text()).toContain('Connect the design system');
		const locate = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Locate')!;
		await act(async () => void locate.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
		await press(button('Browse…'));
		await settle();
		expect(rows()).toHaveLength(5);
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
