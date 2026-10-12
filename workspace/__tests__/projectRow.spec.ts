import { projectIteration } from './fixtures';
// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectRow } from '../src/renderer/ProjectRow';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { fakeApp, ok, press, render, unmountAll } from './reviewHarness';

/**
 * A project in the Projects list: the card's facts in a row. Its picture reduced, its name with who it is by under it, how
 * many versions and comments at the right (or Built in code, or Nothing made yet), and the same way in as its card has.
 */

const iteration = (more: Partial<ProjectIteration> = {}): ProjectIteration =>
	projectIteration({ name: 'v1-i1', branch: 'prototype/admin-usage/v1-i1', createdAt: '2026-10-01T10:00:00Z', ...more });
const NEWEST = iteration({ name: 'v1-i2', branch: 'prototype/admin-usage/v1-i2', createdAt: '2026-10-05T10:00:00Z', openComments: 3 });
const OLDER = iteration({ name: 'v1-i1', createdAt: '2026-09-01T10:00:00Z', openComments: 2 });
const CODEBASE = iteration({ name: 'codebase', branch: 'feature/admin-usage', repository: 'flocksafety/flock-coke' });
const project = (more: Partial<Project> = {}): Project => ({
	id: 'admin-usage',
	title: 'Admin usage',
	folder: null,
	records: [],
	iterations: [],
	people: [],
	...more,
});
const NOAH = { name: 'Noah Shrader', login: 'noah' };

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (p: Project) => {
	const onOpen = vi.fn();
	current = await render(createElement('ul', null, createElement(ProjectRow, { project: p, onOpen })));
	return { onOpen };
};
const rowButton = () => document.querySelector<HTMLElement>('[data-project] button')!;
const text = () => rowButton().textContent;

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the row', () => {
	it('is the project’s name, with who it is by under it, and its versions and comments at the right', async () => {
		await show(project({ iterations: [NEWEST, OLDER], people: [NOAH] }));
		expect(document.querySelector('[data-project]')!.getAttribute('data-project')).toBe('admin-usage');
		// The N is the avatar's, in place of a picture.
		expect(text()).toBe('Admin usageNNoah Shrader1 version•5');
		expect(rowButton().querySelector('[aria-label="5 comments"]')).not.toBeNull();
		// Who it is by is the card's line: the smallest avatar and the gray name.
		expect(rowButton().querySelector('[data-slot="avatar"]')!.getAttribute('data-size')).toBe('2xs');
	});

	it('says Built in code for codebase work alone, and Nothing made yet for a project with none', async () => {
		await show(project({ iterations: [CODEBASE] }));
		expect(text()).toContain('Built in code');
		await unmountAll(current!.root);
		await show(project());
		expect(text()).toContain('Nothing made yet');
	});

	it('says when the project is only on this machine, beside its name', async () => {
		await show(project({ localOnly: true, iterations: [NEWEST] }));
		const badge = [...rowButton().querySelectorAll('[data-slot="badge"]')].find((b) => b.textContent === 'Only on this machine')!;
		expect(badge).toBeTruthy();
		expect(badge.parentElement!.textContent).toContain('Admin usage');
	});

	it('is a name cut short on one line when it is long, as the card’s is', async () => {
		await show(project({ title: 'Admin usage and what each organization has switched on across every role they manage', iterations: [NEWEST] }));
		const title = 'Admin usage and what each organization has switched on across every role they manage';
		// The innermost span that says it: the wrappers around it say the same words.
		const name = [...rowButton().querySelectorAll('span')].filter((s) => s.textContent === title).at(-1)!;
		expect(name.className.split(' ')).toContain('truncate');
	});
});

describe('its picture', () => {
	it('is the card’s: the newest prototype’s, read by the name its record gives it, in the thumbnail', async () => {
		const app = fakeApp({ projectCover: async () => ok('data:image/jpeg;base64,AAAA') });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		await show(
			project({ id: 'row-pictured', iterations: [iteration({ ...NEWEST, cover: 'bbbbbbbbbbbb' }), iteration({ ...OLDER, cover: 'aaaaaaaaaaaa' })] }),
		);
		expect(app.calls.projectCover).toEqual([['row-pictured', 'v1-i2', 'bbbbbbbbbbbb']]);
		expect(rowButton().querySelector('[data-thumbnail] img')!.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
	});

	it('is the soft placeholder when there is none, and asks for nothing', async () => {
		const app = fakeApp();
		(window as unknown as { workspace: unknown }).workspace = app.api;
		await show(project({ iterations: [NEWEST] }));
		expect(app.calls.projectCover).toBeUndefined();
		expect(rowButton().querySelector('[data-thumbnail] img')).toBeNull();
		expect(rowButton().querySelector('[data-thumbnail] [data-picture-area]')!.className.split(' ')).toContain('bg-muted/40');
	});
});

describe('opening it', () => {
	it('is the whole row, into its newest prototype, named as its card is', async () => {
		const { onOpen } = await show(project({ iterations: [OLDER, NEWEST] }));
		expect(rowButton().getAttribute('aria-label')).toBe('Open Admin usage');
		expect(rowButton().querySelector('.lucide-chevron-right')).not.toBeNull();
		await press(rowButton());
		expect(onOpen).toHaveBeenCalledWith(NEWEST);
	});

	it('is, for codebase work alone, a way to GitHub in the browser, marked with the external-link icon', async () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		try {
			const { onOpen } = await show(project({ iterations: [CODEBASE] }));
			expect(rowButton().getAttribute('aria-label')).toBe('Open Admin usage on GitHub');
			expect(rowButton().querySelector('.lucide-external-link')).not.toBeNull();
			await press(rowButton());
			expect(open).toHaveBeenCalledWith('https://github.com/flocksafety/flock-coke/tree/feature/admin-usage', '_blank', 'noreferrer');
			expect(onOpen).not.toHaveBeenCalled();
		} finally {
			open.mockRestore();
		}
	});

	it('is nothing for a project with nothing made: the row is there, and is not a way in', async () => {
		const { onOpen } = await show(project());
		expect(rowButton().hasAttribute('disabled')).toBe(true);
		await press(rowButton());
		expect(onOpen).not.toHaveBeenCalled();
	});
});
