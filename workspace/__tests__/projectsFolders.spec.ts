// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Projects } from '../src/renderer/Projects';
import type { Project } from '../src/shared/contract';
import { button, fakeApp, ok, openMenu, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * Filtering the Projects screen by folder (F2 of the folders plan): a dropdown beside the sort, there only once a project
 * is in a folder, and each project's folder said quietly on its card and its row.
 */

const project = (id: string, title: string, updatedAt: string, folder: string | null): Project =>
	({ id, title, records: [], iterations: [], people: [], updatedAt, folder }) as unknown as Project;
const PROJECTS = [
	project('alerts', 'Alert history', '2026-10-08T00:00:00Z', 'Admin'),
	project('usage', 'Admin usage', '2026-10-07T00:00:00Z', 'admin'),
	project('compare', 'Role comparison', '2026-10-06T00:00:00Z', 'Roles'),
	project('loose', 'Zone coverage', '2026-10-05T00:00:00Z', null),
];

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (projects: Project[] = PROJECTS, later?: Project[]) => {
	let reads = 0;
	const app = fakeApp({ listProjects: async () => ok(reads++ > 0 && later ? later : projects), publishNow: async () => ok({ state: 'unavailable' }), lastCheckout: async () => ok(null), suggestCheckout: async () => ok(null), publishStatus: async () => ok({ state: 'unavailable' }) });
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Projects, { hidden: false }));
	await settle();
};
const choices = async (trigger: Element): Promise<HTMLElement[]> => {
	await openMenu(trigger);
	return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
};
const choose = async (trigger: Element, name: string) => {
	const item = (await choices(trigger)).find((i) => i.textContent === name) as HTMLElement;
	await press(item);
	await settle();
};
const titles = () => [...document.querySelectorAll('[data-slot="card-title"]')].map((t) => t.textContent);
const folderButton = () => document.querySelector<HTMLElement>('button[aria-label^="Folder:"]');

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	localStorage.clear();
});

describe('the folder filter', () => {
	it('is beside the sort, showing every project to begin with', async () => {
		await open();
		const sort = button('Sort projects: Last updated');
		const folder = button('Folder: All folders');
		expect(sort.compareDocumentPosition(folder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(titles()).toHaveLength(4);
	});

	it('offers all folders, each folder in use once whatever its case, in order, then no folder', async () => {
		await open();
		const items = await choices(button('Folder: All folders'));
		expect(items.map((i) => i.textContent)).toEqual(['All folders', 'Admin', 'Roles', 'No folder']);
		expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
	});

	it('shows only a folder’s projects when one is chosen, its spellings as one, and says so on the dropdown', async () => {
		await open();
		await choose(button('Folder: All folders'), 'Admin');
		expect(titles()).toEqual(['Alert history', 'Admin usage']);
		await choose(button('Folder: Admin'), 'No folder');
		expect(titles()).toEqual(['Zone coverage']);
		await choose(button('Folder: No folder'), 'All folders');
		expect(titles()).toHaveLength(4);
	});

	it('narrows what a search leaves, and a search narrows what it leaves', async () => {
		await open();
		await choose(button('Folder: All folders'), 'Admin');
		await typeInto(document.querySelector('input[type="search"]') as HTMLInputElement, 'usage');
		await settle();
		expect(titles()).toEqual(['Admin usage']);
	});

	it('shows every project again when the folder chosen is in no project any more, as after a move on another machine', async () => {
		await open(PROJECTS, PROJECTS.map((p) => (p.folder === 'Roles' ? { ...p, folder: 'Admin' } : p)));
		await choose(button('Folder: All folders'), 'Roles');
		expect(titles()).toEqual(['Role comparison']);
		await press(button('Sync'));
		await settle();
		expect(titles()).toHaveLength(4);
		expect(button('Folder: All folders')).toBeTruthy();
	});

	it('offers no folder only when some project has none', async () => {
		await open(PROJECTS.slice(0, 3));
		expect((await choices(button('Folder: All folders'))).map((i) => i.textContent)).toEqual(['All folders', 'Admin', 'Roles']);
	});

	it('is not there while no project is in a folder', async () => {
		await open([PROJECTS[3] as Project]);
		expect(folderButton()).toBeNull();
	});
});

describe('a project’s folder', () => {
	it('is said on its card', async () => {
		await open();
		const card = [...document.querySelectorAll('[data-slot="card"]')].find((c) => c.textContent?.includes('Alert history')) as HTMLElement;
		expect(card.querySelector('[data-folder]')?.textContent).toBe('Admin');
		const loose = [...document.querySelectorAll('[data-slot="card"]')].find((c) => c.textContent?.includes('Zone coverage')) as HTMLElement;
		expect(loose.querySelector('[data-folder]')).toBeNull();
	});

	it('is said on its row in the list', async () => {
		localStorage.setItem('dsnr.projectsView', 'list');
		await open();
		const row = document.querySelector('[data-project="compare"]') as HTMLElement;
		expect(row.querySelector('[data-folder]')?.textContent).toBe('Roles');
	});

	it('is found by a search', async () => {
		await open();
		await typeInto(document.querySelector('input[type="search"]') as HTMLInputElement, 'roles');
		await settle();
		expect(titles()).toEqual(['Role comparison']);
	});
});
