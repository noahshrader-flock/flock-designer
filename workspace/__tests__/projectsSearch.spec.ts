// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Projects } from '../src/renderer/Projects';
import type { Project } from '../src/shared/contract';
import { aProject } from './fixtures';
import { fakeApp, ok, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/** Searching the Projects screen: a field beside its name that narrows the cards as you type. */

const project = (id: string, title: string, people: Project['people'] = []): Project => aProject({ id, title, people });
const PROJECTS = [
	project('alert-history', 'Alert history', [{ name: 'Noah Shrader', login: 'noah' }]),
	project('admin-usage', 'Admin usage'),
	project('role-comparison', 'Role comparison'),
];

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (projects = PROJECTS) => {
	const app = fakeApp({
		listProjects: async () => ok(projects),
		lastCheckout: async () => ok(null),
		suggestCheckout: async () => ok(null),
		publishStatus: async () => ok({ state: 'unavailable' }),
	});
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Projects, { hidden: false }));
	await settle();
	return app;
};
const search = () => document.querySelector('input[type="search"]') as HTMLInputElement;
const titles = () => [...document.querySelectorAll('[data-slot="card-title"]')].map((t) => t.textContent);
const type = async (text: string) => {
	await typeInto(search(), text);
	await settle();
};

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('searching the projects', () => {
	it('has a field right after the name of the screen, in the toolbar', async () => {
		await open();
		const heading = [...document.querySelectorAll('h1')].find((h) => h.textContent === 'Projects') as HTMLElement;
		expect(search().getAttribute('aria-label')).toBe('Search projects');
		expect(heading.compareDocumentPosition(search()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(heading.parentElement?.contains(search())).toBe(true);
		// None is dated, so they are in name order.
		expect(titles()).toEqual(['Admin usage', 'Alert history', 'Role comparison']);
	});

	it('narrows the cards as you type, and brings them back when it is cleared', async () => {
		await open();
		await type('adm');
		expect(titles()).toEqual(['Admin usage']);
		await type('');
		expect(titles()).toHaveLength(3);
	});

	it('finds a project by who worked on it', async () => {
		await open();
		await type('noah');
		expect(titles()).toEqual(['Alert history']);
	});

	it('says when nothing matches, and how to get the list back', async () => {
		await open();
		await type('zzz');
		expect(titles()).toEqual([]);
		expect(document.body.textContent).toContain('No project matches “zzz”');
		await press([...document.querySelectorAll('button')].find((b) => b.textContent === 'Clear search') as HTMLElement);
		expect(search().value).toBe('');
		expect(titles()).toHaveLength(3);
	});

	it('is not there when there are no projects, where there is nothing to search', async () => {
		await open([]);
		expect(search()).toBeNull();
		expect(document.body.textContent).toContain('No projects yet');
	});
});

describe('while the projects are read', () => {
	it('shows the screen with its toolbar, and the cards as skeletons, said in words for a screen reader', async () => {
		const app = fakeApp({
			listProjects: () => new Promise(() => undefined),
			lastCheckout: async () => ok(null),
			suggestCheckout: async () => ok(null),
			publishStatus: async () => ok({ state: 'unavailable' }),
		});
		(window as unknown as { workspace: unknown }).workspace = app.api;
		current = await render(createElement(Projects, { hidden: false }));
		await settle();
		expect([...document.querySelectorAll('h1')].some((h) => h.textContent === 'Projects')).toBe(true);
		const status = document.querySelector('[role="status"][aria-busy="true"]') as HTMLElement;
		expect(status.querySelector('.sr-only')?.textContent).toBe('Loading projects…');
		expect(status.querySelectorAll('[data-slot="card"]').length).toBeGreaterThan(0);
		// Nothing said about the list before it is read: not that there are none.
		expect(document.body.textContent).not.toContain('No projects yet');
	});
});
