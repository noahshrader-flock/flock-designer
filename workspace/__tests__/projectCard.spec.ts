// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectCard } from '../src/renderer/ProjectCard';
import { CardSkeleton } from '../src/renderer/Skeletons';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { fakeApp, ok, press, render, settle, unmountAll } from './reviewHarness';

/**
 * A project card in the Projects grid, shaped as a component's is: the top is the preview (empty until there is one); the
 * footer has the project's name on a row of its own, and under it who it is by at the left and how many versions and
 * comments its prototypes have at the right. The whole card is a way into its newest prototype. A project with only
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
	route: null,
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
/** The footer's two rows: the name, then who it is by and what it has. */
const nameRow = () => footer().children[0]!;
const details = () => footer().children[1]!;

afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('the cover', () => {
	it('is the preview, empty for now, in the soft color of a component card with no picture; the name and who it is by are in the footer', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH] }));
		const area = cover().querySelector('[data-picture-area]')!;
		expect(area).not.toBeNull();
		expect(area.className.split(' ')).toEqual(expect.arrayContaining(['absolute', 'inset-0', 'bg-muted/40']));
		expect(cover().textContent).toBe('');
		expect(cover().querySelector('[data-slot="avatar"]')).toBeNull();
	});

	it('is the same cover a component card has, the same size', async () => {
		await show(project({ iterations: [NEWEST] }));
		const classes = cover().className.split(' ');
		expect(classes).toEqual(expect.arrayContaining(['aspect-[1920/960]', 'w-full', 'relative', 'overflow-hidden']));
	});

	it('is the picture of its newest prototype, asked for by the picture’s record, faded in once it has loaded', async () => {
		const app = fakeApp({ projectCover: async () => ok('data:image/jpeg;base64,AAAA') });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		await show(project({ iterations: [iteration({ ...NEWEST, cover: 'bbbbbbbbbbbb' }), iteration({ ...OLDER, cover: 'aaaaaaaaaaaa' })] }));
		expect(app.calls.projectCover).toEqual([['admin-usage', 'v1-i2', 'bbbbbbbbbbbb']]);
		const img = cover().querySelector('img')!;
		expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
		expect(img.getAttribute('alt')).toBe('');
	});

	it('waits for its picture with the skeleton, and keeps the soft color if there turns out to be none', async () => {
		let answer: (v: unknown) => void = () => undefined;
		const app = fakeApp({ projectCover: () => new Promise((r) => (answer = r)) });
		(window as unknown as { workspace: unknown }).workspace = app.api;
		await show(project({ id: 'waiting', iterations: [iteration({ ...NEWEST, cover: 'cccccccccccc' })] }));
		expect(cover().querySelector('[data-picture-waiting]')).not.toBeNull();
		answer(ok(null));
		await settle();
		expect(cover().querySelector('[data-picture-waiting]')).toBeNull();
		expect(cover().querySelector('img')).toBeNull();
		expect(cover().querySelector('[data-picture-area]')!.className.split(' ')).toContain('bg-muted/40');
	});

	it('asks for nothing when no prototype has a picture: the cover is as it was', async () => {
		const app = fakeApp();
		(window as unknown as { workspace: unknown }).workspace = app.api;
		await show(project({ iterations: [NEWEST] }));
		expect(app.calls.projectCover).toBeUndefined();
		expect(cover().querySelector('[data-picture-waiting]')).toBeNull();
	});

	it('says at its top left which folder the project is in, and when it is only on this machine', async () => {
		await show(project({ localOnly: true, folder: 'Admin', iterations: [NEWEST] }));
		const badges = [...cover().querySelectorAll('[data-slot="badge"]')];
		expect(badges.map((b) => b.textContent)).toEqual(['Admin', 'Only on this machine']);
		const holder = badges[0]!.parentElement!;
		expect(badges[1]!.parentElement).toBe(holder);
		expect(holder.className.split(' ')).toEqual(expect.arrayContaining(['absolute', 'top-2', 'left-2']));
	});
});

describe('the footer', () => {
	it('has the project’s name on a row of its own, as a component card names itself, one line and cut short when long', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH] }));
		expect(footer().children).toHaveLength(2);
		expect(nameRow().textContent).toBe('Admin usage');
		expect(nameRow().getAttribute('data-slot')).toBe('card-title');
		expect(nameRow().className.split(' ')).toEqual(expect.arrayContaining(['truncate', 'text-sm', 'font-semibold']));
		expect(nameRow().className.split(' ')).not.toContain('text-base');
		// Above who it is by, not beside it.
		expect(nameRow().compareDocumentPosition(details()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(details().contains(nameRow())).toBe(false);
	});

	it('never takes a second line: it runs the width of the footer, then is cut with an ellipsis', async () => {
		await show(project({ title: 'Admin usage and what each organization has switched on across every role they manage', iterations: [NEWEST] }));
		// `truncate` is one line, overflow hidden, an ellipsis: nothing wraps, and nothing sets a number of lines.
		const classes = nameRow().className.split(' ');
		expect(classes).toContain('truncate');
		expect(classes.some((c) => c.startsWith('line-clamp'))).toBe(false);
		// The row is as wide as the footer's content, so the name goes all the way across before it is cut.
		expect(footer().className.split(' ')).toContain('items-stretch');
	});

	it('has, under the name, who it is by at the left and how many comments its prototypes have at the right', async () => {
		await show(project({ iterations: [iteration({ ...NEWEST, openComments: 3 }), iteration({ ...OLDER, openComments: 2 })], people: [NOAH] }));
		const [left, right] = [...details().children];
		// The smallest avatar there is, below the extra small one it was.
		const avatar = left!.querySelector('[data-slot="avatar"]')!;
		expect(avatar.getAttribute('data-size')).toBe('2xs');
		expect(avatar.className.split(' ')).toContain('data-[size=2xs]:size-4');
		expect(left!.querySelector('.truncate')!.textContent).toBe('Noah Shrader');
		// Every prototype's comments, together.
		const comments = right!.querySelector('[aria-label$="comments"], [aria-label$="comment"]')!;
		expect(comments.getAttribute('aria-label')).toBe('5 comments');
		expect(comments.textContent).toBe('5');
		expect(comments.querySelector('.lucide-message-square')).not.toBeNull();
		expect(details().className.split(' ')).toContain('justify-between');
	});

	it('writes who it is by in the same gray as what the project has: the versions and the comments, and a component’s group', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH, { name: 'Sam Lee', login: 'sam' }] }));
		const name = details().querySelector('.truncate')!;
		expect(name.textContent).toBe('Noah Shrader');
		const gray = ['text-muted-foreground', 'text-sm'];
		expect(name.className.split(' ')).toEqual(expect.arrayContaining(gray));
		expect(details().children[1]!.className.split(' ')).toEqual(expect.arrayContaining(gray));
	});

	it('says how many others there are, and names them on hover', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH, { name: 'Sam Lee', login: 'sam' }, { name: 'Ava Cho', login: null }] }));
		expect(details().textContent).toContain('Noah Shrader');
		expect(details().textContent).toContain('+2');
		expect(footer().textContent).not.toContain('Sam Lee');
	});

	it('counts one comment as one, and none as none', async () => {
		await show(project({ iterations: [iteration({ ...NEWEST, openComments: 1 })] }));
		expect(footer().querySelector('[aria-label="1 comment"]')).not.toBeNull();
		await unmountAll(current!.root);
		await show(project({ iterations: [NEWEST] }));
		expect(footer().querySelector('[aria-label="0 comments"]')).not.toBeNull();
	});

	it('does not count comments on codebase work: the card is about its prototypes', async () => {
		await show(project({ iterations: [iteration({ ...NEWEST, openComments: 2 }), iteration({ ...CODEBASE, openComments: 7 })] }));
		expect(footer().querySelector('[aria-label="2 comments"]')).not.toBeNull();
	});

	it('is the same height on every card, so a row of cards lines up', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH] }));
		const withPeople = footer().className;
		await unmountAll(current!.root);
		await show(project());
		expect(footer().className).toBe(withPeople);
		expect(withPeople.split(' ')).toContain('h-18');
	});
});

describe('how many versions it has', () => {
	const at = () => details().children[1]!;
	const v = (name: string) => iteration({ name, branch: `prototype/admin-usage/${name}` });

	it('says so before the comments, with a bullet between, all in the gray of the comment count', async () => {
		await show(project({ iterations: [v('v1-i1'), v('v2-i1')] }));
		expect(at().textContent).toBe('2 versions•0');
		expect(at().className.split(' ')).toContain('text-muted-foreground');
		const [versions, bullet, comments] = [...at().children];
		expect(versions!.textContent).toBe('2 versions');
		expect(bullet!.textContent).toBe('•');
		expect(bullet!.getAttribute('aria-hidden')).toBe('true');
		expect(comments!.getAttribute('aria-label')).toBe('0 comments');
	});

	it('says 1 version for one, and counts versions, not the iterations in them', async () => {
		await show(project({ iterations: [v('v1-i1'), v('v1-i2'), v('v1-i3')] }));
		expect(at().children[0]!.textContent).toBe('1 version');
		await unmountAll(current!.root);
		await show(project({ iterations: [v('v1-i1'), v('v1-i2'), v('v2-i1'), v('v2-i2'), v('v3-i1')] }));
		expect(at().children[0]!.textContent).toBe('3 versions');
	});

	it('counts an older prototype named i1 as version 1, and ignores codebase work', async () => {
		await show(project({ iterations: [iteration({ name: 'i1', branch: 'fd/admin-usage/i1' }), v('v2-i1'), CODEBASE] }));
		expect(at().children[0]!.textContent).toBe('2 versions');
	});

	it('is not there for codebase work alone, which has no versions', async () => {
		await show(project({ iterations: [CODEBASE] }));
		expect(footer().textContent).not.toMatch(/version/);
		expect(footer().textContent).not.toContain('•');
	});
});

describe('while it loads', () => {
	it('is a skeleton the same size: the same cover, and a footer of two rows with the same height', async () => {
		await show(project({ iterations: [NEWEST], people: [NOAH] }));
		const real = { cover: cover().className, footer: footer().className };
		await unmountAll(current!.root);
		current = await render(createElement(CardSkeleton, { detail: true }));
		expect(cover().className).toBe(real.cover);
		expect(footer().className).toBe(real.footer);
		expect(footer().children).toHaveLength(2);
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
	const LINK = 'https://github.com/flocksafety/flock-coke/tree/feature/admin-usage';

	it('says Built in code in the gray of the comment count, with no icon beside it', async () => {
		await show(project({ iterations: [CODEBASE], people: [NOAH] }));
		const [left, right] = [...details().children];
		expect(left!.querySelector('.truncate')!.textContent).toBe('Noah Shrader');
		expect(right!.textContent).toBe('Built in code');
		expect(right!.className.split(' ')).toContain('text-muted-foreground');
		expect(right!.querySelector('svg')).toBeNull();
		expect(footer().querySelector('a')).toBeNull();
	});

	it('has the external-link icon at the top right of the cover, in that gray', async () => {
		await show(project({ iterations: [CODEBASE] }));
		const icon = cover().querySelector('.lucide-external-link')!;
		expect(icon).not.toBeNull();
		expect(icon.getAttribute('class')!.split(' ')).toEqual(expect.arrayContaining(['absolute', 'top-2', 'right-2', 'text-muted-foreground']));
	});

	it('is the whole card a way to GitHub: it opens the link, in the browser, and is not a way into the app', async () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		try {
			const { onOpen } = await show(project({ iterations: [CODEBASE] }));
			expect(card().getAttribute('role')).toBe('link');
			expect(card().getAttribute('aria-label')).toBe('Open Admin usage on GitHub');
			await press(card());
			expect(open).toHaveBeenCalledWith(LINK, '_blank', 'noreferrer');
			expect(onOpen).not.toHaveBeenCalled();
			card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			expect(open).toHaveBeenCalledTimes(2);
		} finally {
			open.mockRestore();
		}
	});

	it('says Built in code, with no icon and nothing to open, when its record does not say where', async () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		try {
			await show(project({ iterations: [iteration({ ...CODEBASE, repository: null })] }));
			expect(footer().textContent).toContain('Built in code');
			expect(cover().querySelector('.lucide-external-link')).toBeNull();
			expect(card().getAttribute('role')).toBeNull();
			await press(card());
			expect(open).not.toHaveBeenCalled();
		} finally {
			open.mockRestore();
		}
	});

	it('has no external-link icon on a project with a prototype: it opens in the app', async () => {
		await show(project({ iterations: [NEWEST, CODEBASE] }));
		expect(card().querySelector('.lucide-external-link')).toBeNull();
	});
});

describe('a project with nothing made', () => {
	it('says so, and is not a way in', async () => {
		await show(project());
		expect(footer().textContent).toContain('Nothing made yet');
		expect(card().getAttribute('role')).toBeNull();
	});
});
