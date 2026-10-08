// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectCard } from '../src/renderer/ProjectCard';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { button, menuItem, openMenu, render, unmountAll } from './reviewHarness';

/**
 * A project card in the Projects grid: on the cover, its menu at the top right and its name at the bottom left with who
 * it is by directly under it; in the footer, a stacked list of the ways in. Against the card on its own.
 */

const iteration = (more: Partial<ProjectIteration> = {}): ProjectIteration => ({
	name: 'v1-i1',
	branch: 'fd/admin-usage/v1-i1',
	issueNumber: null,
	openComments: 0,
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
const cover = () => document.querySelector('.aspect-\\[1920\\/1080\\]')!;
const footer = () => document.querySelector('[data-slot="card-footer"]')!;
const NOAH = { name: 'Noah Shrader', login: 'noah' };

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the cover', () => {
	it('has the name at its bottom left with the person directly under it, and the menu at its top right', async () => {
		await show(project({ records: ['brief.md'], people: [NOAH] }));
		const [top, bottom] = [...cover().children];
		expect(top!.contains(kebab())).toBe(true);
		// Last in the top row, which spreads its two ends: badges at the left, the menu at the right.
		expect(top!.className).toContain('justify-between');
		expect(top!.lastElementChild!.contains(kebab())).toBe(true);
		expect(bottom!.children[0]!.textContent).toBe('Admin usage');
		const person = bottom!.children[1]!;
		expect(person.querySelector('[data-slot="avatar"]')).not.toBeNull();
		expect(person.querySelector('.truncate')!.textContent).toBe('Noah Shrader');
		// One size down from the design system's small avatar, and the name one size up from base.
		expect(person.querySelector('[data-slot="avatar"]')!.getAttribute('data-size')).toBe('xs');
		expect(bottom!.children[0]!.className.split(' ')).toContain('text-lg');
		expect(bottom!.children[0]!.className).not.toContain('text-right');
		// Stacked top to bottom, as written: not reversed, with room between the name and the person.
		expect(bottom!.className.split(' ')).toContain('flex-col');
		expect(bottom!.className.split(' ')).toContain('gap-2');
		expect(cover().querySelector('svg.lucide-folder')).toBeNull();
		expect(text()).not.toContain('admin-usage');
		expect(cover().className).not.toMatch(/\bbg-/);
	});

	it('has the person’s avatar and name, and no date', async () => {
		await show(project({ iterations: [CODEBASE], people: [NOAH] }));
		expect(cover().querySelector('[data-slot="avatar"]')).not.toBeNull();
		expect(text()).not.toMatch(/Started|2026|Oct/);
		expect(document.querySelector('time')).toBeNull();
	});

	it('says how many others there are, and names them on hover', async () => {
		await show(project({ people: [NOAH, { name: 'Sam Lee', login: 'sam' }, { name: 'Ava Cho', login: null }] }));
		expect(text()).toContain('Noah Shrader');
		expect(text()).toContain('+2');
		expect(text()).not.toContain('Sam Lee');
	});

	it('has no avatar when there are no people, and the name stays at the bottom with nothing at the top', async () => {
		await show(project());
		expect(document.querySelector('[data-slot="avatar"]')).toBeNull();
		const [top, bottom] = [...cover().children];
		expect(top!.children).toHaveLength(1);
		expect(top!.textContent).toBe('');
		expect(bottom!.textContent).toBe('Admin usage');
	});

	it('says across from the menu when the project is only on this machine', async () => {
		await show(project({ localOnly: true, iterations: [CODEBASE] }));
		expect(cover().children[0]!.textContent).toContain('Only on this machine');
		await unmountAll(current!.root);
		await show(project({ iterations: [CODEBASE] }));
		expect(text()).not.toContain('Only on this machine');
	});

	it('has no comment count on the cover: the counts are on the ways in', async () => {
		await show(project({ iterations: [iteration({ openComments: 4 })] }));
		expect(cover().querySelector('[aria-label*="open comment"]')).toBeNull();
		expect(cover().querySelector('.lucide-message-square')).toBeNull();
	});
});

describe('the menu', () => {
	it('is the project’s records, each with its icon, and opens one', async () => {
		const { onViewRecord } = await show(project({ iterations: [CODEBASE], records: ['brief.md', 'design-notes.md'] }));
		const items = await openMenu(kebab());
		expect(items.map((i) => i.textContent)).toEqual(['Brief', 'Design notes']);
		expect(items.every((i) => i.querySelector('svg'))).toBe(true);
		menuItem(items, 'Design notes').click();
		expect(onViewRecord).toHaveBeenCalledWith('design-notes.md');
	});

	it('is not there when there are no records: the ways in are in the footer', async () => {
		await show(project({ iterations: [PROTOTYPE, CODEBASE] }));
		expect(document.querySelector('[aria-label^="More for"]')).toBeNull();
	});
});

describe('the footer', () => {
	const ways = () => [...footer().querySelectorAll('button')];

	it('stacks View prototype, then View codebase under it, each with its icon, and opens each', async () => {
		const { onOpen } = await show(project({ iterations: [PROTOTYPE, CODEBASE] }));
		expect(ways().map((b) => b.textContent)).toEqual(['View prototype', 'View codebase']);
		expect(ways().every((b) => b.querySelector('svg'))).toBe(true);
		expect(footer().className.split(' ')).toContain('flex-col');
		ways()[1]!.click();
		expect(onOpen).toHaveBeenCalledWith(CODEBASE);
		ways()[0]!.click();
		expect(onOpen).toHaveBeenCalledWith(PROTOTYPE);
	});

	it.each([
		['a prototype alone', [PROTOTYPE], ['View prototype']],
		['codebase work alone', [CODEBASE], ['View codebase']],
	])('has only what exists: %s', async (_, iterations, labels) => {
		await show(project({ iterations }));
		expect(ways().map((b) => b.textContent)).toEqual(labels);
		expect(text()).not.toContain('Nothing made yet.');
	});

	it('opens the newest of each kind', async () => {
		const older = iteration({ name: 'v1-i1', createdAt: '2026-09-01T10:00:00Z' });
		const { onOpen } = await show(project({ iterations: [older, PROTOTYPE] }));
		ways()[0]!.click();
		expect(onOpen).toHaveBeenCalledWith(PROTOTYPE);
	});

	it('says nothing is made when it is not, with no buttons', async () => {
		await show(project());
		expect(footer().textContent).toBe('Nothing made yet.');
		expect(ways()).toHaveLength(0);
	});

	it('shows how many comments are open on each way in, at its far right, with no background', async () => {
		await show(project({ iterations: [iteration({ ...PROTOTYPE, openComments: 3 }), iteration({ ...CODEBASE, openComments: 1 })] }));
		const [prototype, codebase] = ways();
		const count = (b: Element) => b.querySelector('[aria-label*="open comment"]')!;
		expect(count(prototype!).getAttribute('aria-label')).toBe('3 open comments');
		expect(count(prototype!).textContent).toBe('3');
		expect(count(codebase!).getAttribute('aria-label')).toBe('1 open comment');
		for (const b of [prototype!, codebase!]) {
			expect(count(b).className.split(' ')).toContain('ml-auto');
			expect(count(b).className).not.toMatch(/\bbg-/);
			expect(count(b).querySelector('.lucide-message-square')).not.toBeNull();
			expect(b.lastElementChild).toBe(count(b));
		}
	});

	it('counts a kind’s comments across all of its iterations, and shows none when there are none', async () => {
		const first = iteration({ name: 'v1-i1', createdAt: '2026-09-01T10:00:00Z', openComments: 2 });
		const second = iteration({ ...PROTOTYPE, openComments: 3 });
		await show(project({ iterations: [first, second, CODEBASE] }));
		const [prototype, codebase] = ways();
		expect(prototype!.querySelector('[aria-label*="open comment"]')!.textContent).toBe('5');
		expect(codebase!.querySelector('[aria-label*="open comment"]')).toBeNull();
	});

	it('is always as tall as two ways in, so on every card the footer starts at the same line', async () => {
		// A blank place, as tall as a way in, stands for each one that is not there.
		const blanks = () => [...footer().children].filter((c) => c.getAttribute('aria-hidden') === 'true');
		await show(project({ iterations: [PROTOTYPE, CODEBASE] }));
		expect(blanks()).toHaveLength(0);
		await unmountAll(current!.root);
		await show(project({ iterations: [PROTOTYPE] }));
		expect(footer().children).toHaveLength(2);
		expect(blanks()).toHaveLength(1);
		expect(footer().children[0]).toBe(ways()[0]);
		expect(blanks()[0]!.className).toBe('h-8');
		await unmountAll(current!.root);
		await show(project());
		expect(footer().children).toHaveLength(2);
		expect(blanks()).toHaveLength(1);
		expect(footer().children[0]!.textContent).toBe('Nothing made yet.');
	});
});
