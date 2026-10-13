import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Panel, PanelView, type PanelViewProps } from '../extension/webview/Panel';
import type { Context } from '../src/main/services/findContext';
import { SAMPLE_CATALOG, SAMPLE_PROJECTS } from './extensionSamples';

/**
 * DSNR's panel (Phases 0, 3 and 4): the Projects and Design System toggle at its very top, the projects the core reads
 * under their folders with their pictures, opening one for review, and the design system found. Played against as the extension
 * plays it: what is open is said once the page is ready, the core's calls are answered by their ids, and its events
 * arrive by name.
 */

let state: unknown;
let sent: { type: string; id?: number; name?: string; [key: string]: unknown }[] = [];
let root: Root | null = null;
beforeEach(() => {
	state = undefined;
	sent = [];
	(globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
		getState: () => state,
		setState: (next: unknown) => (state = next),
		postMessage: (message: never) => void sent.push(message),
	});
});
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = '';
});

const OPEN: Context = {
	product: '/work/flock-coke',
	designSystem: { root: '/work/flock-react-component-lib', how: 'named' },
	designRepository: '/work/flock-designer/projects',
	missing: [],
};
const mount = async (element: ReturnType<typeof createElement>) => {
	const host = document.body.appendChild(document.createElement('div'));
	root = createRoot(host);
	await act(async () => root?.render(element));
};
/** The panel as the extension starts it. */
const show = () => mount(createElement(Panel));
/** What the extension says, as it says it. */
const say = async (data: unknown) => act(async () => void window.dispatchEvent(new MessageEvent('message', { data })));
/** Answers the panel's latest call to `name` with `value`. */
const answer = async (name: string, value: unknown) => {
	const call = sent.filter((m) => m.type === 'call' && m.name === name).at(-1);
	if (!call) throw new Error(`the panel made no ${name} call: ${JSON.stringify(sent)}`);
	await say({ type: 'answer', id: call.id, result: { ok: true, value } });
};
/** The panel open on a product, its projects read. */
const showOpen = async (context: Context = OPEN, projects = SAMPLE_PROJECTS) => {
	await show();
	await say({ type: 'context', context });
	if (context.product) await answer('listProjects', projects);
};

const toggle = () => document.querySelector('[role="radiogroup"]') as HTMLElement;
const options = () => [...toggle().querySelectorAll<HTMLElement>('[role="radio"]')];
const chosen = () => options().find((o) => o.getAttribute('aria-checked') === 'true')?.textContent;
const body = () => document.querySelector('[data-tab-body]') as HTMLElement;
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
const press = async (el: HTMLElement) => act(async () => el.click());
const key = async (el: HTMLElement, name: string) =>
	act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })));
const panelSaid = () => sent.filter((m) => m.type !== 'call');

describe('the toggle at the top', () => {
	it('is first in the panel, Projects and Design System, with Projects chosen', async () => {
		await show();
		// First in the panel, in the bar that stays at the top while the list under it scrolls.
		const bar = document.querySelector('main')?.firstElementChild;
		expect(bar?.className).toBe('panel-top');
		expect(bar?.firstElementChild).toBe(toggle());
		expect(toggle().getAttribute('aria-label')).toBe('View');
		expect(options().map((o) => o.textContent)).toEqual(['Projects', 'Design System']);
		expect(chosen()).toBe('Projects');
		expect(body().dataset.tabBody).toBe('projects');
	});

	it('switches what is under it when the other is pressed', async () => {
		await show();
		await press(options()[1]!);
		expect(chosen()).toBe('Design System');
		expect(body().dataset.tabBody).toBe('design-system');
	});

	it('moves with the arrow keys, Home and End, and only the chosen one is in the tab order', async () => {
		await show();
		expect(options().map((o) => o.tabIndex)).toEqual([0, -1]);
		await key(options()[0]!, 'ArrowRight');
		expect(chosen()).toBe('Design System');
		expect(document.activeElement).toBe(options()[1]);
		await key(options()[1]!, 'ArrowRight');
		expect(chosen()).toBe('Projects'); // it wraps
		await key(options()[0]!, 'End');
		expect(chosen()).toBe('Design System');
		await key(options()[1]!, 'Home');
		expect(chosen()).toBe('Projects');
		expect(options().map((o) => o.tabIndex)).toEqual([0, -1]);
	});

	it('keeps its choice when the panel reloads', async () => {
		await show();
		await press(options()[1]!);
		await act(async () => root?.unmount());
		document.body.innerHTML = '';
		await show();
		expect(chosen()).toBe('Design System');
	});

	it('draws its icons from VS Code’s own codicons', async () => {
		await show();
		expect(options().map((o) => o.querySelector('.codicon')?.className)).toEqual(['codicon codicon-folder-library', 'codicon codicon-symbol-color']);
		expect(options().every((o) => o.querySelector('.codicon')?.getAttribute('aria-hidden') === 'true')).toBe(true);
	});
});

describe('what is open', () => {
	it('is asked for once the page listens, and looked at until it is said', async () => {
		await show();
		expect(panelSaid()).toEqual([{ type: 'ready' }]);
		expect(body().textContent).toBe('Looking at what is open…');
	});

	it('says what to open when no product is', async () => {
		await showOpen({ ...OPEN, product: null, missing: ['No product is open: open its folder.'] });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No product is open');
		expect(body().textContent).toContain('No product is open: open its folder.');
		expect(sent.some((m) => m.name === 'listProjects')).toBe(false);
	});

	it('offers Get started there, which asks the extension to get a product onto this machine', async () => {
		await showOpen({ ...OPEN, product: null, missing: ['No product is open: open its folder.'] });
		await press(button('Get started'));
		expect(panelSaid().at(-1)).toEqual({ type: 'get-started' });
	});
});

describe('the account', () => {
	const signedIn = { state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: 'https://avatars.githubusercontent.com/u/1' } };

	it('is not the page’s: signing in is in VS Code’s own title bar, beside the DSNR mark, so the top bar is the toggle alone', async () => {
		await showOpen();
		expect([...(document.querySelector('.panel-top')?.children ?? [])].map((c) => c.className)).toEqual(['toggle']);
	});

	it('reads the projects again when the extension says they changed (one was made)', async () => {
		await showOpen();
		const reads = sent.filter((m) => m.name === 'listProjects').length;
		await say({ type: 'projects-changed' });
		expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
	});

	it('is read from the core when the panel opens, and the projects are read again when it changes', async () => {
		await showOpen();
		expect(sent.some((m) => m.name === 'signInState')).toBe(true);
		const reads = sent.filter((m) => m.name === 'listProjects').length;
		await say({ type: 'event', name: 'onSignInChanged', payload: signedIn });
		expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
	});
});

/** Types into a field as a person does: the value set, and React told it changed. */
const type = async (el: HTMLElement, text: string) =>
	act(async () => {
		const field = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		const proto =
			field instanceof HTMLSelectElement ? HTMLSelectElement : field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
		Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(field, text);
		field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
	});

describe('dialogs and menus, in the panel', () => {
	const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
	/** A field by its label, as a person finds it. */
	const field = (name: string) =>
		[...dialog()!.querySelectorAll('label')].find((l) => l.querySelector('[data-part="label"]')?.textContent === name)!.control as HTMLInputElement;
	/** The option of a select that says `label`, chosen, as a person chooses it. */
	const choose = async (select: HTMLElement, label: string) => {
		const option = [...(select as HTMLSelectElement).options].find((o) => o.textContent === label);
		if (!option) throw new Error(`no option ${label}`);
		await type(select, option.value);
	};
	const selected = (select: HTMLElement) => (select as HTMLSelectElement).selectedOptions[0]?.textContent;
	const submit = () => dialog()!.querySelector('button[type="submit"]') as HTMLButtonElement;
	const cancel = () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel') as HTMLButtonElement;
	const menuFor = (n: number) => [...body().querySelectorAll<HTMLElement>('[aria-label="Project actions"]')][n] as HTMLElement;
	const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
	/** A menu item by what it says, as a person finds it. */
	const item = (label: string) => items().find((i) => i.textContent === label)!;

	describe('New prototype', () => {
		it('opens in the panel, not as a box at the top, when the extension says it can be started (its title bar’s +, or the empty list’s button)', async () => {
			await showOpen(OPEN, []);
			await say({ type: 'open-new-prototype' });
			expect(dialog()?.getAttribute('aria-label')).toBe('New prototype');
			await press(cancel());
			expect(dialog()).toBeNull();
		});

		it('is asked of the extension by the empty list’s button, which says whether it can be started, and opens nothing itself', async () => {
			await showOpen(OPEN, []);
			await press(button('New prototype'));
			expect(panelSaid().at(-1)).toEqual({ type: 'ask-new-prototype' });
			expect(dialog()).toBeNull();
		});

		it('asks a name, what it should explore and its folder, and is made only once there is a name and something to explore', async () => {
			await showOpen();
			await say({ type: 'open-new-prototype' });
			expect(submit().disabled).toBe(true);
			await type(field('Name'), '!!!');
			await type(field('What should it explore?'), 'A history of alerts.');
			expect(submit().disabled).toBe(true);
			await type(field('Name'), 'Alert history 2');
			expect(submit().disabled).toBe(false);
			await type(field('What should it explore?'), '   ');
			expect(submit().disabled).toBe(true);
		});

		it('offers the folders there are, none and a new one, and sends its answers to the extension, closing', async () => {
			await showOpen();
			await say({ type: 'open-new-prototype' });
			expect([...field('Folder').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['No folder', 'Admin', 'Maps', 'New folder…']);
			await type(field('Name'), 'Alert history 2');
			await type(field('What should it explore?'), 'A history of alerts.');
			await press(submit());
			expect(panelSaid().at(-1)).toEqual({ type: 'new-prototype', title: 'Alert history 2', task: 'A history of alerts.', folder: null });
			expect(dialog()).toBeNull();
		});

		it('takes an existing folder, or a new one named in the dialog', async () => {
			await showOpen();
			await say({ type: 'open-new-prototype' });
			await type(field('Name'), 'One');
			await type(field('What should it explore?'), 'Two.');
			await choose(field('Folder'), 'Maps');
			await press(submit());
			expect(panelSaid().at(-1)).toMatchObject({ folder: 'Maps' });
			await say({ type: 'open-new-prototype' });
			await type(field('Name'), 'One');
			await type(field('What should it explore?'), 'Two.');
			await choose(field('Folder'), 'New folder…');
			expect(submit().disabled).toBe(true);
			await type(field('New folder'), ' Zones ');
			await press(submit());
			expect(panelSaid().at(-1)).toMatchObject({ folder: 'Zones' });
		});

		it('closes on Escape, nothing sent, and gives the focus back to what opened it', async () => {
			await showOpen(OPEN, []);
			const opener = button('New prototype');
			opener.focus();
			await say({ type: 'open-new-prototype' });
			expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
			await act(async () => void dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
			expect(dialog()).toBeNull();
			expect(document.activeElement).toBe(opener);
			expect(panelSaid().some((m) => m.type === 'new-prototype')).toBe(false);
		});
	});

	describe('a project’s menu', () => {
		it('is on each project, a popover with Open for review and Assign folder…, closed by Escape or a press elsewhere', async () => {
			await showOpen();
			await press(menuFor(0));
			expect(items().map((i) => i.textContent)).toEqual(['Open for review', 'Open in browser', 'Assign folder…']);
			expect(menuFor(0).getAttribute('aria-expanded')).toBe('true');
			await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
			expect(items()).toHaveLength(0);
			await press(menuFor(0));
			await act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
			expect(items()).toHaveLength(0);
		});

		it('opens a project for review from it', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Open for review'));
			expect(panelSaid().at(-1)).toMatchObject({ type: 'open-review', projectId: 'alert-history' });
			expect(items()).toHaveLength(0);
		});

		it('opens a project’s review in the browser from it: the same review, asked of the extension to open outside VS Code', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Open in browser'));
			expect(panelSaid().at(-1)).toEqual({
				type: 'open-review-in-browser',
				projectId: 'alert-history',
				name: 'v2-i1',
				title: 'Alert history · V2 · I1',
			});
			expect(items()).toHaveLength(0);
		});

		it('has a menu in a list as in a grid', async () => {
			await showOpen();
			await press(
				[...document.querySelectorAll<HTMLElement>('[aria-label="Layout"] [role="radio"]')].find((o) => o.getAttribute('aria-label') === 'List')!,
			);
			await press(menuFor(0));
			expect(items().map((i) => i.textContent)).toEqual(['Open for review', 'Open in browser', 'Assign folder…']);
		});
	});

	describe('Assign folder', () => {
		const open = async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Assign folder…'));
		};

		it('is a dialog for the project, with the folder it is in chosen', async () => {
			await open();
			expect(dialog()?.getAttribute('aria-label')).toBe('Assign folder');
			expect(dialog()!.textContent).toContain('Alert history');
			expect(selected(field('Folder'))).toBe('Admin');
			expect(submit().disabled).toBe(true);
		});

		it('puts it in the folder chosen, through the core, closing, and the projects are read again', async () => {
			await open();
			const reads = sent.filter((m) => m.name === 'listProjects').length;
			await choose(field('Folder'), 'Maps');
			await press(submit());
			expect(sent.filter((m) => m.name === 'assignFolder').at(-1)?.args).toEqual(['alert-history', 'Maps']);
			await answer('assignFolder', null);
			expect(dialog()).toBeNull();
			expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
		});

		it('takes it out of its folder, or into a new one', async () => {
			await open();
			await choose(field('Folder'), 'No folder');
			await press(submit());
			expect(sent.filter((m) => m.name === 'assignFolder').at(-1)?.args).toEqual(['alert-history', null]);
			await answer('assignFolder', null);
			await answer('listProjects', SAMPLE_PROJECTS);
			await press(menuFor(1));
			await press(item('Assign folder…'));
			await choose(field('Folder'), 'New folder…');
			await type(field('New folder'), 'Zones');
			await press(submit());
			expect(sent.filter((m) => m.name === 'assignFolder').at(-1)?.args).toEqual(['zone-coverage', 'Zones']);
		});

		it('says why it could not, in the dialog, which stays open', async () => {
			await open();
			await choose(field('Folder'), 'Maps');
			await press(submit());
			const call = sent.filter((m) => m.name === 'assignFolder').at(-1);
			await say({ type: 'answer', id: call!.id, result: { ok: false, error: 'There is no brief to put a folder in.' } });
			expect(dialog()!.textContent).toContain('There is no brief to put a folder in.');
			expect(dialog()).not.toBeNull();
		});

		it('opens from the extension too (the right-click menu, a review’s menu), for the project it names', async () => {
			await showOpen();
			await say({ type: 'open-assign-folder', projectId: 'admin-usage' });
			expect(dialog()!.textContent).toContain('Admin usage');
			await press(cancel());
			await say({ type: 'open-assign-folder', projectId: 'not-here' });
			expect(dialog()).toBeNull();
		});
	});
});

describe('searching the projects', () => {
	const search = () => document.querySelector('input[aria-label="Search projects"]') as HTMLInputElement;
	const names = () => [...body().querySelectorAll('[data-part="name"]')].map((n) => n.textContent);
	const sections = () =>
		[...body().querySelectorAll('.section')].map((x) => [
			x.querySelector('[data-part="title"]')?.textContent,
			x.querySelector('[data-part="count"]')?.textContent,
		]);

	it('is a box at the left of the grid and list toggle, in the same bar, both across the width the top toggle has', async () => {
		await showOpen();
		const bar = document.querySelector('.view-bar') as HTMLElement;
		expect([...bar.children].map((c) => (c.querySelector('input') ? 'search' : c.getAttribute('aria-label')))).toEqual(['search', 'Layout']);
		expect(search().placeholder).toBe('Search projects');
	});

	it('narrows the projects as it is typed in: every word, in any case, in the name, the folder or the id', async () => {
		await showOpen();
		await type(search(), 'ZONE');
		expect(names()).toEqual(['Zone coverage']);
		await type(search(), 'role comp');
		expect(names()).toEqual(['Role comparison']);
		await type(search(), 'admin');
		expect(names()).toEqual(['Alert history', 'Admin usage']);
		await type(search(), '');
		expect(names()).toHaveLength(4);
	});

	it('keeps the folders that still have a project, with how many they hold', async () => {
		await showOpen();
		await type(search(), 'admin');
		expect(sections()).toEqual([
			['Admin', '1'],
			['No folder', '1'],
		]);
	});

	it('says when nothing matches, and clears from there; and Escape clears it too', async () => {
		await showOpen();
		await type(search(), 'zzz');
		expect(names()).toEqual([]);
		expect(body().textContent).toContain('No project matches “zzz”.');
		await press(button('Clear search'));
		expect(search().value).toBe('');
		expect(names()).toHaveLength(4);
		await type(search(), 'zone');
		await key(search(), 'Escape');
		expect(search().value).toBe('');
		expect(names()).toHaveLength(4);
	});

	it('is kept when the view changes between grid and list', async () => {
		await showOpen();
		await type(search(), 'zone');
		await press(
			[...document.querySelectorAll<HTMLElement>('[aria-label="Layout"] [role="radio"]')].find((o) => o.getAttribute('aria-label') === 'List')!,
		);
		expect(search().value).toBe('zone');
		expect(names()).toEqual(['Zone coverage']);
	});

	it('is not there when there is nothing to search', async () => {
		await showOpen(OPEN, []);
		expect(search()).toBeNull();
	});
});

describe('the projects as a list or a grid', () => {
	const views = () => document.querySelector('[aria-label="Layout"]') as HTMLElement;
	const view = (name: string) =>
		[...views().querySelectorAll<HTMLElement>('[role="radio"]')].find((o) => o.getAttribute('aria-label') === name) as HTMLElement;
	const cards = () => [...body().querySelectorAll<HTMLElement>('.card')];

	it('starts as a grid, the first of icon-only Grid and List to change it, once there are projects to show', async () => {
		await showOpen();
		expect(
			[...views().querySelectorAll('[role="radio"]')].map((o) => [o.getAttribute('aria-label'), o.getAttribute('aria-checked'), o.textContent]),
		).toEqual([
			['Grid', 'true', ''],
			['List', 'false', ''],
		]);
		expect(body().querySelectorAll('.row')).toHaveLength(0);
		expect(cards()).toHaveLength(4);
		await act(async () => root?.unmount());
		await showOpen(OPEN, []);
		expect(document.querySelector('[aria-label="Layout"]')).toBeNull();
	});

	it('shows each project as a card in a grid: its picture, its name and what it has, with its comments as a badge', async () => {
		await showOpen();
		expect(cards().map((c) => c.querySelector('[data-part="name"]')?.textContent)).toEqual([
			'Alert history',
			'Zone coverage',
			'Admin usage',
			'Role comparison',
		]);
		expect(cards()[0]!.querySelector('[data-part="meta"]')?.textContent).toBe('3 iterations');
		expect(cards()[0]!.querySelector('.badge')?.getAttribute('aria-label')).toBe('2 open comments');
		expect(cards()[1]!.querySelector('.badge')).toBeNull();
		expect(cards()[0]!.querySelector('[data-part="picture"]')).not.toBeNull();
	});

	it('shows each as a row in a list, once List is chosen', async () => {
		await showOpen();
		await press(view('List'));
		expect(view('List').getAttribute('aria-checked')).toBe('true');
		expect(cards()).toHaveLength(0);
		expect([...body().querySelectorAll('.row [data-part="name"]')].map((n) => n.textContent)).toEqual([
			'Alert history',
			'Zone coverage',
			'Admin usage',
			'Role comparison',
		]);
		expect(body().querySelector('.row [data-part="picture"]')?.className).toBe('picture');
		expect(body().querySelector('.card-picture')).toBeNull();
	});

	it('keeps the sections, and the cards do what the rows do: open the newest prototype, and take the right-click menu', async () => {
		await showOpen();
		expect([...body().querySelectorAll('.section')].map((x) => x.querySelector('[data-part="title"]')?.textContent)).toEqual([
			'Admin',
			'Maps',
			'No folder',
		]);
		await press(cards()[0]!);
		expect(panelSaid().at(-1)).toEqual({ type: 'open-review', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' });
		expect(JSON.parse(cards()[0]!.closest('li')!.dataset.vscodeContext ?? '{}')).toMatchObject({
			webviewSection: 'project',
			projectId: 'alert-history',
		});
	});

	it('draws the pictures in either', async () => {
		await showOpen();
		// A name of its own: a picture read is kept by its name, as the app keeps it, across the tests of this file.
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v2-i1', cover: 'fedcba654321' }]);
		await answer('projectCover', 'data:image/jpeg;base64,BBBB');
		expect(cards()[0]!.querySelector('[data-part="picture"]')?.getAttribute('src')).toBe('data:image/jpeg;base64,BBBB');
	});

	it('is kept in the panel’s state, so a reload leaves it where it was, as the tab is', async () => {
		await showOpen();
		await press(view('List'));
		expect(state).toMatchObject({ tab: 'projects', view: 'list' });
		await act(async () => root?.unmount());
		sent = [];
		await showOpen();
		expect(view('List').getAttribute('aria-checked')).toBe('true');
		expect(cards()).toHaveLength(0);
	});

	it('does not lose the tab chosen, nor the layout when the tab is', async () => {
		await showOpen();
		await press(view('List'));
		await press(options()[1]!);
		expect(state).toEqual({ tab: 'design-system', view: 'list' });
	});
});

describe('Projects', () => {
	const rows = () => [...body().querySelectorAll<HTMLElement>('[role="listitem"]')];
	const part = (row: HTMLElement, name: string) => row.querySelector(`[data-part="${name}"]`)?.textContent ?? null;

	it('lists each project as a row: a picture, its name, what it has, and its open comments as a badge', async () => {
		await showOpen();
		// Each list is named for its folder, as its section is.
		expect([...body().querySelectorAll('[role="list"]')].map((l) => l.getAttribute('aria-label'))).toEqual(['Admin', 'Maps', 'No folder']);
		expect(rows().map((r) => part(r, 'name'))).toEqual(['Alert history', 'Zone coverage', 'Admin usage', 'Role comparison']);
		expect(rows()[0]!.querySelector('[data-part="picture"]')).not.toBeNull();
		expect(part(rows()[0]!, 'meta')).toBe('3 iterations');
		expect(part(rows()[3]!, 'meta')).toBe('1 iteration');
	});

	it('shows the open comments only when there are some, and says what the number is', async () => {
		await showOpen();
		const badges = rows().map((r) => r.querySelector('.badge'));
		expect(badges.map((b) => b?.textContent ?? null)).toEqual(['2', null, null, '5']);
		expect(badges[0]?.getAttribute('aria-label')).toBe('2 open comments');
	});

	it('opens a project’s newest prototype for review when its row is pressed', async () => {
		await showOpen();
		await press(rows()[0]!.querySelector('button') as HTMLElement);
		expect(panelSaid().at(-1)).toEqual({ type: 'open-review', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' });
	});

	it('draws each project’s picture: those built here are made once the list is read, then each is read by its name', async () => {
		await showOpen();
		expect(rows()[0]!.querySelector('img')).toBeNull();
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v2-i1', cover: 'abc123def456' }]);
		const asked = sent.filter((m) => m.name === 'projectCover').at(-1);
		expect(asked?.args).toEqual(['alert-history', 'v2-i1', 'abc123def456']);
		await answer('projectCover', 'data:image/jpeg;base64,AAAA');
		expect(rows()[0]!.querySelector('[data-part="picture"]')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
		// A project with no picture keeps its place for one.
		expect(rows()[1]!.querySelector('[data-part="picture"]')?.tagName).toBe('SPAN');
	});

	it('shows a picture drawn again, not the one before it', async () => {
		await showOpen();
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v2-i1', cover: 'aaaaaaaaaaaa' }]);
		await say({ type: 'projects-changed' });
		await answer('listProjects', SAMPLE_PROJECTS);
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v2-i1', cover: 'bbbbbbbbbbbb' }]);
		expect(sent.filter((m) => m.name === 'projectCover').at(-1)?.args).toEqual(['alert-history', 'v2-i1', 'bbbbbbbbbbbb']);
	});

	it('groups them by folder, each a section with how many it holds, those in none last', async () => {
		await showOpen();
		const sections = [...body().querySelectorAll<HTMLElement>('.section')];
		expect(sections.map((x) => [x.querySelector('[data-part="title"]')?.textContent, x.querySelector('[data-part="count"]')?.textContent])).toEqual([
			['Admin', '1'],
			['Maps', '1'],
			['No folder', '2'],
		]);
	});

	it('is one list when no project is in a folder', async () => {
		await showOpen(
			OPEN,
			SAMPLE_PROJECTS.map((p) => ({ ...p, folder: null })),
		);
		expect(body().querySelectorAll('.section')).toHaveLength(0);
		expect(rows()).toHaveLength(4);
	});

	it('gives each row VS Code’s context for its right-click menu: the project, and none of a webview’s own items', async () => {
		await showOpen();
		expect(JSON.parse(rows()[0]!.dataset.vscodeContext ?? '{}')).toEqual({
			webviewSection: 'project',
			projectId: 'alert-history',
			preventDefaultContextMenuItems: true,
		});
	});

	it('says, signed out, that the list is this machine’s', async () => {
		await showOpen();
		expect(body().querySelector('.note')?.textContent).toBe("These are the projects on this machine. Sign in to see your team's too.");
	});

	it('says why it could not read them', async () => {
		await show();
		await say({ type: 'context', context: OPEN });
		const call = sent.find((m) => m.name === 'listProjects');
		await say({ type: 'answer', id: call?.id, result: { ok: false, error: 'GitHub could not be reached.' } });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('The projects could not be read');
		expect(body().textContent).toContain('GitHub could not be reached.');
	});

	it('says when there are none, and offers to start one', async () => {
		await showOpen(OPEN, []);
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No projects yet');
		await press(button('New prototype'));
		expect(panelSaid().at(-1)).toEqual({ type: 'ask-new-prototype' });
	});
});

describe('Design System', () => {
	const open = async (context: Context = OPEN) => {
		await showOpen(context);
		await press(options()[1]!);
	};
	const headers = () => [...body().querySelectorAll<HTMLElement>('.section-header')];

	it('says which design system was found and how, and that its components and tokens come later', async () => {
		await open();
		expect(headers().map((h) => h.querySelector('[data-part="title"]')?.textContent)).toEqual(['Design system']);
		const row = body().querySelector('[role="listitem"]') as HTMLElement;
		expect([row.querySelector('[data-part="name"]')?.textContent, row.querySelector('[data-part="meta"]')?.textContent]).toEqual([
			'flock-react-component-lib',
			'Named by the product',
		]);
		expect(body().querySelector('.note')?.textContent).toBe('Its components and tokens come to DSNR in VS Code in a later update.');
	});

	it('says, when there is none, what DSNR looked for and where, and offers to locate it', async () => {
		await open({ ...OPEN, designSystem: null });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No design system found');
		expect(body().textContent).toContain('DSNR looks in the folders open in this window');
		await press(button('Locate design system…'));
		expect(panelSaid().at(-1)).toEqual({ type: 'locate-design-system' });
	});
});

describe('a design system’s catalog, once it is read', () => {
	const view = (more: Partial<PanelViewProps> = {}) =>
		mount(
			createElement(PanelView, {
				tab: 'design-system',
				onTab: () => undefined,
				account: { state: 'signedOut' },
				context: OPEN,
				projects: { value: [], error: null },
				onOpen: () => undefined,
				onOpenInBrowser: () => undefined,
				onNew: () => undefined,
				onGetStarted: () => undefined,
				onAssignFolder: () => undefined,
				view: 'list',
				onView: () => undefined,
				onLocate: () => undefined,
				catalog: SAMPLE_CATALOG,
				...more,
			}),
		);
	const headers = () => [...body().querySelectorAll<HTMLElement>('.section-header')];
	const section = (name: string) => headers().find((h) => h.querySelector('[data-part="title"]')?.textContent === name) as HTMLElement;
	const rowsUnder = (header: HTMLElement) =>
		[...(document.getElementById(header.getAttribute('aria-controls') ?? '')?.querySelectorAll('[data-part="name"]') ?? [])].map(
			(n) => n.textContent,
		);

	it('groups the components under a header each, with how many, and the tokens last', async () => {
		await view();
		expect(
			headers().map((h) => [h.querySelector('[data-part="title"]')?.textContent, h.querySelector('[data-part="count"]')?.textContent ?? null]),
		).toEqual([
			['Design system', null],
			['Buttons', '3'],
			['Inputs', '2'],
			['Feedback', '2'],
			['Tokens', '3'],
		]);
		expect(rowsUnder(section('Buttons'))).toEqual(['FSButton', 'FSIconButton', 'FSSplitButton']);
		expect(rowsUnder(section('Tokens'))).toEqual(['Color', 'Spacing', 'Shape']);
	});

	it('closes and opens a section from its header, and says which it is', async () => {
		await view();
		const buttons = section('Buttons');
		expect(buttons.getAttribute('aria-expanded')).toBe('true');
		await press(buttons);
		expect(buttons.getAttribute('aria-expanded')).toBe('false');
		expect(document.getElementById(buttons.getAttribute('aria-controls') ?? '')?.hidden).toBe(true);
		expect(buttons.querySelector('.codicon')?.className).toBe('codicon codicon-chevron-right');
		await press(buttons);
		expect(buttons.getAttribute('aria-expanded')).toBe('true');
	});
});
