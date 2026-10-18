import { act, createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Panel } from '../extension/webview/Panel';
import type { Context } from '../src/main/services/findContext';
import type { Catalog, ComponentPictures, ProjectIteration } from '../src/shared/contract';
import { SAMPLE_CATALOG, SAMPLE_PROJECTS } from './extensionSamples';
import { projectIteration } from './fixtures';
import { answer, button, calls, key, kept, mount, panelSaid, press, say, sent, type, unmount } from './webviewHarness';

/**
 * DSNR's panel (Phases 0, 3 and 4): the Projects and Design System toggle at its very top, the projects the core reads
 * under their folders with their pictures, opening one for review, and the design system found. Played against as the extension
 * plays it: what is open is said once the page is ready, the core's calls are answered by their ids, and its events
 * arrive by name.
 */

const OPEN: Context = {
	product: '/work/flock-coke',
	designSystem: { root: '/work/flock-react-component-lib', how: 'named' },
	designRepository: '/work/flock-designer/projects',
	productRepository: 'flocksafety/flock-coke',
	missing: [],
};
/** The panel as the extension starts it. */
const show = () => mount(createElement(Panel));
/** The panel open on a product, its projects read. */
const showOpen = async (context: Context = OPEN, projects = SAMPLE_PROJECTS) => {
	await show();
	await say({ type: 'context', context });
	await answer('listProjects', projects);
};

const toggle = () => document.querySelector('[role="radiogroup"]') as HTMLElement;
const options = () => [...toggle().querySelectorAll<HTMLElement>('[role="radio"]')];
const chosen = () => options().find((o) => o.getAttribute('aria-checked') === 'true')?.textContent;
const body = () => document.querySelector('[data-tab-body]') as HTMLElement;
/** The Projects tab's View options menu: one button for whose projects and the layout, drawn as the row menus are. */
const viewMenu = () => body().querySelector('button[aria-label="View options"]') as HTMLButtonElement | null;
/** Its choices, the menu opened if it is not: each a radio in its group, named for what it says. */
const viewChoices = async () => {
	if (viewMenu()?.getAttribute('aria-expanded') !== 'true') await press(viewMenu()!);
	return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
};
const viewChoice = async (label: string) => press((await viewChoices()).find((o) => o.textContent === label)!);
/** Whether a choice is the one chosen in its group, as the menu says it. */
const checked = async (label: string) => (await viewChoices()).find((o) => o.textContent === label)?.getAttribute('aria-checked');
/** Whose projects can be chosen: the choices in the menu's Projects group. */
const scopeChoices = async () => (await viewChoices()).filter((o) => o.closest('[role="group"]')?.getAttribute('aria-label') === 'Projects');

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
		await unmount();
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

	const NONE: Context = {
		...OPEN,
		product: null,
		productRepository: null,
		designRepository: null,
		missing: ['No product is open: open its folder.'],
	};

	it('lists everyone’s projects when no product is open, with no switch, and says what a product is for', async () => {
		await showOpen(NONE);
		expect(sent.some((m) => m.name === 'listProjects')).toBe(true);
		expect([...body().querySelectorAll('[role="listitem"] [data-part="name"]')].map((n) => n.textContent)).toEqual([
			// One group (none has a product yet), in the list's own order; a project's folder is on its line.
			'Alert history',
			'Admin usage',
			'Role comparison',
			'Zone coverage',
		]);
		// Only everyone's is there to be chosen, signed out with no product: no group for a choice of one.
		expect(await scopeChoices()).toEqual([]);
		expect(body().textContent).toContain('No product is open, so these are everyone’s projects');
	});

	it('says there are no projects when no product is open and nobody has made one: no product is needed to see everyone’s', async () => {
		await showOpen(NONE, []);
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No projects yet');
		expect(body().textContent).not.toContain('No product is open');
	});

	it('says why Build in the codebase cannot be done with no product open, rather than opening nothing', async () => {
		await showOpen(NONE);
		await say({ type: 'open-dialog', dialog: { kind: 'build', projectId: 'alert-history' } });
		const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
		expect(dialog.textContent).toContain('Open the product');
		expect(sent.some((m) => m.name === 'buildInCodebasePlan')).toBe(false);
	});

	it('offers Get started beside everyone’s projects too', async () => {
		await showOpen(NONE);
		await press(button('Get started'));
		expect(panelSaid().at(-1)).toEqual({ type: 'get-started' });
	});
});

describe('the account, and reading the projects again', () => {
	const signedIn = { state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: 'https://avatars.githubusercontent.com/u/1' } };

	it('is not the page’s: signing in is in VS Code’s own title bar, beside the DSNR mark, so the top bar is the toggle alone', async () => {
		await showOpen();
		expect([...(document.querySelector('.panel-top')?.children ?? [])].map((c) => c.className)).toEqual(['toggle']);
	});

	it('shows what it has while it reads again, and then what is new: a comment made in a review is a number on its project', async () => {
		await showOpen();
		const badge = () => body().querySelector('[data-part="name"]')?.closest('li')?.querySelector('.badge')?.getAttribute('aria-label') ?? null;
		expect(badge()).toBe('2 open comments');
		await say({ type: 'projects-changed' });
		// Still there while it is read: the list does not give way to a line saying it is reading.
		expect(body().querySelectorAll('[role="listitem"]')).toHaveLength(4);
		expect(badge()).toBe('2 open comments');
		await answer(
			'listProjects',
			SAMPLE_PROJECTS.map((p) =>
				p.id === 'alert-history'
					? { ...p, iterations: p.iterations.map((i, at) => ({ ...i, openComments: i.openComments + (at === 0 ? 1 : 0) })) }
					: p,
			),
		);
		expect(badge()).toBe('3 open comments');
	});

	it('is read from the core when the panel opens, and the projects are read again when it changes', async () => {
		await showOpen();
		expect(sent.some((m) => m.name === 'signInState')).toBe(true);
		const reads = sent.filter((m) => m.name === 'listProjects').length;
		await say({ type: 'event', name: 'onSignInChanged', payload: signedIn });
		expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
	});
});

describe('the account and the sync, in the panel, not as a box at the top (their title bar and status bar items open them)', () => {
	const signedIn = { state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: 'https://avatars.githubusercontent.com/u/1' } };
	const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
	const inDialog = (name: string) => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
	/** The X in a dialog's title row: how every dialog is closed that has nothing to cancel. */
	const closeX = () => dialog()!.querySelector('[aria-label="Close"]') as HTMLButtonElement;
	const heard = (name: string) => sent.filter((m) => m.type === 'call' && m.name === name);

	it('says who is signed in, and signs out when asked, then closes', async () => {
		await showOpen();
		await say({ type: 'event', name: 'onSignInChanged', payload: signedIn });
		await say({ type: 'open-dialog', dialog: { kind: 'account' } });
		expect(dialog()?.getAttribute('aria-label')).toBe('GitHub account');
		expect(dialog()?.textContent).toContain('Signed in to GitHub as noah');
		await press(inDialog('Sign out of DSNR'));
		expect(heard('signOut')).toHaveLength(1);
		await answer('signOut', null);
		expect(dialog()).toBeNull();
	});

	it('is closed without signing out by its X, and goes by itself when the person has signed out meanwhile', async () => {
		await showOpen();
		await say({ type: 'event', name: 'onSignInChanged', payload: signedIn });
		await say({ type: 'open-dialog', dialog: { kind: 'account' } });
		expect(inDialog('Close')).toBeUndefined();
		await press(closeX());
		expect(dialog()).toBeNull();
		expect(heard('signOut')).toHaveLength(0);
		await say({ type: 'open-dialog', dialog: { kind: 'account' } });
		await say({ type: 'event', name: 'onSignInChanged', payload: { state: 'signedOut' } });
		expect(dialog()).toBeNull();
	});

	it('says why signing out failed, and stays', async () => {
		await showOpen();
		await say({ type: 'event', name: 'onSignInChanged', payload: signedIn });
		await say({ type: 'open-dialog', dialog: { kind: 'account' } });
		await press(inDialog('Sign out of DSNR'));
		await say({ type: 'answer', id: heard('signOut')[0]?.id, result: { ok: false, error: 'VS Code would not sign out.' } });
		expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe('VS Code would not sign out.');
	});

	it('says whether the work is synced, what is held back and why, and syncs now when asked', async () => {
		await showOpen();
		await say({ type: 'open-dialog', dialog: { kind: 'sync' } });
		expect(dialog()?.getAttribute('aria-label')).toBe('Your work’s sync');
		await answer('publishStatus', {
			state: 'held',
			problems: [{ what: 'feature/x', why: 'It has changes nobody committed.', files: ['a.ts', 'b.ts'] }],
			at: '',
		});
		expect(dialog()?.textContent).toContain('Some work isn’t synced');
		const held = dialog()!.querySelector('[data-held]') as HTMLElement;
		expect(held.textContent).toBe('feature/xIt has changes nobody committed. a.ts b.ts');
		await press(inDialog('Sync now'));
		expect(heard('publishNow')).toHaveLength(1);
		await answer('publishNow', { state: 'shared', at: '' });
		expect(dialog()?.textContent).toContain('Your work is synced.');
		expect(dialog()?.querySelector('[data-held]')).toBeNull();
	});

	it('follows the sync while it is open: working, then synced', async () => {
		await showOpen();
		await say({ type: 'open-dialog', dialog: { kind: 'sync' } });
		await answer('publishStatus', { state: 'shared', at: '' });
		await say({ type: 'event', name: 'onPublishStatus', payload: { state: 'working' } });
		expect(dialog()?.textContent).toContain('DSNR is syncing your work.');
		expect(inDialog('Sync now').disabled).toBe(true);
		await say({ type: 'event', name: 'onPublishStatus', payload: { state: 'shared', at: '' } });
		expect(inDialog('Sync now').disabled).toBe(false);
	});

	it('says when there is nothing to sync from here', async () => {
		await showOpen();
		await say({ type: 'open-dialog', dialog: { kind: 'sync' } });
		await answer('publishStatus', { state: 'unavailable' });
		expect(dialog()?.textContent).toContain('Nothing to sync from here');
		expect(button('Sync now')).toBeUndefined();
	});
});

describe('dialogs and menus, in the panel', () => {
	const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
	/** A field by its label, as a person finds it. */
	const field = (name: string) => [...dialog()!.querySelectorAll('label')].find((l) => l.textContent === name)!.control as HTMLInputElement;
	/** The option of a select that says `label`, chosen, as a person chooses it. */
	const choose = async (select: HTMLElement, label: string) => {
		const option = [...(select as HTMLSelectElement).options].find((o) => o.textContent === label);
		if (!option) throw new Error(`no option ${label}`);
		await type(select, option.value);
	};
	const selected = (select: HTMLElement) => (select as HTMLSelectElement).selectedOptions[0]?.textContent;
	const submit = () => dialog()!.querySelector('button[type="submit"]') as HTMLButtonElement;
	const closeX = () => dialog()!.querySelector('[aria-label="Close"]') as HTMLButtonElement;
	const menuFor = (n: number) => [...body().querySelectorAll<HTMLElement>('[aria-label="Project actions"]')][n] as HTMLElement;
	const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
	/** A menu item by what it says, as a person finds it. */
	const item = (label: string) => items().find((i) => i.textContent === label)!;

	describe('New prototype', () => {
		it('opens in the panel, not as a box at the top, when the extension says it can be started (its title bar’s +, or the empty list’s button)', async () => {
			await showOpen(OPEN, []);
			await say({ type: 'open-dialog', dialog: { kind: 'new' } });
			expect(dialog()?.getAttribute('aria-label')).toBe('New prototype');
			// Its one button is what it does; the way out is the X, not a Cancel beside it.
			expect([...dialog()!.querySelectorAll('.dialog-buttons button')].map((b) => b.textContent)).toEqual(['Create prototype']);
			await press(closeX());
			expect(dialog()).toBeNull();
		});

		it('is asked of the extension by the empty list’s button, which says whether it can be started, and opens nothing itself', async () => {
			await showOpen(OPEN, []);
			await press(button('New prototype'));
			expect(panelSaid().at(-1)).toEqual({ type: 'ask-new-prototype' });
			expect(dialog()).toBeNull();
		});

		it('names each field by its label alone', async () => {
			await showOpen();
			await say({ type: 'open-dialog', dialog: { kind: 'new' } });
			expect(field('What should it explore?').labels?.[0]?.textContent).toBe('What should it explore?');
			expect(field('Name').labels?.[0]?.textContent).toBe('Name');
		});

		it('asks a name, what it should explore and its folder, and is made only once there is a name and something to explore', async () => {
			await showOpen();
			await say({ type: 'open-dialog', dialog: { kind: 'new' } });
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
			await say({ type: 'open-dialog', dialog: { kind: 'new' } });
			expect([...field('Folder').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['No folder', 'Admin', 'Maps', 'New folder…']);
			await type(field('Name'), 'Alert history 2');
			await type(field('What should it explore?'), 'A history of alerts.');
			await press(submit());
			expect(panelSaid().at(-1)).toEqual({ type: 'new-prototype', title: 'Alert history 2', task: 'A history of alerts.', folder: null });
			expect(dialog()).toBeNull();
		});

		it('takes an existing folder, or a new one named in the dialog', async () => {
			await showOpen();
			await say({ type: 'open-dialog', dialog: { kind: 'new' } });
			await type(field('Name'), 'One');
			await type(field('What should it explore?'), 'Two.');
			await choose(field('Folder'), 'Maps');
			await press(submit());
			expect(panelSaid().at(-1)).toMatchObject({ folder: 'Maps' });
			await say({ type: 'open-dialog', dialog: { kind: 'new' } });
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
			await say({ type: 'open-dialog', dialog: { kind: 'new' } });
			expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull();
			await act(async () => void dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
			expect(dialog()).toBeNull();
			expect(document.activeElement).toBe(opener);
			expect(panelSaid().some((m) => m.type === 'new-prototype')).toBe(false);
		});
	});

	describe('a project’s menu', () => {
		it('is on each project, a popover of what it offers, closed by Escape or a press elsewhere', async () => {
			await showOpen();
			await press(menuFor(0));
			expect(items().map((i) => i.textContent)).toEqual(['Copy link', 'Open published page', 'Open locally', 'Build', 'Assign folder…']);
			expect(menuFor(0).getAttribute('aria-expanded')).toBe('true');
			await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
			expect(items()).toHaveLength(0);
			await press(menuFor(0));
			await act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
			expect(items()).toHaveLength(0);
		});

		it('copies the published page’s link from the menu: asked of the extension, which says if there is none yet', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Copy link'));
			expect(panelSaid().at(-1)).toEqual({ type: 'copy-review-link', projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' });
			expect(items()).toHaveLength(0);
		});

		it('opens the published page from it: asked of the extension, which says if there is none yet and offers to publish it', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Open published page'));
			expect(panelSaid().at(-1)).toEqual({
				type: 'open-review-published',
				projectId: 'alert-history',
				name: 'v2-i1',
				title: 'Alert history · V2 · I1',
			});
			expect(items()).toHaveLength(0);
		});

		it('groups what it offers: the links, where it opens with the next stage, the code on GitHub, the folder', async () => {
			await showOpen();
			await press(menuFor(0));
			const groups = [...document.querySelectorAll('[role="menu"] > *')].map((el) => (el.matches('[role="separator"], hr') ? '|' : el.textContent));
			expect(groups.join(',')).toBe('Copy link,|,Open published page,Open locally,|,Build,|,Assign folder…');
		});

		it('opens a project’s review in the browser from it: the same review, asked of the extension to open outside VS Code', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Open locally'));
			expect(panelSaid().at(-1)).toEqual({
				type: 'open-review-in-browser',
				projectId: 'alert-history',
				name: 'v2-i1',
				title: 'Alert history · V2 · I1',
			});
			expect(items()).toHaveLength(0);
		});

		it('gives the focus back to its button when it closes, so a keyboard goes on from where it was', async () => {
			await showOpen();
			await press(menuFor(0));
			expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
			await act(async () => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
			expect(document.activeElement).toBe(menuFor(0));
			await press(menuFor(0));
			await press(item('Copy link'));
			expect(document.activeElement).toBe(menuFor(0));
		});

		it('names the menu it controls only while there is one', async () => {
			await showOpen();
			expect(menuFor(0).hasAttribute('aria-controls')).toBe(false);
			await press(menuFor(0));
			expect(document.getElementById(menuFor(0).getAttribute('aria-controls')!)?.getAttribute('role')).toBe('menu');
		});

		it('has a menu in a list as in a grid', async () => {
			await showOpen();
			await viewChoice('List');
			await press(menuFor(0));
			expect(items().map((i) => i.textContent)).toEqual(['Copy link', 'Open published page', 'Open locally', 'Build', 'Assign folder…']);
		});
	});

	describe('Assign folder', () => {
		const open = async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Assign folder…'));
		};

		it('has the folder it is in chosen however it was spelled, as the list spells it', async () => {
			// Two projects, one folder, spelled two ways: the list has the one spelling, and both show it chosen.
			await showOpen(
				OPEN,
				SAMPLE_PROJECTS.map((p) => (p.id === 'role-comparison' ? { ...p, folder: 'maps' } : p)),
			);
			await say({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'zone-coverage' } });
			// The list has `maps`, the first spelling it met; this project's own `Maps` is not an option, and is shown as it.
			expect([...field('Folder').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['No folder', 'Admin', 'maps', 'New folder…']);
			expect(selected(field('Folder'))).toBe('maps');
			expect(submit().disabled).toBe(true);
		});

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
			await say({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'admin-usage' } });
			expect(dialog()!.textContent).toContain('Admin usage');
			await press(closeX());
			await say({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'not-here' } });
			expect(dialog()).toBeNull();
		});
	});
});

describe('codebase work, in the panel', () => {
	const codebase = (branch: string, more: Partial<ProjectIteration> = {}): ProjectIteration =>
		projectIteration({ name: 'codebase', branch, createdAt: '2026-10-12T10:00:00Z', repository: 'flocksafety/flock-coke', ...more });
	/** Zone coverage built in the code too, and a project that is only in the code. */
	const WITH_CODE = [
		...SAMPLE_PROJECTS.map((p) => (p.id === 'zone-coverage' ? { ...p, iterations: [...p.iterations, codebase('feature/zone-coverage')] } : p)),
		{ id: 'roles-in-code', title: 'Roles in code', folder: null, records: [], people: [], iterations: [codebase('feature/roles-in-code')] },
	] as typeof SAMPLE_PROJECTS;
	const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
	const named = (title: string) =>
		[...body().querySelectorAll<HTMLElement>('[role="listitem"]')].find((r) => r.querySelector('[data-part="name"]')?.textContent === title)!;
	const menuOf = (title: string) => named(title).querySelector<HTMLElement>('[aria-label="Project actions"]')!;
	const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((i) => i.textContent);
	const item = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent === label)!;
	/** A press elsewhere, as a person's click on another button is first: it closes a menu that is open. */
	const elsewhere = async () => act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
	const inDialog = (name: string) => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
	const closeX = () => dialog()!.querySelector('[aria-label="Close"]') as HTMLButtonElement;

	it('offers what a project has, in groups: its link to copy, where it opens, what runs it, with the next stage (build, or handoff, never both), the code on GitHub, and its folder', async () => {
		await showOpen(OPEN, WITH_CODE);
		const dividers = () => document.querySelectorAll('[role="separator"]').length;
		await press(menuOf('Zone coverage'));
		// A prototype that is in code too: it is built, so Handoff, not Build.
		expect(items()).toEqual(['Copy link', 'Open published page', 'Open locally', 'Run locally', 'Hand off', 'View on GitHub', 'Assign folder…']);
		expect(dividers()).toBe(4);
		await elsewhere();
		await press(menuOf('Alert history'));
		// A prototype only: not built yet, so Build, and no GitHub to open.
		expect(items()).toEqual(['Copy link', 'Open published page', 'Open locally', 'Build', 'Assign folder…']);
		expect(dividers()).toBe(3);
		await elsewhere();
		await press(menuOf('Roles in code'));
		// Code only: nothing of a prototype to open or link, and Handoff.
		expect(items()).toEqual(['Run locally', 'Hand off', 'View on GitHub', 'Assign folder…']);
		expect(dividers()).toBe(2);
		// No item opens it in VS Code: pressing it does, and nothing is said twice.
		expect(items().some((label) => /open for review|preview|comments|share/i.test(label))).toBe(false);
	});

	it('asks the extension to view the work locally, naming the project only, and offers it only for codebase work', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('Run locally'));
		expect(panelSaid().at(-1)).toEqual({ type: 'codebase', action: 'run-locally', projectId: 'zone-coverage' });
		await press(menuOf('Alert history'));
		expect(items()).not.toContain('Run locally');
	});

	it('asks the extension for the work on GitHub, naming the project only', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('View on GitHub'));
		expect(panelSaid().at(-1)).toEqual({ type: 'codebase', action: 'open-code', projectId: 'zone-coverage' });
	});

	it('opens a project that is only in the code on GitHub when it is pressed, as the app does', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(named('Roles in code').querySelector('button') as HTMLElement);
		expect(panelSaid().at(-1)).toEqual({ type: 'codebase', action: 'open-code', projectId: 'roles-in-code' });
	});

	it('hands off after saying what happens, and only once Start handoff is pressed', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		expect(dialog()?.getAttribute('aria-label')).toBe('Hand off to engineering');
		expect(dialog()!.textContent).toContain('HANDOFF.md');
		expect(dialog()!.textContent).toContain('feature/zone-coverage');
		expect(dialog()!.textContent).toContain('Nothing is pushed');
		expect(panelSaid().some((m) => m.type === 'codebase')).toBe(false);
		// Not until it is known the agent is free.
		expect(inDialog('Start handoff').disabled).toBe(true);
		await answer('agentStatus', { state: 'idle' });
		await press(inDialog('Start handoff'));
		// Asked again as it is pressed: free still, so it starts.
		await answer('agentStatus', { state: 'idle' });
		expect(panelSaid().at(-1)).toEqual({ type: 'codebase', action: 'hand-off', projectId: 'zone-coverage' });
		expect(dialog()).toBeNull();
	});

	it('offers the draft pull request when a handoff found the work ready and nothing has changed since, with Run again', async () => {
		const READY = 'a1b2c3d';
		const ready = (more: Record<string, unknown>) =>
			WITH_CODE.map((p) =>
				p.id === 'zone-coverage'
					? { ...p, iterations: p.iterations.map((work) => (work.name === 'codebase' ? { ...work, readyAt: READY, ...more } : work)) }
					: p,
			);
		await showOpen(OPEN, ready({}) as typeof SAMPLE_PROJECTS);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		await answer('agentStatus', { state: 'idle' });
		expect(dialog()!.textContent).toContain('ready for engineering');
		expect(inDialog('Open a draft pull request').className).toContain('button-primary');
		expect(inDialog('Run again').className).toContain('button-secondary');
		await press(inDialog('Open a draft pull request'));
		expect(panelSaid().at(-1)).toEqual({ type: 'codebase', action: 'share', projectId: 'zone-coverage' });
		expect(dialog()).toBeNull();
	});

	it('offers the way to its pull request when the handoff found it ready and one is open, not a second one', async () => {
		const ready = WITH_CODE.map((p) =>
			p.id === 'zone-coverage'
				? {
						...p,
						iterations: p.iterations.map((work) =>
							work.name === 'codebase' ? { ...work, readyAt: 'a1b2c3d', pullRequest: 'https://github.com/flocksafety/flock-coke/pull/9' } : work,
						),
					}
				: p,
		);
		await showOpen(OPEN, ready as typeof SAMPLE_PROJECTS);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		await answer('agentStatus', { state: 'idle' });
		expect([...dialog()!.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Open a draft pull request');
		await press(inDialog('View on GitHub'));
		expect(panelSaid().at(-1)).toEqual({ type: 'codebase', action: 'open-code', projectId: 'zone-coverage' });
	});

	it('runs a handoff again from there, as a first one runs', async () => {
		await showOpen(
			OPEN,
			WITH_CODE.map((p) =>
				p.id === 'zone-coverage'
					? { ...p, iterations: p.iterations.map((work) => (work.name === 'codebase' ? { ...work, readyAt: 'a1b2c3d' } : work)) }
					: p,
			) as typeof SAMPLE_PROJECTS,
		);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		await answer('agentStatus', { state: 'idle' });
		await press(inDialog('Run again'));
		await answer('agentStatus', { state: 'idle' });
		expect(panelSaid().at(-1)).toEqual({ type: 'codebase', action: 'hand-off', projectId: 'zone-coverage' });
	});

	it('does not start a handoff when the agent was given other work since the dialog opened', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		await answer('agentStatus', { state: 'idle' });
		await press(inDialog('Start handoff'));
		await answer('agentStatus', { state: 'running', startedAt: '', work: 'prototype/alert-history/v2-i1', purpose: null });
		expect(panelSaid().some((m) => m.type === 'codebase')).toBe(false);
		expect(dialog()!.textContent).toContain('The agent is busy with other work');
	});

	it('says when the agent is busy with other work, and does not start a handoff then', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		await answer('agentStatus', { state: 'running', startedAt: '', work: 'prototype/alert-history/v2-i1', purpose: null });
		expect(dialog()!.textContent).toContain('The agent is busy with other work');
		expect(inDialog('Start handoff').disabled).toBe(true);
	});

	describe('Build in the codebase', () => {
		const plan = (more: Record<string, unknown> = {}) => ({
			branch: 'feature/alert-history',
			exists: false,
			recorded: false,
			started: false,
			repository: 'flock-coke',
			basedOn: { repository: 'flock-coke', branch: 'develop' },
			current: 'main',
			clean: true,
			setup: true,
			...more,
		});
		const open = async (more: Record<string, unknown> = {}) => {
			await showOpen(OPEN, WITH_CODE);
			await press(menuOf('Alert history'));
			await press(item('Build'));
			await answer('buildInCodebasePlan', plan(more));
			await answer('branchesWithSetup', ['main', 'develop']);
		};
		const select = () => dialog()!.querySelector('select') as HTMLSelectElement;

		it('reads what it would do in the product open here, for the project’s newest prototype', async () => {
			await open();
			expect(dialog()?.getAttribute('aria-label')).toBe('Build in the codebase');
			expect(sent.filter((m) => m.name === 'buildInCodebasePlan').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v2-i1']);
			expect(sent.filter((m) => m.name === 'branchesWithSetup').at(-1)?.args).toEqual(['/work/flock-coke']);
			expect(dialog()!.textContent).toContain('Creates feature/alert-history from this branch and moves your checkout to it.');
			// What happens ends with the check it makes of its own work, and says what is left to Handoff.
			expect(dialog()!.textContent).toContain('Before it reports, the implementation reviewer checks the work once');
			expect(dialog()!.textContent).toContain('the full reviews and the gate are Handoff’s');
		});

		it('starts from what the prototype was modeled on, from the branches that have DSNR’s setup, and hands it to Claude Code here', async () => {
			await open();
			expect([...select().options].map((o) => o.textContent)).toEqual(['main', 'develop']);
			expect(select().value).toBe('develop');
			await press(inDialog('Build in Claude Code'));
			expect(sent.filter((m) => m.name === 'buildInCodebase').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v2-i1', 'develop']);
			const reads = sent.filter((m) => m.name === 'listProjects').length;
			await answer('buildInCodebase', { editor: true, command: null });
			expect(dialog()!.textContent).toContain('It is in Claude Code in this window now, on feature/alert-history');
			// The project's codebase work is recorded: the list is read again.
			expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
			await press(closeX());
			expect(dialog()).toBeNull();
		});

		it('gives the command for a terminal when Claude Code is not in this VS Code', async () => {
			await open();
			await press(inDialog('Build in Claude Code'));
			await answer('buildInCodebase', { editor: false, command: "cd /work/flock-coke && claude 'Build it.'" });
			expect(dialog()!.textContent).toContain('on your clipboard');
			expect(dialog()!.querySelector('pre')?.textContent).toBe("cd /work/flock-coke && claude 'Build it.'");
		});

		it('will not start with uncommitted changes, and says so', async () => {
			await open({ clean: false });
			expect(dialog()!.textContent).toContain('There are uncommitted changes in flock-coke');
			expect(inDialog('Build in Claude Code').disabled).toBe(true);
		});

		it('continues work already started, with nothing to choose', async () => {
			await open({ started: true, exists: true, current: 'feature/alert-history' });
			expect(select()).toBeNull();
			expect(dialog()!.textContent).toContain('Continues');
			await press(inDialog('Continue in Claude Code'));
			expect(sent.filter((m) => m.name === 'buildInCodebase').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v2-i1']);
		});

		it('will not continue work on a branch with no DSNR setup, and says what to do, before it moves anything', async () => {
			await open({ started: true, exists: true, setup: false, current: 'noah/dsnr' });
			expect(dialog()!.textContent).toContain('feature/alert-history has no DSNR setup (.dsnr/workspace.json), so DSNR cannot work in it.');
			expect(dialog()!.textContent).toContain('Merge a branch that has the DSNR setup into it first');
			expect(inDialog('Continue in Claude Code').disabled).toBe(true);
			expect(sent.some((m) => m.name === 'buildInCodebase')).toBe(false);
		});

		it('says why it could not, and stays open', async () => {
			await open();
			await press(inDialog('Build in Claude Code'));
			const call = sent.filter((m) => m.name === 'buildInCodebase').at(-1);
			await say({ type: 'answer', id: call!.id, result: { ok: false, error: 'This prototype has no page yet.' } });
			expect(dialog()!.textContent).toContain('This prototype has no page yet.');
		});

		it('says when the prototype was modeled on another repository', async () => {
			await open({ basedOn: { repository: 'flock-pepsi', branch: 'main' } });
			expect(dialog()!.textContent).toContain('The prototype was modeled on flock-pepsi, and this is flock-coke.');
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

	it('is a box at the left of the view options button, in the same bar', async () => {
		await showOpen();
		const bar = document.querySelector('.view-bar') as HTMLElement;
		expect([...bar.children].map((c) => (c.querySelector('input') ? 'search' : c.querySelector('button')?.getAttribute('aria-label')))).toEqual([
			'search',
			'View options',
		]);
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
		await viewChoice('List');
		expect(search().value).toBe('zone');
		expect(names()).toEqual(['Zone coverage']);
	});

	it('is not there when there is nothing to search', async () => {
		await showOpen(OPEN, []);
		expect(search()).toBeNull();
	});
});

describe('the projects as a list or a grid', () => {
	const cards = () => [...body().querySelectorAll<HTMLElement>('.card')];

	it('starts as a grid, Grid and List to choose between in the view options, once there are projects to show', async () => {
		await showOpen();
		expect(await checked('Grid')).toBe('true');
		expect(await checked('List')).toBe('false');
		expect(body().querySelectorAll('.row')).toHaveLength(0);
		expect(cards()).toHaveLength(4);
		await unmount();
		await showOpen(OPEN, []);
		expect(viewMenu()).toBeNull();
	});

	it('shows each project as a card in a grid: its picture, its name and what it has, with its comments as a badge', async () => {
		await showOpen();
		expect(cards().map((c) => c.querySelector('[data-part="name"]')?.textContent)).toEqual([
			'Alert history',
			'Zone coverage',
			'Admin usage',
			'Role comparison',
		]);
		expect(cards()[0]!.querySelector('[data-part="meta"]')?.textContent).toBe('2 versions');
		expect(cards()[0]!.querySelector('.badge')?.getAttribute('aria-label')).toBe('2 open comments');
		expect(cards()[0]!.querySelector('.badge')?.classList.contains('badge-brand')).toBe(true);
		expect(cards()[1]!.querySelector('.badge')).toBeNull();
		expect(cards()[0]!.querySelector('[data-part="picture"]')).not.toBeNull();
		// What opens says so on its picture: a brand wash, shown on hover (the stylesheet's part), with nothing in it.
		const wash = cards()[0]!.querySelector('.card-media > .thumb-wash');
		expect(wash).not.toBeNull();
		expect(wash!.children).toHaveLength(0);
	});

	it('shows each as a row in a list, once List is chosen', async () => {
		await showOpen();
		await viewChoice('List');
		expect(await checked('List')).toBe('true');
		expect(cards()).toHaveLength(0);
		expect([...body().querySelectorAll('.row [data-part="name"]')].map((n) => n.textContent)).toEqual([
			'Alert history',
			'Zone coverage',
			'Admin usage',
			'Role comparison',
		]);
		expect(body().querySelector('.row [data-part="picture"]')?.className).toBe('picture');
		expect(body().querySelector('.card-picture')).toBeNull();
		// The row's picture and its wash are one box, so the wash is the picture's size and not the row's.
		expect(body().querySelector('.row .thumb > [data-part="picture"] + .thumb-wash')).not.toBeNull();
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
		await viewChoice('List');
		expect(kept.state).toMatchObject({ tab: 'projects', view: 'list' });
		await unmount();
		sent.length = 0;
		await showOpen();
		expect(await checked('List')).toBe('true');
		expect(cards()).toHaveLength(0);
	});

	it('does not lose the tab chosen, nor the layout when the tab is', async () => {
		await showOpen();
		await viewChoice('List');
		await press(options()[1]!);
		expect(kept.state).toEqual({ tab: 'design-system', view: 'list', part: 'components', componentsView: 'grid' });
	});
});

describe('Projects, focused on the product open', () => {
	const COKE = 'flocksafety/flock-coke';
	const PEPSI = 'flocksafety/flock-pepsi';
	const rows = () => [...body().querySelectorAll<HTMLElement>('[role="listitem"]')];
	const names = () => rows().map((r) => r.querySelector('[data-part="name"]')?.textContent);
	const meta = (name: string) =>
		rows()
			.find((r) => r.querySelector('[data-part="name"]')?.textContent === name)
			?.querySelector('[data-part="meta"]')?.textContent;
	const sections = () => [...body().querySelectorAll('[role="list"]')].map((l) => l.getAttribute('aria-label'));
	const choose = viewChoice;
	const made = (id: string, title: string, folder: string | null, ...on: [string | null, string][]) => ({
		id,
		title,
		folder,
		records: [],
		people: [],
		iterations: on.map(([product, createdAt], i) => ({
			...SAMPLE_PROJECTS[0]!.iterations[0]!,
			name: `v1-i${i + 1}`,
			branch: `prototype/${id}/v1-i${i + 1}`,
			product,
			createdAt,
		})),
	});
	const PROJECTS = [
		made('alerts', 'Alerts', 'Admin', [COKE, '2026-10-01T10:00:00Z']),
		made('maps', 'Maps', null, [PEPSI, '2026-10-02T10:00:00Z']),
		made('both', 'Both', 'Admin', [COKE, '2026-10-01T10:00:00Z'], [PEPSI, '2026-10-05T10:00:00Z']),
		made('old', 'Old', null, [null, '2026-09-01T10:00:00Z']),
	];

	it('shows the open product’s projects first, by folder, and those with no product on record, marked', async () => {
		await showOpen(OPEN, PROJECTS);
		expect((await scopeChoices()).map((o) => [o.textContent, o.getAttribute('aria-checked')])).toEqual([
			['This product', 'true'],
			['All projects', 'false'],
		]);
		expect(sections()).toEqual(['Admin', 'No folder']);
		expect(names()).toEqual(['Alerts', 'Both', 'Old']);
		expect(meta('Old')).toBe('1 version · No product');
		expect(meta('Alerts')).toBe('1 version');
	});

	it('counts a project’s versions, each however many iterations it has, and no version for work in the code', async () => {
		const at = (name: string, createdAt: string) => ({
			...made('x', 'X', null, [COKE, createdAt]).iterations[0]!,
			name,
			branch: name === 'codebase' ? 'feature/x' : `prototype/x/${name}`,
		});
		const project = {
			...made('x', 'Many', null, [COKE, '2026-10-01T10:00:00Z']),
			iterations: [
				at('v1-i1', '2026-10-01T10:00:00Z'),
				at('v1-i2', '2026-10-02T10:00:00Z'),
				at('v2-i1', '2026-10-03T10:00:00Z'),
				at('codebase', '2026-10-04T10:00:00Z'),
			],
		};
		const inCode = { ...project, id: 'y', title: 'Only code', iterations: [at('codebase', '2026-10-04T10:00:00Z')] };
		await showOpen(OPEN, [project, inCode]);
		await choose('All projects');
		expect(meta('Many')).toBe('2 versions');
		// Nothing to count, so nothing is said of it: the line is its folder and where else it is, when it has them.
		expect(meta('Only code')).toBeUndefined();
	});

	it('shows everyone’s by product, the open one first and No product last, each project once with its folder and where else it is', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		expect(sections()).toEqual(['flock-coke', 'flock-pepsi', 'No product']);
		expect(names()).toEqual(['Alerts', 'Maps', 'Both', 'Old']);
		// Both's newest work is Pepsi's, so it is under Pepsi, once, and says it is in Coke too.
		expect(rows()[2]!.closest('[role="list"]')?.getAttribute('aria-label')).toBe('flock-pepsi');
		// Two iterations of the same version are one version: iterations are the small changes within an idea.
		expect(meta('Both')).toBe('1 version · Admin · Also in flock-coke');
		expect(meta('Alerts')).toBe('1 version · Admin');
	});

	it('changes nothing of what can be done: a project of another product opens for review as any does', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		await press(
			rows()
				.find((r) => r.querySelector('[data-part="name"]')?.textContent === 'Maps')!
				.querySelector('button')!,
		);
		expect(panelSaid().at(-1)).toMatchObject({ type: 'open-review', projectId: 'maps' });
	});

	it('says when the open product has none of its own yet, and how to see everyone’s', async () => {
		await showOpen(OPEN, [PROJECTS[1]!]);
		expect(body().textContent).toContain('No projects in flock-coke yet');
		await press(button('Show all projects'));
		expect(names()).toEqual(['Maps']);
	});

	it('says a search found nothing here, not that the product has no projects, when what it found is another product’s', async () => {
		await showOpen(OPEN, PROJECTS);
		await type(document.querySelector('input[aria-label="Search projects"]')!, 'Maps');
		expect(body().textContent).not.toContain('No projects in flock-coke yet');
		expect(body().textContent).toContain('No project matches');
	});

	it('names a product the same in a section’s title and in another project’s Also in', async () => {
		const ACME = 'acme/flock-coke';
		await showOpen(OPEN, [...PROJECTS, made('acme', 'Acme', null, [ACME, '2026-10-01T10:00:00Z'], [PEPSI, '2026-10-06T10:00:00Z'])]);
		await choose('All projects');
		// Two products called flock-coke: each by its owner too, in titles and labels alike.
		expect(sections()).toEqual(['flocksafety/flock-coke', 'flock-pepsi', 'No product']);
		expect(meta('Acme')).toBe('1 version · Also in acme/flock-coke');
	});

	it('goes back to the product’s own when another product is opened', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		await say({ type: 'context', context: { ...OPEN, product: '/work/flock-pepsi', productRepository: PEPSI } });
		await answer('listProjects', PROJECTS);
		expect((await scopeChoices()).map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false']);
	});

	it('has one button for it all: Projects (whose) above a divider, Layout below, an icon on the left of each and a check on the right of the one chosen', async () => {
		await showOpen(OPEN, PROJECTS);
		await press(viewMenu()!);
		const menu = document.querySelector('[role="menu"]') as HTMLElement;
		expect(menu.getAttribute('aria-label')).toBe('View options');
		expect([...menu.querySelectorAll('.menu-heading')].map((h) => h.textContent)).toEqual(['Projects', 'Layout']);
		expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
		const choices = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(choices.map((c) => c.textContent)).toEqual(['This product', 'All projects', 'Grid', 'List']);
		// An icon at the start of each; a check at the end of the one chosen in its group only.
		expect(choices.every((c) => c.firstElementChild?.classList.contains('codicon'))).toBe(true);
		expect(choices.map((c) => c.lastElementChild?.classList.contains('menu-check'))).toEqual([true, false, true, false]);
		expect(choices.map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true', 'false']);
		// The old toggles are gone from the tab.
		expect(body().querySelector('[role="radiogroup"]')).toBeNull();
	});

	it('draws the options button at the default size, the search’s, and a project’s own actions small', async () => {
		await showOpen(OPEN, PROJECTS);
		expect(viewMenu()!.className).toBe('menu-button menu-button-shown');
		expect([...body().querySelectorAll('[aria-label="Project actions"]')].every((b) => b.classList.contains('menu-button-small'))).toBe(true);
	});

	it('moves the check to what is chosen, and closes', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		expect(document.querySelector('[role="menu"]')).toBeNull();
		expect(await checked('All projects')).toBe('true');
		expect(await checked('This product')).toBe('false');
		expect(await checked('Grid')).toBe('true');
	});

	describe('mine', () => {
		const signedIn = { state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } };
		/** Signing in or out reads the projects again, as it always has: the same ones, answered. */
		const become = async (payload: unknown, projects: unknown[]) => {
			await say({ type: 'event', name: 'onSignInChanged', payload });
			await answer('listProjects', projects);
		};
		const mine = [
			{ ...made('alerts', 'Alerts', 'Admin', [COKE, '2026-10-01T10:00:00Z']), people: [{ name: 'Noah', login: 'Noah' }] },
			{ ...made('maps', 'Maps', null, [PEPSI, '2026-10-02T10:00:00Z']), people: [{ name: 'Someone', login: 'someone' }] },
			{ ...made('both', 'Both', null, [COKE, '2026-10-01T10:00:00Z'], [PEPSI, '2026-10-05T10:00:00Z']), people: [{ name: 'Noah', login: 'noah' }] },
		];

		it('is offered once signed in, and not before: nothing says whose they would be', async () => {
			await showOpen(OPEN, mine);
			expect((await scopeChoices()).map((o) => o.textContent)).toEqual(['This product', 'All projects']);
			await press(document.body);
			await become(signedIn, mine);
			expect((await scopeChoices()).map((o) => o.textContent)).toEqual(['This product', 'All projects', 'Mine']);
		});

		it('shows the projects I have worked on, whatever product, by product as everyone’s are, and nothing else', async () => {
			await showOpen(OPEN, mine);
			await become(signedIn, mine);
			await choose('Mine');
			expect(await checked('Mine')).toBe('true');
			expect(names()).toEqual(['Alerts', 'Both']);
			expect(sections()).toEqual(['flock-coke', 'flock-pepsi']);
		});

		it('says when none is mine yet, and how to see everyone’s', async () => {
			await showOpen(OPEN, [mine[1]!]);
			await become(signedIn, [mine[1]!]);
			await choose('Mine');
			expect(body().textContent).toContain('None of these projects has your work in it yet');
			await press(button('Show all projects'));
			expect(names()).toEqual(['Maps']);
		});

		it('goes back to the open product’s when I sign out, rather than showing a list of nobody’s', async () => {
			await showOpen(OPEN, mine);
			await become(signedIn, mine);
			await choose('Mine');
			await become({ state: 'signedOut' }, mine);
			expect(names()).toEqual(['Alerts', 'Both']);
			expect(await checked('This product')).toBe('true');
		});

		it('is offered with no product open too, among everyone’s', async () => {
			await showOpen({ ...OPEN, product: null, productRepository: null, designRepository: null, missing: ['No product is open.'] }, mine);
			await become(signedIn, mine);
			expect((await scopeChoices()).map((o) => o.textContent)).toEqual(['All projects', 'Mine']);
		});
	});

	it('has no switch when the product open has no repository it can say, and shows everyone’s', async () => {
		await showOpen({ ...OPEN, productRepository: null }, PROJECTS);
		expect(await scopeChoices()).toEqual([]);
		expect(sections()).toEqual(['flock-coke', 'flock-pepsi', 'No product']);
	});
});

describe('Projects', () => {
	const rows = () => [...body().querySelectorAll<HTMLElement>('[role="listitem"]')];
	const part = (row: HTMLElement, name: string) => row.querySelector(`[data-part="${name}"]`)?.textContent ?? null;

	it('lists each project with a picture, its name, what it has, and its open comments as a badge', async () => {
		await showOpen();
		// Each list is named for its folder, as its section is.
		expect([...body().querySelectorAll('[role="list"]')].map((l) => l.getAttribute('aria-label'))).toEqual(['Admin', 'Maps', 'No folder']);
		expect(rows().map((r) => part(r, 'name'))).toEqual(['Alert history', 'Zone coverage', 'Admin usage', 'Role comparison']);
		expect(rows()[0]!.querySelector('[data-part="picture"]')).not.toBeNull();
		expect(part(rows()[0]!, 'meta')).toBe('2 versions');
		expect(part(rows()[3]!, 'meta')).toBe('1 version');
	});

	it('marks the project whose review is in front in the editor, in a grid and in a list, and no other', async () => {
		await showOpen();
		const current = () => [...body().querySelectorAll<HTMLElement>('[data-current]')].map((i) => i.querySelector('[data-part="name"]')?.textContent);
		expect(current()).toEqual([]);
		await say({ type: 'tabs-shown', projects: ['zone-coverage'], components: [] });
		expect(current()).toEqual(['Zone coverage']);
		expect(body().querySelector('[aria-current="true"] [data-part="name"]')?.textContent).toBe('Zone coverage');
		await viewChoice('List');
		expect(current()).toEqual(['Zone coverage']);
		// Covered or closed, it is marked no more.
		await say({ type: 'tabs-shown', projects: [], components: [] });
		expect(current()).toEqual([]);
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
		// Read again, so a list of its own, as every read is.
		await answer(
			'listProjects',
			SAMPLE_PROJECTS.map((p) => ({ ...p })),
		);
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
	/** The panel open on the Design System tab, with what the extension said is open. */
	const open = async (context: Context = OPEN, unreadable?: string) => {
		await show();
		await say({ type: 'context', context, ...(unreadable ? { unreadable } : {}) });
		if (context.product) await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
	};
	/** …and the design system read: its name, its catalog, and its components' pictures. */
	const read = async (catalog: Catalog = SAMPLE_CATALOG, pictures: Partial<ComponentPictures> = {}) => {
		await open();
		await answer('designSystems', {
			systems: [{ id: 'flocksafety/flock-react-component-lib', name: 'FUI' }],
			current: 'flocksafety/flock-react-component-lib',
		});
		await answer('designSystemCatalog', catalog);
		if (catalog.state === 'ready' && sent.some((m) => m.name === 'componentPictures'))
			await answer('componentPictures', { drawing: false, pictures: {}, issues: {}, ...pictures });
	};
	const headers = () => [...body().querySelectorAll<HTMLElement>('.section-header')];
	const titles = () =>
		headers().map((h) => [h.querySelector('[data-part="title"]')?.textContent, h.querySelector('[data-part="count"]')?.textContent ?? null]);
	const section = (name: string) => headers().find((h) => h.querySelector('[data-part="title"]')?.textContent === name) as HTMLElement;
	const under = (header: HTMLElement) => document.getElementById(header.getAttribute('aria-controls') ?? '') as HTMLElement;
	const namesUnder = (header: HTMLElement) => [...under(header).querySelectorAll('[data-part="name"]')].map((n) => n.textContent);
	const parts = () => document.querySelector('[aria-label="Part"]') as HTMLElement;

	it('says, when there is none, what DSNR looked for and where, and offers to locate it', async () => {
		await open({ ...OPEN, designSystem: null });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No design system found');
		expect(body().textContent).toContain('DSNR looks in the folders open in this window');
		await press(button('Locate design system…'));
		expect(panelSaid().at(-1)).toEqual({ type: 'locate-design-system' });
		expect(calls('designSystemCatalog')).toEqual([]);
	});

	it('says why the one found cannot be read, reads nothing, and offers to locate another', async () => {
		await open(OPEN, '/work/plain is not a git repository.');
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('The design system cannot be read');
		expect(body().textContent).toContain('/work/plain is not a git repository.');
		expect(calls('designSystemCatalog')).toEqual([]);
	});

	it('is read once its tab is shown, at once from what its clone has, then again once GitHub has been asked', async () => {
		await open();
		expect(body().textContent).toBe('Reading the design system…');
		expect(calls('designSystemCatalog').map((c) => c.args)).toEqual([[false]]);
		await answer('designSystemCatalog', { ...SAMPLE_CATALOG, update: 'updating' });
		expect(calls('designSystemCatalog').map((c) => c.args)).toEqual([[false], [true]]);
	});

	it('names the design system, the icon of its branch directly after it with the branch as its tooltip, with Sync and its menu, and starts on its components', async () => {
		await read();
		expect(body().querySelector('.ds-name')?.textContent).toBe('FUI');
		// The branch is not written: it is the tooltip of its icon, which is the name's next sibling in the one line.
		const branch = body().querySelector('.ds-branch') as HTMLElement;
		expect(branch.textContent).toBe('');
		expect(branch.title).toBe('develop');
		expect(branch.getAttribute('aria-label')).toBe('Branch develop');
		expect(branch.previousElementSibling).toBe(body().querySelector('.ds-name'));
		expect(branch.querySelector('.codicon-git-branch')?.classList.contains('icon-xs')).toBe(true);
		expect([...parts().querySelectorAll('[role="radio"]')].map((o) => [o.textContent, o.getAttribute('aria-checked')])).toEqual([
			['Components', 'true'],
			['Tokens', 'false'],
		]);
		// Words alone: no icon before Components or Tokens.
		expect(parts().querySelector('.codicon')).toBeNull();
		// Its menu: Sync first, then a divider, then what needs the editor's room: Primitives, and the voice and tone, a
		// document of its own. Always there, small, not only on hover as a row's is; and no button of Sync's own beside it.
		expect(body().querySelector('.ds-actions [aria-label="Sync with GitHub"]')).toBeNull();
		expect(body().querySelector('[aria-label="Design system actions"]')?.className).toBe('menu-button menu-button-small menu-button-shown');
		await press(body().querySelector('[aria-label="Design system actions"]') as HTMLElement);
		const items = [...body().querySelectorAll<HTMLElement>('.ds-actions [role="menuitem"]')];
		expect(items.map((i) => i.textContent)).toEqual(['Sync with GitHub', 'Primitives', 'Voice and Tone']);
		expect(body().querySelectorAll('.ds-actions [role="separator"]')).toHaveLength(1);
		expect(items[0]!.nextElementSibling?.getAttribute('role')).toBe('separator');
		await press(items[2]!);
		expect(panelSaid().at(-1)).toEqual({ type: 'open-voice-and-tone' });
		await press(body().querySelector('[aria-label="Design system actions"]') as HTMLElement);
		await press(body().querySelector<HTMLElement>('.ds-actions [role="menuitem"]')!);
		expect(calls('designSystemCatalog').at(-1)?.args).toEqual([true]);
	});

	it('lists its components under their groups, as cards with their pictures, the first view, and no count of what axe found on them', async () => {
		const picture = 'http://127.0.0.1:4321/pictures/fsbutton.jpg';
		await read(SAMPLE_CATALOG, {
			pictures: { 'src/components/FSButton/FSButton.stories.tsx': picture },
			issues: { 'src/components/FSAlert/FSAlert.stories.tsx': { violations: 2, incomplete: 1 } },
		});
		expect(titles()).toEqual([
			['Buttons', '3'],
			['Inputs', '2'],
			['Feedback', '2'],
		]);
		expect(namesUnder(section('Buttons'))).toEqual(['FSButton', 'FSIconButton', 'FSSplitButton']);
		expect(under(section('Buttons')).firstElementChild?.className).toBe('grid');
		expect(under(section('Buttons')).querySelector('img')?.getAttribute('src')).toBe(picture);
		// A card is its picture and its name, and no description under it, nor has a row.
		expect(under(section('Buttons')).querySelector('[data-part="meta"]')).toBeNull();
		// What axe found is read, but not drawn on the card: nothing counts on a component for now.
		expect(under(section('Buttons')).querySelector('.badge')).toBeNull();
	});

	it('opens a component in its own tab when pressed, and its links, and no Open, from its menu, naming it only', async () => {
		await read();
		const card = [...body().querySelectorAll<HTMLElement>('.card-item')].find((c) => c.textContent?.includes('FSButton')) as HTMLElement;
		await press(card.querySelector('.card') as HTMLElement);
		expect(panelSaid().at(-1)).toEqual({ type: 'open-component', id: 'src/components/FSButton/FSButton.stories.tsx' });
		await press(card.querySelector('.menu-button') as HTMLElement);
		expect([...card.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual(['Open in Storybook', 'View on GitHub']);
		await press([...card.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent === 'Open in Storybook')!);
		expect(panelSaid().at(-1)).toEqual({ type: 'component-link', id: 'src/components/FSButton/FSButton.stories.tsx', link: 'storybook' });
		// One with no hosted Storybook offers none.
		const other = [...body().querySelectorAll<HTMLElement>('.card-item')].find((c) => c.textContent?.includes('FSSelect')) as HTMLElement;
		await press(other.querySelector('.menu-button') as HTMLElement);
		expect([...other.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual(['View on GitHub']);
	});

	it('keeps the Components and Tokens toggle and the search bar together, as siblings, which the stylesheet stacks at the top', async () => {
		await read();
		expect(body().querySelector('.ds-part ~ .view-bar')).not.toBeNull();
		await press(parts().querySelectorAll<HTMLElement>('[role="radio"]')[1]!);
		expect(body().querySelector('.ds-part ~ .view-bar')).not.toBeNull();
	});

	it('has the same search and view options as Projects, with the layout and the color mode to choose: the toolbar is one pattern', async () => {
		await read();
		const bar = body().querySelector('.view-bar') as HTMLElement;
		expect([...bar.children].map((c) => (c.querySelector('input') ? 'search' : c.querySelector('button')?.getAttribute('aria-label')))).toEqual([
			'search',
			'View options',
		]);
		expect(await checked('Grid')).toBe('true');
		expect(await checked('List')).toBe('false');
		const menu = document.querySelector('[role="menu"]') as HTMLElement;
		expect([...menu.querySelectorAll('.menu-heading')].map((h) => h.textContent)).toEqual(['Layout', 'Color mode']);
		expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
		expect(body().querySelector('[aria-label="Layout"][role="radiogroup"]')).toBeNull();
	});

	it('marks the component whose tab is in front in the editor, and no other', async () => {
		await read();
		const current = () => [...body().querySelectorAll<HTMLElement>('[data-current]')].map((i) => i.querySelector('[data-part="name"]')?.textContent);
		expect(current()).toEqual([]);
		await say({ type: 'tabs-shown', projects: [], components: ['src/components/FSButton/FSButton.stories.tsx'] });
		expect(current()).toEqual(['FSButton']);
		await say({ type: 'tabs-shown', projects: [], components: [] });
		expect(current()).toEqual([]);
	});

	it('offers the mode components are shown in as a Color mode section of the view options, light chosen, and only when the library has a dark', async () => {
		await read();
		const mode = async () => (await viewChoices()).filter((o) => o.closest('[role="group"]')?.getAttribute('aria-label') === 'Color mode');
		expect((await mode()).map((o) => [o.textContent, o.getAttribute('aria-checked')])).toEqual([
			['Light', 'true'],
			['Dark', 'false'],
		]);
		// A sun at the start of Light (a circle and its rays), a moon at the start of Dark (one crescent).
		const [light, dark] = await mode();
		expect(light!.querySelector('svg circle')).not.toBeNull();
		expect(dark!.querySelector('svg circle')).toBeNull();
		expect(dark!.querySelector('svg path')).not.toBeNull();
		await viewChoice('Dark');
		expect(panelSaid().at(-1)).toEqual({ type: 'set-mode', mode: 'dark' });
		expect((await mode()).map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true']);
		// The extension's choice, told to every page, is what it shows.
		await say({ type: 'mode', mode: 'light' });
		expect((await mode()).map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false']);
		await unmount();
		// A library with no dark: no section.
		await read({ ...SAMPLE_CATALOG, tokens: { ...SAMPLE_CATALOG.tokens, tokens: SAMPLE_CATALOG.tokens.tokens.filter((t) => t.group !== 'Dark') } });
		expect((await mode()).length).toBe(0);
		expect(document.querySelector('[role="group"][aria-label="Layout"]')).not.toBeNull();
	});

	it('finds components by the search, says when none matches, and is a list when chosen', async () => {
		await read();
		const search = body().querySelector('input[aria-label="Search components"]') as HTMLInputElement;
		await type(search, 'select');
		expect(titles()).toEqual([['Inputs', '1']]);
		await viewChoice('List');
		expect(under(section('Inputs')).firstElementChild?.className).toBe('list');
		expect(under(section('Inputs')).querySelector('[data-part="meta"]')).toBeNull();
		await type(search, 'nothing like it');
		expect(body().querySelector('.note')?.textContent).toContain('No component matches “nothing like it”.');
	});

	/** The tokens part, and the colors' Palette view when asked for. */
	const tokens = async (palette = false) => {
		await read();
		await press([...parts().querySelectorAll<HTMLElement>('[role="radio"]')][1]!);
		if (palette) await press(body().querySelector('[aria-label="Color view"] [aria-label="Palette"]') as HTMLElement);
	};

	it('shows its tokens by primitive, and its colors as the app does: a row for each role, a column for each theme', async () => {
		await tokens();
		expect(titles()).toEqual([
			['Color', '3'],
			['Typography', '1'],
			['Spacing', '1'],
			['Shape', '1'],
		]);
		const set = body().querySelector('[data-token-set="primary"]') as HTMLElement;
		// The themes are headed by the icons of the mode switch, the sun and the moon, not by their names: named for assistive
		// technology and on hover.
		const headings = [...set.querySelectorAll<HTMLElement>('[data-theme-heading]')];
		expect(headings.map((h) => [h.getAttribute('aria-label'), h.title, h.textContent])).toEqual([
			['Light', 'Light', ''],
			['Dark', 'Dark', ''],
		]);
		expect(headings.map((h) => h.querySelector('svg')?.querySelector('circle') !== null)).toEqual([true, false]);
		const rows = [...set.querySelectorAll<HTMLElement>('[data-token-row]')];
		expect(rows.map((r) => r.dataset.tokenRow)).toEqual(['main', 'contrastText']);
		// Each theme's value is a dot of its own, saying which token it is and what it points at; a theme without the role is a dash.
		const light = rows[0]!.querySelector('[data-token="palette.light.primary.main"] button') as HTMLElement;
		expect(light.getAttribute('title')).toBe('Light primary main');
		expect(light.className).toBe('color-dot');
		expect(rows[0]!.querySelector('[data-token="palette.dark.primary.main"] button')?.getAttribute('title')).toBe('Dark primary main');
		expect(rows[1]!.querySelector('.theme-none')?.textContent).toBe('—');
		// Pressed, one theme's value opens its own control.
		await press(light);
		expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Light · primary.main');
	});

	it('says nothing on a colour’s dot but the token’s name, in the grid of roles and in the palette: one line, no hex, no pointer', async () => {
		for (const palette of [false, true]) {
			await unmount();
			await tokens(palette);
			const dots = [...body().querySelectorAll<HTMLElement>('.color-dot')];
			expect(dots.length).toBeGreaterThan(0);
			// The token's name, as the row is named, and nothing after it.
			for (const d of dots) expect(d.title).toBe(d.getAttribute('aria-label')?.replace(/^Change /, ''));
		}
	});

	it('shows the palette behind the roles, a press away: each step as its name and only its dot, whose hover is its name, and its own file', async () => {
		await tokens(true);
		expect(titles()[0]).toEqual(['Color', '2']);
		const step = body().querySelector('[data-token="tone.pineGreen.50"]') as HTMLElement;
		// The color is the dot and nothing else of it is written in the row: no swatch beside its hex, no hex.
		expect(step.querySelectorAll('[data-swatch]')).toHaveLength(1);
		expect(step.querySelector('[data-part="value"]')).toBeNull();
		expect(step.querySelector('[data-part="name"]')?.textContent).toBe('50');
		expect(step.querySelector('.color-dot')?.getAttribute('title')).toBe('Tones pineGreen 50');
		expect(step.title).toBe('src/colors/tones.ts:3');
		// Its name is the link to its file, at its line; there is no icon beside it to press for that.
		const link = step.querySelector('button[data-part="name"]') as HTMLElement;
		expect(link.getAttribute('aria-label')).toBe('50: open src/colors/tones.ts:3');
		expect(step.querySelector('.item-actions, .codicon-go-to-file')).toBeNull();
		await press(link);
		expect(panelSaid().at(-1)).toEqual({ type: 'open-library-source', file: 'src/colors/tones.ts', line: 3 });
		// And the dot, not the name, is what opens its control.
		await press(step.querySelector('button.color-dot') as HTMLElement);
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it('keeps a role’s themes together when the search finds it in one', async () => {
		await tokens();
		const search = body().querySelector('input[aria-label="Search tokens"]') as HTMLInputElement;
		await type(search, 'pineGreen 60');
		// Only Dark's main points at pineGreen 60; Light's is beside it.
		expect([...body().querySelectorAll<HTMLElement>('[data-token-row]')].map((r) => r.dataset.tokenRow)).toEqual(['main']);
		expect(body().querySelectorAll('[data-token-row="main"] [data-token]')).toHaveLength(2);
	});

	it('shows the tokens as the change the extension keeps changes them, marked', async () => {
		await tokens(true);
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.50', value: '#000000' }] });
		const step = body().querySelector('[data-token="tone.pineGreen.50"]') as HTMLElement;
		expect(step.dataset.changed).toBe('true');
		expect((step.querySelector('.color-dot [data-swatch]') as HTMLElement).style.backgroundColor).toBe('rgb(0, 0, 0)');
		// Marked on the dot, where its color is.
		expect(step.querySelector('.color-dot [data-changed-mark]')?.getAttribute('aria-label')).toBe('Changed');
		// The role pointing at it shows the change too.
		await press(body().querySelector('[aria-label="Color view"] [aria-label="Semantic"]') as HTMLElement);
		expect((body().querySelector('[data-token="palette.light.primary.main"] [data-swatch]') as HTMLElement).style.backgroundColor).toBe(
			'rgb(0, 0, 0)',
		);
	});

	it('says an update that failed, and what its token files have that is not read, in a dialog', async () => {
		await read({
			...SAMPLE_CATALOG,
			update: { failed: 'Could not reach GitHub.' },
			tokens: { ...SAMPLE_CATALOG.tokens, problems: [{ file: 'src/colors/tones.ts', line: 9, reason: 'A value worked out as it runs.' }] },
		});
		expect(body().querySelector('[data-update-failed]')?.textContent).toContain('Could not update from GitHub: Could not reach GitHub.');
		// What is not read is a count beside Sync, the bubble a button that says it, not a line of its own.
		const bubble = body().querySelector('.ds-actions [aria-label="1 value in its token files is not read"]') as HTMLElement;
		expect(bubble.textContent).toBe('1');
		expect(bubble.className).toBe('badge badge-warning badge-button');
		expect(body().querySelector('.note .link')).toBeNull();
		// In the row the changes count comes first, then what is not read, then the menu.
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.60', value: '#000000' }] });
		const order = [...body().querySelectorAll('.ds-actions > *')].map((e) => e.getAttribute('aria-label') ?? e.className);
		expect(order.slice(0, 2)).toEqual(['1 change being tried', '1 value in its token files is not read']);
		expect(body().querySelector('.ds-actions')?.lastElementChild?.matches('.menu, .menu *, [aria-label="Design system actions"]')).toBe(true);
		await press(bubble);
		const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
		expect(dialog.textContent).toContain('src/colors/tones.ts:9 A value worked out as it runs.');
	});

	it('has no not-read bubble when every value is read, and no changes count until something is being tried, then always the brand’s', async () => {
		await read();
		expect(body().querySelector('.ds-actions .badge-warning')).toBeNull();
		expect(body().querySelector('.ds-actions [aria-label$="being tried"]')).toBeNull();
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.60', value: '#000000' }] });
		const changes = body().querySelector('.ds-actions [aria-label="1 change being tried"]') as HTMLElement;
		expect(changes.classList.contains('badge-brand')).toBe(true);
		await say({ type: 'token-edits', edits: [] });
		expect(body().querySelector('.ds-actions [aria-label$="being tried"]')).toBeNull();
	});

	it('says when the design system is no longer on this computer, and offers to locate it', async () => {
		await read({ state: 'lost', name: 'FUI', root: '/work/flock-react-component-lib' });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('FUI is no longer on this computer');
		await press(button('Locate design system…'));
		expect(panelSaid().at(-1)).toEqual({ type: 'locate-design-system' });
	});

	it('says why a clone with no copy of its branch cannot be read, with a way to try again', async () => {
		await read({ state: 'no-branch', root: '/work/flock-react-component-lib', branch: 'develop' });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('This clone has no develop branch');
		await press(button('Try again'));
		expect(calls('designSystemCatalog').at(-1)?.args).toEqual([true]);
	});
});

describe('every change being tried, in the panel’s Changes: the tokens and each component’s values (the changes being tried, DESIGN_SYSTEM.md)', () => {
	const SYSTEM = 'flocksafety/flock-react-component-lib';
	const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
	const SMALL = { property: 'height', value: '32px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] };
	const ID = 'height\u0000height:sm:0\u0001height:sm:1\u0001height:sm:2';
	const FOUND = {
		state: 'ready',
		values: [{ id: ID, state: 'found', places: [{ file: 'src/utils/theme.ts', line: 158, written: '28px', writes: '32px' }] }],
		reach: { state: 'none' },
	};
	/** The panel on the Design System tab, the design system read and its tokens' branch none. */
	const designOpen = async () => {
		await show();
		await say({ type: 'context', context: OPEN });
		await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
		await answer('designSystems', { systems: [{ id: SYSTEM, name: 'FUI' }], current: SYSTEM });
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		await answer('tokenBranch', null);
	};
	const count = () => document.querySelector('.ds-actions [aria-label$="being tried"]') as HTMLElement;
	const changes = () => document.querySelector('[role="dialog"][aria-label="Changes"]') as HTMLElement | null;
	const group = () => document.querySelector('[aria-label="Value changes · FSButton"]') as HTMLElement | null;
	const trialsSaid = () => panelSaid().filter((m) => m.type === 'value-trial');

	it('counts every component’s values tried on this commit, and lists each by its name, with its Save, Propose and Reset', async () => {
		await designOpen();
		// A value tried on another commit is that commit's: not counted, not listed.
		await say({
			type: 'value-trials',
			trials: {
				[BUTTON]: { commit: 'abc123', values: [SMALL] },
				'src/components/FSIconButton/FSIconButton.stories.tsx': { commit: 'def456', values: [SMALL] },
			},
		});
		expect(count().getAttribute('aria-label')).toBe('1 change being tried');
		expect(count().classList.contains('badge-brand')).toBe(true);
		await press(count());
		await answer('valueBranchFiles', []);
		await answer('valueBranch', null);
		await answer('valueSources', FOUND);
		expect(calls('valueSources').at(-1)?.args).toEqual([BUTTON, [SMALL]]);
		expect(group()?.querySelector('.changed-title')?.textContent).toBe('FSButton 1');
		expect(document.querySelector('[aria-label="Value changes · FSIconButton"]')).toBeNull();
		// Its actions are here, where every change is.
		await press(button('Save to a branch'));
		expect(calls('saveValues').at(-1)?.args).toEqual([BUTTON, [SMALL]]);
		await answer('saveValues', { branch: 'dsnr/values-20261016-ab12', saved: [SMALL], saves: 1, pullRequest: null });
		expect(group()?.querySelector('.branch-line')?.textContent).toBe('dsnr/values-20261016-ab12 · 1 save');
		await press(button('Propose'));
		expect(calls('proposeValues').at(-1)?.args).toEqual([BUTTON]);
		// Reset here is the extension's too: every page is told, its tab with it.
		await press(group()!.querySelector('button.link') as HTMLElement);
		expect(trialsSaid().at(-1)).toEqual({ type: 'value-trial', file: BUTTON, commit: 'abc123', values: [] });
	});

	it('lists a component with a branch of its values kept and nothing tried, and puts its values back, as opening its tab does', async () => {
		await designOpen();
		// Asked as the panel opens, so the count is there for it: a branch kept with nothing tried is a change in the Changes.
		await answer('valueBranchFiles', [BUTTON]);
		await answer('handoffFiles', []);
		await press(count());
		await answer('valueBranch', { branch: 'dsnr/values-20261016-ab12', saved: [SMALL], saves: 1, pullRequest: null });
		expect(trialsSaid().at(-1)).toEqual({ type: 'value-trial', file: BUTTON, commit: 'abc123', values: [SMALL] });
		expect(group()).not.toBeNull();
	});

	it('counts what it lists, kept up as a trial ends: its values kept as a branch are still one change', async () => {
		await designOpen();
		await answer('valueBranchFiles', []);
		await answer('handoffFiles', []);
		expect(count()).toBeNull();
		await say({ type: 'value-trials', trials: { [BUTTON]: { commit: 'abc123', values: [SMALL] } } });
		expect(count().getAttribute('aria-label')).toBe('1 change being tried');
		// A value moved is not a trial started or ended: what is kept is not asked again for it.
		const asked = calls('valueBranchFiles').length;
		await say({ type: 'value-trials', trials: { [BUTTON]: { commit: 'abc123', values: [{ ...SMALL, value: '36px' }] } } });
		expect(calls('valueBranchFiles')).toHaveLength(asked);
		// Its values kept as a branch: the trial ends, what is kept is asked again, and the branch is the one change.
		await say({ type: 'value-trials', trials: {} });
		expect(calls('valueBranchFiles')).toHaveLength(asked + 1);
		await answer('valueBranchFiles', [BUTTON]);
		await answer('handoffFiles', []);
		expect(count().getAttribute('aria-label')).toBe('1 change being tried');
	});

	it('opens when a component’s tab asks for it, on the Design System tab', async () => {
		await show();
		await say({ type: 'context', context: OPEN });
		await answer('listProjects', SAMPLE_PROJECTS);
		expect(chosen()).toBe('Projects');
		await say({ type: 'open-dialog', dialog: { kind: 'changes' } });
		expect(chosen()).toBe('Design System');
		await answer('designSystems', { systems: [{ id: SYSTEM, name: 'FUI' }], current: SYSTEM });
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		await answer('tokenBranch', null);
		expect(changes()).not.toBeNull();
		await press(changes()!.querySelector('[aria-label="Close"]') as HTMLElement);
		expect(changes()).toBeNull();
	});

	describe('Process changes: one group handed to Claude Code on a branch DSNR names, read from git, proposed as the rules allow', () => {
		const EDITS = [{ path: 'tone.pineGreen.60', value: '#000000' }];
		const BRANCH = 'dsnr/handoff-20261017-ab12';
		const handoff = () => document.querySelector('[data-handoff]') as HTMLElement | null;
		/** Answers the page's latest call to `name` that asked about `file` (the tokens' none, or a component's story file). */
		const answerFor = async (name: string, file: string | null, value: unknown) => {
			const call = calls(name)
				.filter((c) => c.args?.[0] === file)
				.at(-1);
			if (!call) throw new Error(`the page made no ${name} call for ${String(file)}`);
			await say({ type: 'answer', id: call.id, result: { ok: true, value } });
		};
		/** The Changes dialog open on the token changes, nothing kept for any group. */
		const tokensChanged = async () => {
			await designOpen();
			await say({ type: 'token-edits', edits: EDITS });
			await press(count());
			await answerFor('handoffBranch', null, null);
			await answer('valueBranchFiles', []);
			await answer('handoffFiles', []);
		};
		const TIP = 'c'.repeat(40);
		const READY = {
			state: 'ready',
			tip: TIP,
			commits: 2,
			files: [
				{ path: 'src/utils/theme.ts', added: 3, removed: 1, out: null },
				{ path: 'src/components/FSButton/FSButton.stories.tsx', added: 4, removed: 0, out: 'a story' },
			],
			lines: 8,
			large: false,
		};

		it('offers it beside Save, hands over that one group, and shows its branch in Save’s place until Claude Code makes it', async () => {
			await tokensChanged();
			expect(button('Save to a branch')).toBeDefined();
			await press(button('Process changes'));
			expect(calls('handOverChanges').at(-1)?.args).toEqual([null, { edits: EDITS }]);
			await answer('handOverChanges', { branch: BRANCH, editor: true, command: null });
			await answerFor('handoffBranch', null, { branch: BRANCH, lines: ['primary: #000000'], review: { state: 'missing' }, pullRequest: null });
			expect(handoff()?.querySelector('.branch-line')?.textContent).toBe(BRANCH);
			expect(handoff()?.textContent).toContain('This hand-over is in Claude Code in this window now');
			expect(handoff()?.textContent).toContain('Claude Code makes this branch, by the name its prompt gives');
			// One branch in play: neither Save nor Process changes again, and nothing proposed before it is made.
			expect(button('Save to a branch')).toBeUndefined();
			expect(button('Process changes')).toBeUndefined();
			expect(button('Propose')).toBeUndefined();
		});

		it('says why it was not handed over, and opens nothing', async () => {
			await tokensChanged();
			await press(button('Process changes'));
			const call = calls('handOverChanges').at(-1);
			const why = 'The library’s checkout has changes not committed: commit or stash them, then process the changes again.';
			await say({ type: 'answer', id: call?.id, result: { ok: false, error: why } });
			expect(document.querySelector('[data-branch-actions] [role="alert"]')?.textContent).toBe(why);
			expect(handoff()).toBeNull();
		});

		it('lists each file the branch changed, flags what the rules keep out, and proposes it only on a deliberate yes', async () => {
			await designOpen();
			await answer('valueBranchFiles', []);
			await answer('handoffFiles', ['']);
			await press(count());
			await answerFor('handoffBranch', null, { branch: BRANCH, lines: ['primary: #000000'], review: READY, pullRequest: null });
			expect(handoff()?.querySelector('.branch-line')?.textContent).toBe(`${BRANCH} · 2 commits`);
			const files = [...(handoff()?.querySelectorAll('[data-handoff-files] li') ?? [])];
			expect(files.map((f) => f.getAttribute('data-out'))).toEqual([null, 'a story']);
			expect(files[1]?.textContent).toContain('A story, which the rules keep out');
			await press(button('Propose'));
			expect(calls('proposeHandoff')).toEqual([]);
			expect(handoff()?.textContent).toContain('Its pull request says so.');
			await press(button('Cancel'));
			await press(button('Propose'));
			await press(button('Propose anyway'));
			expect(calls('proposeHandoff').at(-1)?.args).toEqual([null, TIP, true]);
			const url = 'https://github.com/flocksafety/flock-react-component-lib/pull/7';
			await answer('proposeHandoff', { branch: BRANCH, lines: [], review: READY, pullRequest: { number: 7, url } });
			expect([...document.querySelectorAll('a')].find((a) => a.textContent === 'Draft pull request #7')?.getAttribute('href')).toBe(url);
			expect(button('Propose')).toBeUndefined();
			// Start over forgets the hand-over, and the change can be handed over or saved again.
			await press(button('Start over'));
			expect(calls('forgetHandoff').at(-1)?.args).toEqual([null]);
			await answer('forgetHandoff', null);
			expect(handoff()).toBeNull();
		});

		it('proposes an unflagged branch in one press', async () => {
			await designOpen();
			await answer('valueBranchFiles', []);
			await answer('handoffFiles', ['']);
			await press(count());
			const clean = { ...READY, files: [READY.files[0]] };
			await answerFor('handoffBranch', null, { branch: BRANCH, lines: [], review: clean, pullRequest: null });
			await press(button('Propose'));
			expect(calls('proposeHandoff').at(-1)?.args).toEqual([null, TIP, false]);
		});

		it('is not offered while the group has a branch DSNR saved', async () => {
			await show();
			await say({ type: 'context', context: OPEN });
			await answer('listProjects', SAMPLE_PROJECTS);
			await press(options()[1]!);
			await answer('designSystems', { systems: [{ id: SYSTEM, name: 'FUI' }], current: SYSTEM });
			await answer('designSystemCatalog', SAMPLE_CATALOG);
			await answer('tokenBranch', { branch: 'dsnr/tokens-1012-abc123', saved: [], saves: 1, pullRequest: null });
			await say({ type: 'token-edits', edits: EDITS });
			await press(count());
			await answerFor('handoffBranch', null, null);
			expect(button('Save')).toBeDefined();
			expect(button('Process changes')).toBeUndefined();
		});

		it('previews a ready branch in every page, says so at the top, holds Save back while it is shown, and shows develop again', async () => {
			await designOpen();
			await say({ type: 'token-edits', edits: EDITS });
			await press(count());
			await answerFor('handoffBranch', null, { branch: BRANCH, lines: [], review: { ...READY, files: [READY.files[0]] }, pullRequest: null });
			await press(button('Preview this branch'));
			expect(calls('showHandoff').at(-1)?.args).toEqual([null]);
			await answer('showHandoff', null);
			// Every page is told, and reads the library again: here, the branch's tip.
			const reads = calls('designSystemCatalog').length;
			await say({ type: 'event', name: 'onLibraryShown', payload: BRANCH });
			expect(calls('designSystemCatalog').length).toBe(reads + 1);
			expect(calls('designSystemCatalog').at(-1)?.args).toEqual([false]);
			await answer('designSystemCatalog', { ...SAMPLE_CATALOG, commit: 'f00d42', showing: BRANCH });
			const note = document.querySelector('[data-showing]') as HTMLElement;
			expect(note.textContent).toContain(`Showing ${BRANCH}, Claude Code’s branch, not develop.`);
			expect(button('Stop previewing')).toBeDefined();
			// Nothing is proposed while it is shown.
			expect(button('Propose')).toBeUndefined();
			await press(button('Show develop'));
			expect(calls('showLibraryBranch')).toHaveLength(1);
			await press(button('Stop previewing'));
			expect(calls('showLibraryBranch')).toHaveLength(2);
		});

		it('offers neither Save nor Process changes while another branch is shown', async () => {
			await show();
			await say({ type: 'context', context: OPEN });
			await answer('listProjects', SAMPLE_PROJECTS);
			await press(options()[1]!);
			await answer('designSystems', { systems: [{ id: SYSTEM, name: 'FUI' }], current: SYSTEM });
			await answer('designSystemCatalog', { ...SAMPLE_CATALOG, showing: BRANCH });
			await answer('tokenBranch', null);
			await say({ type: 'token-edits', edits: EDITS });
			await press(count());
			await answerFor('handoffBranch', null, null);
			expect(button('Save to a branch')?.disabled).toBe(true);
			expect(button('Process changes')?.disabled).toBe(true);
		});

		it('lists a component handed over with nothing tried, by its own hand-over', async () => {
			await designOpen();
			await answer('valueBranchFiles', []);
			await answer('handoffFiles', ['', BUTTON]);
			await press(count());
			await answer('valueBranch', null);
			await answerFor('handoffBranch', BUTTON, {
				branch: BRANCH,
				lines: ['FSButton · Height: 28px → 32px'],
				review: { state: 'empty' },
				pullRequest: null,
			});
			expect(group()?.querySelector('[data-handoff] .branch-line')?.textContent).toBe(BRANCH);
			expect(group()?.textContent).toContain('nothing is committed on it yet');
		});
	});
});

describe('trying a change to the tokens, saving it to a branch, and proposing it (6.2)', () => {
	const ID = 'flocksafety/flock-react-component-lib';
	const tokensOpen = async () => {
		await show();
		await say({ type: 'context', context: OPEN });
		await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
		await answer('designSystems', { systems: [{ id: ID, name: 'FUI' }], current: ID });
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		await answer('tokenBranch', null);
		await press([...document.querySelectorAll<HTMLElement>('[aria-label="Part"] [role="radio"]')][1]!);
	};
	const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
	/** The Changes dialog, from the count beside the not-read one: what is changed is there, not above the list. */
	const openChanges = async () => {
		if (!document.querySelector('[role="dialog"][aria-label="Changes"]'))
			await press(document.querySelector('.ds-actions [aria-label$="being tried"]') as HTMLElement);
	};
	const edited = () =>
		panelSaid()
			.filter((m) => m.type === 'token-edits')
			.at(-1)?.edits;

	it('drops, after a sync, what was tried on a token the library no longer has, as the app does', async () => {
		await tokensOpen();
		const gone = { path: 'tone.pineGreen.50', value: '#000000' };
		await say({ type: 'token-edits', edits: [gone, { path: 'spacing', value: '12px' }] });
		await press(document.querySelector('[aria-label="Design system actions"]') as HTMLElement);
		await press(document.querySelector('.ds-actions [role="menuitem"]') as HTMLElement);
		const ready = SAMPLE_CATALOG as Extract<Catalog, { state: 'ready' }>;
		const without = { ...ready, tokens: { ...ready.tokens, tokens: ready.tokens.tokens.filter((t) => t.path !== gone.path) } };
		await answer('designSystemCatalog', without);
		expect(edited()).toEqual([{ path: 'spacing', value: '12px' }]);
	});

	it('opens a role’s control: what it points at, and its tone’s steps to point it at another, which keeps the link', async () => {
		await tokensOpen();
		await press(document.querySelector('[aria-label="Change Light primary main"]') as HTMLElement);
		expect(dialog().getAttribute('aria-label')).toBe('Light · primary.main');
		expect(dialog().querySelector('[data-reference]')?.textContent).toBe('primary.main → pineGreen 50');
		const steps = [...dialog().querySelectorAll<HTMLElement>('[aria-label="Steps of pineGreen"] [role="radio"]')];
		expect(steps.map((s) => [s.textContent, s.getAttribute('aria-checked')])).toEqual([
			['50', 'true'],
			['60', 'false'],
		]);
		// A step's hover is its name, as every colour's is: not its hex.
		expect(steps.map((step) => step.title)).toEqual(['pineGreen 50', 'pineGreen 60']);
		expect(dialog().querySelector('[data-editor-contrast]')?.textContent).toMatch(/^Contrast with contrastText: \d/);
		await press(steps[1]!);
		expect(edited()).toEqual([{ path: 'palette.light.primary.main', ref: 'tone.pineGreen.60' }]);
	});

	it('gives a color of its own a picker and its hex, applied when entered; a length a slider, applied when let go', async () => {
		await tokensOpen();
		await press(document.querySelector('[aria-label="Color view"] [aria-label="Palette"]') as HTMLElement);
		await press(document.querySelector('[aria-label="Change Tones pineGreen 60"]') as HTMLElement);
		const hex = dialog().querySelector('input[aria-label="Hex"]') as HTMLInputElement;
		// A token's control opens with the focus on the dialog, as a value's popover does: no field is drawn as chosen.
		expect(document.activeElement).toBe(dialog());
		expect(document.activeElement).not.toBe(hex);
		await type(hex, '#00aa00');
		await act(async () => void hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
		expect(edited()).toEqual([{ path: 'tone.pineGreen.60', value: '#00AA00' }]);
		// Closed by its X: there is no Done to press, so a change is a change when it is made.
		expect([...dialog().querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Done');
		await press(dialog().querySelector('[aria-label="Close"]') as HTMLElement);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		await press(document.querySelector('[aria-label="Change Spacing"]') as HTMLElement);
		const slider = dialog().querySelector('input[type="range"]') as HTMLInputElement;
		expect(document.activeElement).toBe(dialog());
		expect(document.activeElement).not.toBe(slider);
		await type(slider, '12');
		await act(async () => void slider.dispatchEvent(new Event('pointerup', { bubbles: true })));
		// A change is every token changed: this one joins the first.
		expect(edited()).toEqual([
			{ path: 'tone.pineGreen.60', value: '#00AA00' },
			{ path: 'spacing', value: '12px' },
		]);
	});

	it('changes only what can be changed here: a font is shown, with nothing to press', async () => {
		await tokensOpen();
		const font = document.querySelector('[data-token="typography.fontFamily"]') as HTMLElement;
		expect(font.querySelector('button.token-button')).toBeNull();
		expect(font.querySelector('[data-part="value"]')?.textContent).toBe('Inter');
	});

	it('moves nothing when a token is changed: the toggle and the list under it stay where they were', async () => {
		await tokensOpen();
		const part = document.querySelector('.ds-part') as HTMLElement;
		const before = part.previousElementSibling;
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.60', value: '#000000' }] });
		expect(part.previousElementSibling).toBe(before);
		expect(document.querySelector('.ds-part')).toBe(part);
		expect(document.querySelector('[data-changed-tokens]')).toBeNull();
	});

	it('lists what has been changed, from what it was to what it is, with a reset for each and for all', async () => {
		await tokensOpen();
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.60', value: '#000000' }] });
		// Nothing opens above the list: the count says it, in the brand.
		expect(document.querySelector('[data-changed-tokens]')).toBeNull();
		expect(document.querySelector('.ds-actions [aria-label="1 change being tried"]')?.classList.contains('badge-brand')).toBe(true);
		await openChanges();
		const changed = document.querySelector('[data-changed-tokens]') as HTMLElement;
		expect(changed.querySelector('.changed-title')?.textContent).toBe('Tokens 1');
		expect(changed.querySelector('[data-change="tone.pineGreen.60"] .change-values')?.textContent).toBe('#15584A → #000000');
		await press(changed.querySelector('[aria-label="Reset Tones pineGreen 60"]') as HTMLElement);
		expect(edited()).toEqual([]);
		await say({ type: 'token-edits', edits: [{ path: 'tone.pineGreen.60', value: '#000000' }] });
		await press(button('Reset all'));
		expect(edited()).toEqual([]);
	});

	it('saves the change to a branch, proposes it as a draft pull request, and starts over, as the core does them', async () => {
		await tokensOpen();
		const edits = [{ path: 'tone.pineGreen.60', value: '#000000' }];
		await say({ type: 'token-edits', edits });
		await openChanges();
		await press(button('Save to a branch'));
		expect(sent.filter((m) => m.name === 'saveTokens').at(-1)?.args).toEqual([edits]);
		await answer('saveTokens', { branch: 'dsnr/tokens-1012-abc123', saved: edits, saves: 1, pullRequest: null });
		const actions = document.querySelector('[data-branch-actions]') as HTMLElement;
		expect(actions.querySelector('.branch-line')?.textContent).toBe('dsnr/tokens-1012-abc123 · 1 save');
		expect(button('Save to a branch')).toBeUndefined();
		await press(button('Propose'));
		expect(sent.some((m) => m.name === 'proposeTokens')).toBe(true);
		await answer('proposeTokens', {
			branch: 'dsnr/tokens-1012-abc123',
			saved: edits,
			saves: 1,
			pullRequest: { number: 12, url: 'https://github.com/flocksafety/flock-react-component-lib/pull/12', chromatic: null },
		});
		const link = [...document.querySelectorAll('a')].find((a) => a.textContent === 'Draft pull request #12');
		expect(link?.getAttribute('href')).toBe('https://github.com/flocksafety/flock-react-component-lib/pull/12');
		await press(button('Start over'));
		await answer('forgetTokenBranch', null);
		expect(edited()).toEqual([]);
		expect(document.querySelector('[data-changed-tokens]')?.textContent).toContain('Every token is as the design system has it.');
	});

	it('says why a save failed, and keeps the change', async () => {
		await tokensOpen();
		await say({ type: 'token-edits', edits: [{ path: 'spacing', value: '12px' }] });
		await openChanges();
		await press(button('Save to a branch'));
		const call = sent.filter((m) => m.name === 'saveTokens').at(-1);
		await say({ type: 'answer', id: call?.id, result: { ok: false, error: 'git is not signed in to GitHub.' } });
		expect(document.querySelector('[data-branch-actions] [role="alert"]')?.textContent).toBe('git is not signed in to GitHub.');
		expect(document.querySelector('[data-changed-tokens] .changed-title')?.textContent).toBe('Tokens 1');
	});

	it('puts back a change saved before DSNR was last closed, when none is being tried', async () => {
		await show();
		await say({ type: 'context', context: OPEN });
		await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
		await answer('designSystems', { systems: [{ id: ID, name: 'FUI' }], current: ID });
		await answer('designSystemCatalog', SAMPLE_CATALOG);
		const saved = [{ path: 'radius', value: '8px' }];
		await answer('tokenBranch', { branch: 'dsnr/tokens-1012-abc123', saved, saves: 2, pullRequest: null });
		expect(edited()).toEqual(saved);
	});
});
