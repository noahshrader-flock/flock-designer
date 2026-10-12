// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Projects } from '../src/renderer/Projects';
import type { Project } from '../src/shared/contract';
import { button, fakeApp, ok, openMenu, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/** Ordering the Projects screen: a dropdown beside the search, last updated first unless it is changed. */

const project = (id: string, title: string, updatedAt: string | null): Project =>
	({ id, title, records: [], iterations: [], people: [], updatedAt }) as unknown as Project;
const PROJECTS = [
	project('banana', 'Banana', '2026-10-05T00:00:00Z'),
	project('cherry', 'Cherry', '2026-10-08T00:00:00Z'),
	project('apple', 'Apple', '2026-10-01T00:00:00Z'),
];

let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async () => {
	const app = fakeApp({
		listProjects: async () => ok(PROJECTS),
		lastCheckout: async () => ok(null),
		suggestCheckout: async () => ok(null),
		publishStatus: async () => ok({ state: 'unavailable' }),
	});
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Projects, { hidden: false }));
	await settle();
};
/** Opens the menu as a pointer does, and returns its radio items. */
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

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
});

describe('ordering the projects', () => {
	it('has a dropdown right after the search, saying how they are ordered, last updated to begin with', async () => {
		await open();
		const search = document.querySelector('input[type="search"]') as HTMLElement;
		const sort = button('Sort projects: Last updated');
		expect(search.compareDocumentPosition(sort) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(titles()).toEqual(['Cherry', 'Banana', 'Apple']);
	});

	it('offers only last updated and alphabetical, with the one in use chosen', async () => {
		await open();
		const items = await choices(button('Sort projects: Last updated'));
		expect(items.map((i) => i.textContent)).toEqual(['Last updated', 'Alphabetical']);
		expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false']);
	});

	it('orders by name when asked, says so on the dropdown, and goes back', async () => {
		await open();
		await choose(button('Sort projects: Last updated'), 'Alphabetical');
		expect(titles()).toEqual(['Apple', 'Banana', 'Cherry']);
		expect(button('Sort projects: Alphabetical')).toBeTruthy();
		await choose(button('Sort projects: Alphabetical'), 'Last updated');
		expect(titles()).toEqual(['Cherry', 'Banana', 'Apple']);
	});

	it('orders what a search leaves, too', async () => {
		await open();
		await typeInto(document.querySelector('input[type="search"]') as HTMLInputElement, 'e');
		await settle();
		// Apple and Cherry have an "e"; Banana does not.
		expect(titles()).toEqual(['Cherry', 'Apple']);
		await choose(button('Sort projects: Last updated'), 'Alphabetical');
		expect(titles()).toEqual(['Apple', 'Cherry']);
	});
});
