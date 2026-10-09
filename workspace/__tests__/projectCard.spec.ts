// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectCard } from '../src/renderer/ProjectCard';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { press, render, unmountAll } from './reviewHarness';

/**
 * A project card in the Projects grid: the project's name on the cover; in the footer, who it is by at the left and how
 * many comments its prototypes have at the right; and the whole card a way into its newest prototype. A project with only
 * codebase work links to it on GitHub instead. Against the card on its own.
 */

const iteration = (more: Partial<ProjectIteration> = {}): ProjectIteration => ({
	name: 'v1-i1',
	branch: 'prototype/admin-usage/v1-i1',
	issueNumber: null,
	openComments: 0,
	previewUrl: null,
	commit: null,
	contributors: [],
	createdAt: '2026-10-01T10:00:00Z',
	...more,
});
// By the app's own rule (`workKind`): codebase work is the iteration named `codebase`; any other is a prototype.
const NEWEST = iteration({ name: 'v1-i2', branch: 'prototype/admin-usage/v1-i2', createdAt: '2026-10-05T10:00:00Z' });
const OLDER = iteration({ name: 'v1-i1', createdAt: '2026-09-01T10:00:00Z' });
const CODEBASE = iteration({ name: 'codebase', branch: 'feature/admin-usage', repository: 'flocksafety/flock-coke' });
const project = (more: Partial<Project> = {}): Project => ({
	id: 'admin-usage',
	title: 'Admin usage',
	records: [],
	iterations: [],
	people: [],
	...more,
});
const NOAH = { name: 'Noah Shrader', login: 'noah' };

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (p: Project) => {
	const onOpen = vi.fn();
	current = await render(createElement(ProjectCard, { project: p, onOpen }));
	return { onOpen };
};
const card = () => document.querySelector<HTMLElement>('[data-slot="card"]')!;
const cover = () => document.querySelector('[data-slot="card-cover"]')!;
const footer = () => document.querySelector<HTMLElement>('[data-slot="card-footer"]')!;

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the cover', () => {
	it('has the project’s name at its bottom left, and nobody on it: who it is by is in the footer', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH] }));
		const [top, bottom] = [...cover().children];
		expect(bottom!.textContent).toBe('Admin usage');
		expect(bottom!.className.split(' ')).toContain('text-lg');
		expect(cover().querySelector('[data-slot="avatar"]')).toBeNull();
		expect(top!.textContent).toBe('');
		expect(cover().className).not.toMatch(/\bbg-/);
	});

	it('says at its top when the project is only on this machine', async () => {
		await show(project({ localOnly: true, iterations: [NEWEST] }));
		expect(cover().children[0]!.textContent).toContain('Only on this machine');
	});
});

describe('the footer', () => {
	it('has who it is by at the left and how many comments its prototypes have at the right', async () => {
		await show(project({ iterations: [iteration({ ...NEWEST, openComments: 3 }), iteration({ ...OLDER, openComments: 2 })], people: [NOAH] }));
		const [left, right] = [...footer().children];
		expect(left!.querySelector('[data-slot="avatar"]')!.getAttribute('data-size')).toBe('xs');
		expect(left!.querySelector('.truncate')!.textContent).toBe('Noah Shrader');
		// Every prototype's comments, together.
		expect(right!.getAttribute('aria-label')).toBe('5 comments');
		expect(right!.textContent).toBe('5');
		expect(right!.querySelector('.lucide-message-square')).not.toBeNull();
		expect(footer().className.split(' ')).toContain('justify-between');
	});

	it('says how many others there are, and names them on hover', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH, { name: 'Sam Lee', login: 'sam' }, { name: 'Ava Cho', login: null }] }));
		expect(footer().textContent).toContain('Noah Shrader');
		expect(footer().textContent).toContain('+2');
		expect(footer().textContent).not.toContain('Sam Lee');
	});

	it('counts one comment as one, and none as none', async () => {
		await show(project({ iterations: [iteration({ ...NEWEST, openComments: 1 })] }));
		expect(footer().children[1]!.getAttribute('aria-label')).toBe('1 comment');
		await unmountAll(current!.root);
		await show(project({ iterations: [NEWEST] }));
		expect(footer().children[1]!.getAttribute('aria-label')).toBe('0 comments');
	});

	it('does not count comments on codebase work: the card is about its prototypes', async () => {
		await show(project({ iterations: [iteration({ ...NEWEST, openComments: 2 }), iteration({ ...CODEBASE, openComments: 7 })] }));
		expect(footer().children[1]!.getAttribute('aria-label')).toBe('2 comments');
	});

	it('is the same height on every card, so a row of cards lines up', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH] }));
		const withPeople = footer().className;
		await unmountAll(current!.root);
		await show(project());
		expect(footer().className).toBe(withPeople);
		expect(withPeople.split(' ')).toContain('h-12');
	});
});

describe('opening it', () => {
	it('is the whole card, into its newest prototype', async () => {
		const { onOpen } = await show(project({ iterations: [OLDER, NEWEST] }));
		expect(card().getAttribute('role')).toBe('button');
		expect(card().getAttribute('aria-label')).toBe('Open Admin usage');
		await press(card());
		expect(onOpen).toHaveBeenCalledWith(NEWEST);
	});

	it('can be done from the keyboard', async () => {
		const { onOpen } = await show(project({ iterations: [NEWEST] }));
		expect(card().tabIndex).toBe(0);
		card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		card().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		expect(onOpen).toHaveBeenCalledTimes(2);
	});

	it('has nothing else to press on it', async () => {
		await show(project({ iterations: [NEWEST, CODEBASE], records: ['brief.md'] }));
		expect(card().querySelectorAll('button, a')).toHaveLength(0);
	});
});

describe('a project with only codebase work', () => {
	it('links to it on GitHub, and is not a way into the app', async () => {
		const { onOpen } = await show(project({ iterations: [CODEBASE], people: [NOAH] }));
		const link = footer().querySelector('a')!;
		expect(link.textContent).toBe('Built in code');
		expect(link.getAttribute('href')).toBe('https://github.com/flocksafety/flock-coke/tree/feature/admin-usage');
		expect(link.getAttribute('target')).toBe('_blank');
		expect(card().getAttribute('role')).toBeNull();
		await press(card());
		expect(onOpen).not.toHaveBeenCalled();
		expect(footer().textContent).toContain('Noah Shrader');
	});

	it('says it is built in code, with no link, when its record does not say where', async () => {
		await show(project({ iterations: [iteration({ ...CODEBASE, repository: null })] }));
		expect(footer().querySelector('a')).toBeNull();
		expect(footer().textContent).toContain('Built in code');
	});
});

describe('a project with nothing made', () => {
	it('says so, and is not a way in', async () => {
		await show(project());
		expect(footer().textContent).toContain('Nothing made yet');
		expect(card().getAttribute('role')).toBeNull();
	});
});
