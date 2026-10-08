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

const component = (name: string, more: Partial<CatalogComponent> = {}): CatalogComponent => ({
	id: `components/${name}`,
	name,
	group: 'Buttons',
	composite: false,
	subtitle: null,
	stories: [{ file: `src/components/${name}/${name}.stories.tsx`, title: `Buttons/${name}`, storybook: `https://sb.example/${name}` }],
	figma: null,
	source: `https://github.com/x/${name}`,
	partOf: null,
	...more,
});

const COMPONENTS: CatalogComponent[] = [
	component('FSButton', { subtitle: 'Buttons allow users to take actions.', figma: 'https://figma.example/button' }),
	component('FSCard', { group: 'Surfaces', subtitle: 'Cards contain content.' }),
	component('FSCardContent', { group: 'Surfaces', stories: [], partOf: 'components/FSCard' }),
	component('FSPopovers', {
		id: 'compositeComponents/FSPopovers',
		group: 'Popovers',
		composite: true,
		stories: [
			{ file: 'a.stories.tsx', title: 'Popovers/PopoverHeader', storybook: 'https://sb.example/header' },
			{ file: 'b.stories.tsx', title: 'Popovers/PopoverLineItem', storybook: 'https://sb.example/line' },
		],
	}),
	component('FSApp', { group: 'Ungrouped', stories: [] }),
];

const ready = (update: CatalogUpdate = 'unchanged', components = COMPONENTS): Catalog => ({
	state: 'ready',
	commit: 'fc2658f0123456789',
	committedAt: '2026-10-07T19:03:13Z',
	update,
	components,
});

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (answers: (refresh: boolean) => ReturnType<typeof ok<Catalog>> | ReturnType<typeof fail>, hidden = false) => {
	const app = fakeApp({ designSystemCatalog: async (refresh: boolean) => answers(refresh) });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(DesignSystem, { hidden }));
	return app;
};
const rows = () => [...document.querySelectorAll('[data-component]')].map((li) => li.getAttribute('data-component')!.split('/')[1]);
const row = (name: string) => document.querySelector(`[data-component$="/${name}"]`) as HTMLElement;
const links = (name: string) => [...row(name).querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
const groups = () => [...document.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
const text = () => document.body.textContent ?? '';

afterEach(async () => {
	delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the list', () => {
	it('shows the components grouped, in the catalog’s order, with the header', async () => {
		await open(() => ok(ready()));
		expect(groups()).toEqual(['Buttons', 'Surfaces', 'Popovers', 'Ungrouped']);
		expect(rows()).toEqual(['FSButton', 'FSCard', 'FSCardContent', 'FSPopovers', 'FSApp']);
		expect(document.querySelector('[aria-label="Branch develop"]')).not.toBeNull();
		// No commit, no date, and nothing about being up to date: only a problem is said.
		expect(text()).not.toMatch(/fc2658f|2026|Oct|up to date|Checking GitHub/i);
		expect(text()).not.toContain('Chromatic');
	});

	it('links each component to Storybook and Source, never Figma; a link not known is not there', async () => {
		await open(() => ok(ready()));
		expect(links('FSButton')).toEqual([
			['Storybook', 'https://sb.example/FSButton'],
			['Source', 'https://github.com/x/FSButton'],
		]);
		expect(links('FSCard').map(([t]) => t)).toEqual(['Storybook', 'Source']);
		expect(links('FSApp').map(([t]) => t)).toEqual(['Source']);
		expect([...document.querySelectorAll('a')].every((a) => a.getAttribute('target') === '_blank')).toBe(true);
	});

	it('gives a folder with several stories a link to each, by name', async () => {
		await open(() => ok(ready()));
		expect(links('FSPopovers').slice(0, 2)).toEqual([
			['Storybook: PopoverHeader', 'https://sb.example/header'],
			['Storybook: PopoverLineItem', 'https://sb.example/line'],
		]);
	});

	it('marks a gap “No story”, and a part sits under its parent with no mark', async () => {
		await open(() => ok(ready()));
		expect(row('FSApp').textContent).toContain('No story');
		expect(row('FSCardContent').textContent).not.toContain('No story');
		expect(row('FSCardContent').className).toContain('pl-10');
		expect(rows().indexOf('FSCardContent')).toBe(rows().indexOf('FSCard') + 1);
	});
});

describe('finding a component', () => {
	const finder = () => button('Find a component');
	const choices = () => [...document.querySelectorAll('[cmdk-item]')].map((i) => i.textContent);

	it('lists every component in a searchable dropdown, the New modal’s own, and narrows it as you type', async () => {
		await open(() => ok(ready()));
		await press(finder());
		await settle();
		expect(choices()).toEqual(['FSButton', 'FSCard', 'FSCardContent', 'FSPopovers', 'FSApp']);
		const search = document.querySelector('[cmdk-input]') as HTMLInputElement;
		await typeInto(search, 'card');
		await settle();
		expect(choices().filter((c) => c === 'FSCard' || c === 'FSCardContent')).toHaveLength(2);
		await typeInto(search, 'nothing like it');
		await settle();
		expect(text()).toContain('No component matches.');
	});

	it('brings the chosen component into view and marks it, leaving the whole list in place', async () => {
		await open(() => ok(ready()));
		const scrolled = vi.fn();
		(HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = function (this: HTMLElement) {
			scrolled(this.getAttribute('data-component'));
		};
		await press(finder());
		await settle();
		await act(async () => void [...document.querySelectorAll('[cmdk-item]')].find((i) => i.textContent === 'FSPopovers')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		await settle();
		expect(scrolled).toHaveBeenCalledWith('compositeComponents/FSPopovers');
		expect(row('FSPopovers').getAttribute('aria-current')).toBe('true');
		expect(row('FSButton').getAttribute('aria-current')).toBeNull();
		expect(rows()).toHaveLength(5);
		expect(button('FSPopovers')).toBeTruthy();
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

	it('says the clone has no develop, naming the clone, and reads no other branch', async () => {
		await open(() => ok({ state: 'no-develop', root: '/h/GitHub/fui' }));
		expect(text()).toContain('This clone has no develop branch');
		expect(text()).toContain('/h/GitHub/fui');
	});

	it('says where it looked when develop has no components', async () => {
		await open(() => ok(ready('unchanged', [])));
		expect(text()).toContain('No components were found on develop, in src/components or src/compositeComponents.');
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
