// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectCard } from '../src/renderer/ProjectCard';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { button, menuItem, openMenu, render, unmountAll } from './reviewHarness';

/**
 * A project card in the Projects grid: its menu at the top right, its name at the bottom right of the cover, who it is
 * by and what to know at a glance underneath. Against the card on its own.
 */

const iteration = (more: Partial<ProjectIteration> = {}): ProjectIteration => ({
	name: 'v1-i1',
	branch: 'fd/admin-usage/v1-i1',
	issueNumber: null,
	previewUrl: null,
	commit: null,
	contributors: [],
	createdAt: '2026-10-01T10:00:00Z',
	...more,
});
// By the app's own rule (`workKind`): codebase work is the iteration named `codebase`; any other is a prototype.
const PROTOTYPE = iteration({ name: 'v1-i2', branch: 'fd/admin-usage/v1-i2' });
const CODEBASE = iteration({ name: 'codebase', branch: 'feature/admin-usage' });
const project = (more: Partial<Project> = {}): Project => ({
	id: 'admin-usage',
	title: 'Admin usage',
	records: [],
	iterations: [],
	people: [],
	openComments: 0,
	...more,
});

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (p: Project, handlers: { onOpen?: () => void; onViewRecord?: () => void } = {}) => {
	const onOpen = vi.fn(handlers.onOpen);
	const onViewRecord = vi.fn(handlers.onViewRecord);
	current = await render(createElement(ProjectCard, { project: p, onOpen, onViewRecord }));
	return { onOpen, onViewRecord };
};
const text = () => document.body.textContent ?? '';
const kebab = () => button('More for Admin usage');

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the cover', () => {
	it('has the project’s name at its bottom right, the menu at its top right, and nothing else: no folder, no id', async () => {
		await show(project({ iterations: [CODEBASE] }));
		const cover = document.querySelector('.aspect-\\[1920\\/1080\\]')!;
		const [top, name] = [...cover.children];
		expect(top!.className).toContain('justify-end');
		expect(top!.contains(kebab())).toBe(true);
		expect(name!.textContent).toBe('Admin usage');
		expect(name!.className).toContain('text-right');
		expect(cover.querySelector('svg.lucide-folder')).toBeNull();
		expect(text()).not.toContain('admin-usage');
		expect(cover.className).not.toMatch(/\bbg-/);
	});

	it('keeps the name at the bottom when there is no menu to put at the top', async () => {
		await show(project());
		const cover = document.querySelector('.aspect-\\[1920\\/1080\\]')!;
		expect(cover.children).toHaveLength(2);
		expect(cover.children[0]!.children).toHaveLength(0);
		expect(document.querySelector('[aria-label^="More for"]')).toBeNull();
	});
});

describe('the menu', () => {
	it('opens what is made, each with its icon, and only what is made', async () => {
		const { onOpen } = await show(project({ iterations: [PROTOTYPE, CODEBASE] }));
		const items = await openMenu(kebab());
		expect(items.map((i) => i.textContent)).toEqual(['View prototype', 'View codebase']);
		expect(items.every((i) => i.querySelector('svg'))).toBe(true);
		menuItem(items, 'View codebase').click();
		expect(onOpen).toHaveBeenCalledWith(CODEBASE);
	});

	it.each([
		['a prototype alone', [PROTOTYPE], ['View prototype']],
		['codebase work alone', [CODEBASE], ['View codebase']],
	])('has only what exists: %s', async (_, iterations, labels) => {
		await show(project({ iterations }));
		expect((await openMenu(kebab())).map((i) => i.textContent)).toEqual(labels);
	});

	it('opens the newest of each kind', async () => {
		const older = iteration({ name: 'v1-i1', createdAt: '2026-09-01T10:00:00Z' });
		const { onOpen } = await show(project({ iterations: [older, PROTOTYPE] }));
		menuItem(await openMenu(kebab()), 'View prototype').click();
		expect(onOpen).toHaveBeenCalledWith(PROTOTYPE);
	});

	it('lists the project’s records after them, set apart, and opens one', async () => {
		const { onViewRecord } = await show(project({ iterations: [CODEBASE], records: ['brief.md', 'design-notes.md'] }));
		const items = await openMenu(kebab());
		expect(items.map((i) => i.textContent)).toEqual(['View codebase', 'Brief', 'Design notes']);
		expect(document.querySelector('[role="separator"]')).not.toBeNull();
		menuItem(items, 'Design notes').click();
		expect(onViewRecord).toHaveBeenCalledWith('design-notes.md');
	});

	it('has only the records when nothing is made, with no separator', async () => {
		await show(project({ records: ['brief.md'] }));
		expect((await openMenu(kebab())).map((i) => i.textContent)).toEqual(['Brief']);
		expect(document.querySelector('[role="separator"]')).toBeNull();
	});
});

describe('under the cover', () => {
	it('has the first person’s avatar and name, and no date', async () => {
		await show(project({ iterations: [CODEBASE], people: [{ name: 'Noah Shrader', login: 'noah' }] }));
		expect(text()).toContain('Noah Shrader');
		expect(document.querySelector('[data-slot="avatar"]')).not.toBeNull();
		expect(text()).not.toMatch(/Started|2026|Oct/);
		expect(document.querySelector('time')).toBeNull();
	});

	it('says how many others there are, and names them on hover', async () => {
		await show(
			project({
				iterations: [CODEBASE],
				people: [
					{ name: 'Noah Shrader', login: 'noah' },
					{ name: 'Sam Lee', login: 'sam' },
					{ name: 'Ava Cho', login: null },
				],
			}),
		);
		expect(text()).toContain('Noah Shrader');
		expect(text()).toContain('+2');
		expect(text()).not.toContain('Sam Lee');
	});

	it('says nothing about people when there are none', async () => {
		await show(project({ iterations: [CODEBASE] }));
		expect(document.querySelector('[data-slot="avatar"]')).toBeNull();
	});

	it('says what to know at a glance: only on this machine, open comments, or that nothing is made', async () => {
		await show(project({ localOnly: true, openComments: 3 }));
		expect(text()).toContain('Only on this machine');
		expect(document.querySelector('[aria-label="3 open comments"]')).not.toBeNull();
		expect(text()).toContain('Nothing made yet.');
		await unmountAll(current!.root);
		await show(project({ iterations: [CODEBASE], openComments: 1 }));
		expect(document.querySelector('[aria-label="1 open comment"]')).not.toBeNull();
		expect(text()).not.toContain('Nothing made yet.');
		expect(text()).not.toContain('Only on this machine');
	});

	it('has no buttons: the way in is the menu', async () => {
		await show(project({ iterations: [PROTOTYPE, CODEBASE] }));
		expect([...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['More for Admin usage']);
	});
});
