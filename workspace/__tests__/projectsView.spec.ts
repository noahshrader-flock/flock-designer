import { projectIteration } from './fixtures';
// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Projects } from '../src/renderer/Projects';
import type { Project } from '../src/shared/contract';
import { fakeApp, ok, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/** The Projects screen as a list or a grid: a switch in the toolbar, after the filters, and the choice kept. */

const project = (id: string, title: string): Project => ({
	id,
	title,
	folder: null,
	records: [],
	iterations: [projectIteration({ name: 'v1-i1', branch: `prototype/${id}/v1-i1`, createdAt: '2026-10-01T00:00:00Z' })],
	people: [],
});
const PROJECTS = [project('alert-history', 'Alert history'), project('admin-usage', 'Admin usage')];

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (listProjects: () => unknown = async () => ok(PROJECTS)) => {
	const app = fakeApp({
		listProjects: listProjects as never,
		lastCheckout: async () => ok(null),
		suggestCheckout: async () => ok(null),
		publishStatus: async () => ok({ state: 'unavailable' }),
	});
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Projects, { hidden: false }));
	await settle();
	return app;
};
const viewButton = (name: 'List' | 'Grid') => document.querySelector<HTMLElement>(`[aria-label="View"] [aria-label="${name}"]`)!;
const shown = () => document.querySelector('[aria-label="View"] [aria-checked="true"]')?.getAttribute('aria-label');
const cards = () => [...document.querySelectorAll('[data-slot="card-title"]')].map((t) => t.textContent);
const rows = () => [...document.querySelectorAll('[data-project]')].map((r) => r.getAttribute('data-project'));

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	localStorage.clear();
});

describe('the switch', () => {
	it('is in the toolbar at the immediate right of the folders filter, with the search and the sort: not beside Sync', async () => {
		await open(async () => ok([{ ...PROJECTS[0]!, folder: 'Admin' }, PROJECTS[1]!]));
		const toolbar = document.querySelector('[class*="h-(--toolbar-height)"]')!;
		const sync = [...toolbar.querySelectorAll('button')].find((b) => b.textContent?.includes('Sync'))!;
		const group = document.querySelector('[aria-label="View"]')!;
		expect(toolbar.contains(group)).toBe(true);
		// Last of the controls that change what the list shows, right after the folders filter, which is after the search.
		const controls = group.parentElement!;
		expect(controls.lastElementChild).toBe(group);
		expect(group.previousElementSibling?.textContent).toContain('All folders');
		expect(controls.querySelector('input[aria-label="Search projects"]')).not.toBeNull();
		// Sync's side is for what syncing says, so the switch is before it and not beside it.
		expect(controls.contains(sync)).toBe(false);
		expect(group.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(sync.parentElement!.contains(group)).toBe(false);
	});

	it('is a grid at first, as the screen has always been, with Grid pressed', async () => {
		await open();
		expect(shown()).toBe('Grid');
		expect(cards()).toEqual(['Admin usage', 'Alert history']);
		expect(rows()).toEqual([]);
	});

	it('is not there when there are no projects, where there is nothing to switch', async () => {
		await open(async () => ok([]));
		expect(document.querySelector('[aria-label="View"]')).toBeNull();
	});
});

describe('the list', () => {
	it('is a row for each project in the same order, instead of the cards, when List is pressed', async () => {
		await open();
		await press(viewButton('List'));
		await settle();
		expect(shown()).toBe('List');
		expect(rows()).toEqual(['admin-usage', 'alert-history']);
		expect(cards()).toEqual([]);
	});

	it('is narrowed by the search and put in order by the sort, as the cards are', async () => {
		await open();
		await press(viewButton('List'));
		const search = document.querySelector('input[type="search"]') as HTMLInputElement;
		await typeInto(search, 'alert');
		await settle();
		expect(rows()).toEqual(['alert-history']);
	});

	it('opens a project into its newest prototype, as its card does', async () => {
		await open();
		await press(viewButton('List'));
		await press(document.querySelector<HTMLElement>('[data-project="admin-usage"] button')!);
		await settle();
		// The Review screen is on, and the list is not.
		expect(document.querySelector('[data-project]')).toBeNull();
	});

	it('is remembered: the screen opens in the view it was left in', async () => {
		await open();
		await press(viewButton('List'));
		await unmountAll(current!.root);
		await open();
		expect(shown()).toBe('List');
		expect(rows()).toHaveLength(2);
	});

	it('is remembered apart from the Design System’s: choosing here never changes it there', async () => {
		await open();
		await press(viewButton('List'));
		expect(localStorage.getItem('dsnr.projectsView')).toBe('list');
		expect(localStorage.getItem('dsnr.componentsView')).toBeNull();
	});
});

describe('while the projects are read', () => {
	it('shows rows’ shapes in the list, and the cards’ shapes in the grid, so nothing jumps when they arrive', async () => {
		localStorage.setItem('dsnr.projectsView', 'list');
		await open(() => new Promise(() => undefined));
		expect(document.querySelector('ul [data-thumbnail-skeleton]')).not.toBeNull();
		expect(document.querySelector('[data-slot="card"]')).toBeNull();
		await unmountAll(current!.root);
		localStorage.setItem('dsnr.projectsView', 'grid');
		await open(() => new Promise(() => undefined));
		expect(document.querySelector('[data-slot="card"]')).not.toBeNull();
	});
});
