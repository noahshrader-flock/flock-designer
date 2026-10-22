import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Panel } from '../extension/webview/Panel';
import type { Context } from '../src/core/services/projects/findContext';
import type { Catalog, ComponentPictures, ProjectWork } from '../src/shared/contract';
import { SAMPLE_CATALOG, SAMPLE_PROJECTS } from './extensionSamples';
import { projectWork } from './fixtures';
import { answer, answerOf, calls, callsOf, kept, lastAsk, mountPage, panelSaid, say, sent, share, shareCatalog, unmount } from './webviewHarness';
import { allByRole, button, dialog, fieldNamed, key, menuItem, press, spinning, type } from './ui';
import { READ_EVERY_MS } from '../extension/webview/hooks/useEditedInCode';
import { ASK_EVERY_MS } from '../extension/webview/hooks/ask';

const OPEN: Context = {
	product: '/work/flock-coke',
	designSystem: { root: '/work/flock-react-component-lib', how: 'beside' },
	designRepository: '/work/flock-designer/projects',
	productRepository: 'flocksafety/flock-coke',
	source: { state: 'usable', root: '/work/flock-react-component-lib', how: 'beside' },
	missing: [],
};
const show = () => mountPage(createElement(Panel));
const showOpen = async (context: Context = OPEN, projects = SAMPLE_PROJECTS) => {
	await show();
	await share('placed', { context, unreadable: null, setup: null });
	await share('agent', { name: 'Claude Code' });
	await answer('listProjects', projects);
};

const toggle = () => document.querySelector('[role="radiogroup"]') as HTMLElement;
const options = () => [...toggle().querySelectorAll<HTMLElement>('[role="radio"]')];
const chosen = () => options().find((o) => o.getAttribute('aria-checked') === 'true')?.textContent;
const body = () => document.querySelector('[data-tab-body]') as HTMLElement;
const cards = () => [...body().querySelectorAll<HTMLElement>('.card')];
const viewMenu = () => body().querySelector('button[aria-label="View options"]') as HTMLButtonElement | null;
const viewChoices = async () => {
	if (viewMenu()?.getAttribute('aria-expanded') !== 'true') await press(viewMenu()!);
	return [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
};
const viewChoice = async (label: string) => press((await viewChoices()).find((o) => o.textContent === label)!);
const checked = async (label: string) => (await viewChoices()).find((o) => o.textContent === label)?.getAttribute('aria-checked');
const scopeChoices = async () => (await viewChoices()).filter((o) => o.closest('[role="group"]')?.getAttribute('aria-label') === 'Projects');

describe('the toggle at the top', () => {
	it('is first in the panel, Projects and Design System, with Projects chosen', async () => {
		await show();
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
		await key('ArrowRight', { on: options()[0]! });
		expect(chosen()).toBe('Design System');
		expect(document.activeElement).toBe(options()[1]);
		await key('ArrowRight', { on: options()[1]! });
		expect(chosen()).toBe('Projects');
		await key('End', { on: options()[0]! });
		expect(chosen()).toBe('Design System');
		await key('Home', { on: options()[1]! });
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
		expect(body().textContent?.trim()).toBe('Looking at what is open…');
		expect(spinning(body())).toBe(true);
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
			'Alert history',
			'Admin usage',
			'Role comparison',
			'Zone coverage',
		]);
		expect(await scopeChoices()).toEqual([]);
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No product is open');
		expect(body().textContent).toContain('Open one to make a prototype.');
	});

	it('says there are no projects when no product is open and nobody has made one: no product is needed to see everyone’s', async () => {
		await showOpen(NONE, []);
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No projects yet');
		expect(body().textContent).not.toContain('No product is open');
	});

	it('says why Build in the codebase cannot be done with no product open, rather than opening nothing', async () => {
		await showOpen(NONE);
		await say({ type: 'open-dialog', dialog: { kind: 'build', projectId: 'alert-history' } });
		expect(dialog()?.textContent).toContain('Open the product');
		expect(sent.some((m) => m.name === 'buildInCodebasePlan')).toBe(false);
	});

	it('offers to clone a repository beside everyone’s projects too', async () => {
		await showOpen(NONE);
		await press(button('Clone a repository'));
		expect(lastAsk()).toEqual(['getStarted', []]);
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
		expect(body().querySelectorAll('[role="listitem"]')).toHaveLength(4);
		expect(badge()).toBe('2 open comments');
		await answer(
			'listProjects',
			SAMPLE_PROJECTS.map((p) =>
				p.id === 'alert-history' ? { ...p, work: p.work.map((i, at) => ({ ...i, openComments: i.openComments + (at === 0 ? 1 : 0) })) } : p,
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
	const inDialog = (name: string) => button(name, dialog()!);
	const closeX = () => button('Close', dialog()!);
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
		expect(allByRole('button', 'Close', dialog()!)).toEqual([closeX()]);
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
		expect(allByRole('button', 'Sync now')).toEqual([]);
	});
});

describe('dialogs and menus, in the panel', () => {
	const field = (name: string) => fieldNamed<HTMLInputElement>(name, dialog()!);
	const choose = async (select: HTMLElement, label: string) => {
		const option = [...(select as HTMLSelectElement).options].find((o) => o.textContent === label);
		if (!option) throw new Error(`no option ${label}`);
		await type(select, option.value);
	};
	const selected = (select: HTMLElement) => (select as HTMLSelectElement).selectedOptions[0]?.textContent;
	const submit = () => dialog()!.querySelector('button[type="submit"]') as HTMLButtonElement;
	const closeX = () => button('Close', dialog()!);
	const menuFor = (n: number) => [...body().querySelectorAll<HTMLElement>('[aria-label="Project actions"]')][n] as HTMLElement;
	const items = () => allByRole('menuitem');
	const item = (label: string) => menuItem(items(), label);

	describe('a project’s menu', () => {
		it('is on each project, a popover of what it offers, closed by Escape or a press elsewhere', async () => {
			await showOpen();
			await press(menuFor(0));
			expect(items().map((i) => i.textContent)).toEqual([
				'Copy link',
				'Open published page',
				'Open locally',
				'Build',
				'Rename…',
				'Assign folder…',
				'Delete…',
			]);
			expect(menuFor(0).getAttribute('aria-expanded')).toBe('true');
			await key('Escape');
			expect(items()).toHaveLength(0);
			await press(menuFor(0));
			await act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
			expect(items()).toHaveLength(0);
		});

		it('copies the published page’s link from the menu: asked of the extension, which says if there is none yet', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Copy link'));
			expect(lastAsk()).toEqual(['copyReviewLink', ['alert-history']]);
			expect(items()).toHaveLength(0);
		});

		it('opens the published page from it: asked of the extension, which says if there is none yet and offers to publish it', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Open published page'));
			expect(lastAsk()).toEqual(['openReviewPublished', ['alert-history']]);
			expect(items()).toHaveLength(0);
		});

		it('groups what it offers: the links, where it opens with the next stage, the code on GitHub, the folder', async () => {
			await showOpen();
			await press(menuFor(0));
			const groups = [...document.querySelectorAll('[role="menu"] > *')].map((el) => (el.matches('[role="separator"], hr') ? '|' : el.textContent));
			expect(groups.join(',')).toBe('Copy link,|,Open published page,Open locally,|,Build,|,Rename…,Assign folder…,Delete…');
		});

		it('opens a project’s review in the browser from it: the same review, asked of the extension to open outside VS Code', async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Open locally'));
			expect(lastAsk()).toEqual(['openReviewInBrowser', ['alert-history']]);
			expect(items()).toHaveLength(0);
		});

		it('gives the focus back to its button when it closes, so a keyboard goes on from where it was', async () => {
			await showOpen();
			await press(menuFor(0));
			expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
			await key('Escape');
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
			expect(items().map((i) => i.textContent)).toEqual([
				'Copy link',
				'Open published page',
				'Open locally',
				'Build',
				'Rename…',
				'Assign folder…',
				'Delete…',
			]);
		});
	});

	describe('Rename', () => {
		const open = async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Rename…'));
		};

		it('is a dialog with the name it has, which saves only a different name', async () => {
			await open();
			expect(dialog()?.getAttribute('aria-label')).toBe('Rename');
			expect(submit().textContent).toBe('Save');
			expect((field('Name') as HTMLInputElement).value).toBe('Alert history');
			expect(submit().disabled).toBe(true);
			await type(field('Name'), '   ');
			expect(submit().disabled).toBe(true);
		});

		it('renames it through the core, by its id, closing, and the projects are read again', async () => {
			await open();
			const reads = sent.filter((m) => m.name === 'listProjects').length;
			await type(field('Name'), '  Alerts   over time ');
			await press(submit());
			expect(sent.filter((m) => m.name === 'renameProject').at(-1)?.args).toEqual(['alert-history', 'Alerts over time']);
			await answer('renameProject', null);
			expect(dialog()).toBeNull();
			expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
		});

		it('says why it could not, in the dialog, which stays open', async () => {
			await open();
			await type(field('Name'), 'Alerts');
			await press(submit());
			const call = sent.filter((m) => m.name === 'renameProject').at(-1);
			await say({ type: 'answer', id: call!.id, result: { ok: false, error: 'alert-history has no brief, which is where its name is kept.' } });
			expect(dialog()?.textContent).toContain('alert-history has no brief, which is where its name is kept.');
		});
	});

	describe('Delete', () => {
		const open = async (projects = SAMPLE_PROJECTS) => {
			await showOpen(OPEN, projects);
			await press(menuFor(0));
			await press(item('Delete…'));
		};

		it('is last in the menu, under Assign folder, and says what goes, for everyone, and what stays', async () => {
			await open();
			expect(dialog()?.getAttribute('aria-label')).toBe('Delete project');
			expect(dialog()?.textContent).toContain(
				'This deletes Alert history and its 3 versions for everyone, with every page, picture and record of it, and takes it off the published site. 2 open comments are on it.',
			);
			expect(dialog()?.textContent).toContain(
				'Its review issues on GitHub are closed, with their comments kept there. What it was stays in the design repository’s history.',
			);
			expect(submit().textContent).toBe('Delete project');
			expect(submit().className).toContain('button-danger');
		});

		it('deletes only once its name is typed as it is shown: not another case, nor a part of it', async () => {
			await open();
			expect(field('Type Alert history to delete it').value).toBe('');
			expect(submit().disabled).toBe(true);
			for (const wrong of ['alert history', 'Alert', 'Alert  history', 'alert-history']) {
				await type(field('Type Alert history to delete it'), wrong);
				expect(submit().disabled).toBe(true);
			}
			await type(field('Type Alert history to delete it'), ' Alert history ');
			expect(submit().disabled).toBe(false);
		});

		const alertHistory = () =>
			cards()
				.find((c) => c.querySelector('[data-part="name"]')?.textContent === 'Alert history')!
				.closest('li') as HTMLElement;

		it('deletes it through the core, by its id with the name typed, closing at once, its card saying Deleting… until it is gone', async () => {
			await open();
			const reads = sent.filter((m) => m.name === 'listProjects').length;
			await type(field('Type Alert history to delete it'), 'Alert history');
			await press(submit());
			expect(sent.filter((m) => m.name === 'deleteProject').at(-1)?.args).toEqual(['alert-history', 'Alert history']);
			expect(dialog()).toBeNull();
			// Its name stays; what it is doing is said under it, and it shimmers, with nothing to press.
			expect(alertHistory().querySelector('[data-part="meta"]')?.textContent?.trim()).toBe('Deleting…');
			expect(spinning(alertHistory().querySelector('[data-part="meta"]'))).toBe(true);
			expect(alertHistory().querySelector('[data-part="picture"]')?.getAttribute('data-loading')).toBe('true');
			expect(alertHistory().querySelector('[aria-label="Project actions"]')).toBeNull();
			await answer('deleteProject', null);
			expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
			// Still in the list read until it is gone, it still says so.
			expect(alertHistory().querySelector('[data-part="meta"]')?.textContent?.trim()).toBe('Deleting…');
			expect(spinning(alertHistory().querySelector('[data-part="meta"]'))).toBe(true);
		});

		it('says why it could not in its dialog, opened again, and the card is as it was', async () => {
			await open();
			await type(field('Type Alert history to delete it'), 'Alert history');
			await press(submit());
			const call = sent.filter((m) => m.name === 'deleteProject').at(-1);
			await say({ type: 'answer', id: call!.id, result: { ok: false, error: 'Saving needs write access to flocksafety/flock-designer.' } });
			expect(dialog()?.textContent).toContain('Saving needs write access to flocksafety/flock-designer.');
			expect(alertHistory().querySelector('[data-part="meta"]')?.textContent?.trim()).not.toBe('Deleting…');
			expect(spinning(alertHistory().querySelector('[data-part="meta"]'))).toBe(false);
			// Said for that try only: opened again from the menu, it starts afresh.
			await press(closeX());
			await press(menuFor(0));
			await press(item('Delete…'));
			expect(dialog()?.textContent).not.toContain('Saving needs write access');
		});

		it('names no versions for a project with only codebase work', async () => {
			await open([
				{ ...SAMPLE_PROJECTS[0]!, work: [projectWork({ name: 'codebase', branch: 'feature/alert-history' })] },
				...SAMPLE_PROJECTS.slice(1),
			]);
			expect(dialog()?.textContent).toContain('This deletes Alert history for everyone, with every page');
			expect(dialog()?.textContent).toContain(
				'Its review issues on GitHub are closed, with their comments kept there, and its codebase branch feature/alert-history stays.',
			);
		});

		it('says its codebase branch and pull request stay, when it has them', async () => {
			const inCode = SAMPLE_PROJECTS.map((p, at) =>
				at === 0
					? {
							...p,
							work: [
								...p.work,
								projectWork({ name: 'codebase', branch: 'feature/alert-history', pullRequest: 'https://github.com/flocksafety/flock-coke/pull/9' }),
							],
						}
					: p,
			);
			await open(inCode);
			expect(dialog()?.textContent).toContain(
				'Its review issues on GitHub are closed, with their comments kept there, and its codebase branch feature/alert-history and pull request stay.',
			);
		});
	});

	describe('Assign folder', () => {
		const open = async () => {
			await showOpen();
			await press(menuFor(0));
			await press(item('Assign folder…'));
		};

		it('has the folder it is in chosen however it was spelled, as the list spells it', async () => {
			await showOpen(
				OPEN,
				SAMPLE_PROJECTS.map((p) => (p.id === 'role-comparison' ? { ...p, folder: 'maps' } : p)),
			);
			await say({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'zone-coverage' } });
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
	const codebase = (branch: string, more: Partial<ProjectWork> = {}): ProjectWork =>
		projectWork({ name: 'codebase', branch, createdAt: '2026-10-12T10:00:00Z', repository: 'flocksafety/flock-coke', ...more });
	const WITH_CODE = [
		...SAMPLE_PROJECTS.map((p) => (p.id === 'zone-coverage' ? { ...p, work: [...p.work, codebase('feature/zone-coverage')] } : p)),
		{ id: 'roles-in-code', title: 'Roles in code', folder: null, records: [], people: [], work: [codebase('feature/roles-in-code')] },
	] as typeof SAMPLE_PROJECTS;
	const named = (title: string) =>
		[...body().querySelectorAll<HTMLElement>('[role="listitem"]')].find((r) => r.querySelector('[data-part="name"]')?.textContent === title)!;
	const menuOf = (title: string) => named(title).querySelector<HTMLElement>('[aria-label="Project actions"]')!;
	const items = () => allByRole('menuitem').map((i) => i.textContent);
	const item = (label: string) => menuItem(allByRole('menuitem'), label);
	const elsewhere = async () => act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
	const inDialog = (name: string) => button(name, dialog()!);
	const closeX = () => button('Close', dialog()!);

	it('offers Build, not Hand off, for codebase work whose branch has no commit of its own here: started and never built', async () => {
		const notBegun = SAMPLE_PROJECTS.map((p) =>
			p.id === 'zone-coverage' ? { ...p, work: [...p.work, codebase('feature/zone-coverage', { begun: false })] } : p,
		) as typeof SAMPLE_PROJECTS;
		await showOpen(OPEN, notBegun);
		await press(menuOf('Zone coverage'));
		expect(items()).toEqual([
			'Copy link',
			'Open published page',
			'Open locally',
			'Run locally',
			'Update this branch…',
			'Build',
			'View on GitHub',
			'Rename…',
			'Assign folder…',
			'Delete…',
		]);
		await press(item('Build'));
		expect(dialog()).not.toBeNull();
	});

	// Begun, or not known here (another machine's), it is the handoff that is next.
	it.each([true, null])('offers Hand off, not Build, for codebase work whose own commits here are %s', async (begun) => {
		const known = SAMPLE_PROJECTS.map((p) =>
			p.id === 'zone-coverage' ? { ...p, work: [...p.work, codebase('feature/zone-coverage', { begun })] } : p,
		) as typeof SAMPLE_PROJECTS;
		await showOpen(OPEN, known);
		await press(menuOf('Zone coverage'));
		expect(items()).toContain('Hand off');
		expect(items()).not.toContain('Build');
	});

	it('offers what a project has, in groups: its link to copy, where it opens, what runs it, with the next stage (build, or handoff, never both), the code on GitHub, and its folder', async () => {
		await showOpen(OPEN, WITH_CODE);
		const dividers = () => document.querySelectorAll('[role="separator"]').length;
		await press(menuOf('Zone coverage'));
		expect(items()).toEqual([
			'Copy link',
			'Open published page',
			'Open locally',
			'Run locally',
			'Update this branch…',
			'Hand off',
			'View on GitHub',
			'Rename…',
			'Assign folder…',
			'Delete…',
		]);
		expect(dividers()).toBe(4);
		await elsewhere();
		await press(menuOf('Alert history'));
		expect(items()).toEqual(['Copy link', 'Open published page', 'Open locally', 'Build', 'Rename…', 'Assign folder…', 'Delete…']);
		expect(dividers()).toBe(3);
		await elsewhere();
		await press(menuOf('Roles in code'));
		expect(items()).toEqual(['Run locally', 'Update this branch…', 'Hand off', 'View on GitHub', 'Rename…', 'Assign folder…', 'Delete…']);
		expect(dividers()).toBe(2);
		// No item opens it in VS Code: pressing the project does, so nothing is offered twice.
		expect(items().some((label) => /open for review|preview|comments|share/i.test(label))).toBe(false);
	});

	it('asks the extension to view the work locally, naming the project only, and offers it only for codebase work', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('Run locally'));
		expect(lastAsk()).toEqual(['codebase', ['run-locally', 'zone-coverage']]);
		await press(menuOf('Alert history'));
		expect(items()).not.toContain('Run locally');
	});

	it('asks the extension for the work on GitHub, naming the project only', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('View on GitHub'));
		expect(lastAsk()).toEqual(['codebase', ['open-code', 'zone-coverage']]);
	});

	it('opens a project that is only in the code on GitHub when it is pressed, as the app does', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(named('Roles in code').querySelector('button') as HTMLElement);
		expect(lastAsk()).toEqual(['codebase', ['open-code', 'roles-in-code']]);
	});

	it('hands off after saying what happens, and only once Start handoff is pressed', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		expect(dialog()?.getAttribute('aria-label')).toBe('Hand off to engineering');
		expect(dialog()!.textContent).toContain('HANDOFF.md');
		expect(dialog()!.textContent).toContain('feature/zone-coverage');
		expect(dialog()!.textContent).toContain('Nothing is pushed');
		expect(dialog()!.textContent).toContain('The task opens in Claude Code in this window');
		expect(panelSaid().some((m) => m.type === 'codebase')).toBe(false);
		await press(inDialog('Start handoff'));
		expect(lastAsk()).toEqual(['codebase', ['hand-off', 'zone-coverage']]);
		expect(dialog()).toBeNull();
	});

	describe('codebase work behind the product’s main branch', () => {
		const against = (more: Record<string, unknown> = {}) => ({
			branch: 'feature/zone-coverage',
			base: 'develop',
			latest: 'b'.repeat(40),
			behind: 0,
			conflicts: [],
			...more,
		});

		it('says nothing of it in Hand off while the work is up to date', async () => {
			await showOpen(OPEN, WITH_CODE);
			await press(menuOf('Zone coverage'));
			await press(item('Hand off'));
			expect(calls('codebaseAgainstBase').at(-1)?.args).toEqual(['/work/flock-coke', 'zone-coverage']);
			await answer('codebaseAgainstBase', against());
			expect(dialog()!.textContent).not.toMatch(/behind|up to date|Update this branch/);
		});

		it('says it in Hand off when the work has fallen behind, with what merging would conflict in, and Update this branch hands it over', async () => {
			await showOpen(OPEN, WITH_CODE);
			await press(menuOf('Zone coverage'));
			await press(item('Hand off'));
			await answer('codebaseAgainstBase', against({ behind: 5, conflicts: ['src/nav.tsx', 'src/routes.ts'] }));
			expect(dialog()!.textContent).toContain(
				'feature/zone-coverage is 5 commits behind develop. Merging develop into it conflicts in src/nav.tsx, src/routes.ts.',
			);
			await press(inDialog('Update this branch'));
			expect(lastAsk()).toEqual(['codebase', ['update', 'zone-coverage']]);
			expect(dialog()).toBeNull();
		});

		it('is in the project’s menu for codebase work, saying how it stands either way', async () => {
			await showOpen(OPEN, WITH_CODE);
			await press(menuOf('Alert history'));
			expect(items()).not.toContain('Update this branch…');
			await press(menuOf('Zone coverage'));
			await press(item('Update this branch…'));
			expect(dialog()?.getAttribute('aria-label')).toBe('Update this branch');
			expect(dialog()!.textContent).toContain('Reading how it stands');
			await answer('codebaseAgainstBase', against());
			expect(dialog()!.textContent).toContain('feature/zone-coverage is up to date with develop.');
			expect(allByRole('button', 'Update this branch')).toEqual([]);
		});

		it('says when how it stands cannot be told here, in the menu’s dialog', async () => {
			await showOpen(OPEN, WITH_CODE);
			await press(menuOf('Zone coverage'));
			await press(item('Update this branch…'));
			await answer('codebaseAgainstBase', null);
			expect(dialog()!.textContent).toContain('cannot be told here');
		});
	});

	it('names the agent a handoff goes to, with Change, which asks which; and says it is chosen at the hand-over while it is not known', async () => {
		await showOpen(OPEN, WITH_CODE);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		expect(dialog()!.textContent).toContain('With Claude Code. Change');
		await press(inDialog('Change'));
		expect(lastAsk()).toEqual(['chooseAgent', []]);
		await share('agent', { name: null });
		expect(dialog()!.textContent).toContain('You choose the agent when it is handed over. Choose now');
		expect(dialog()!.textContent).toContain('The task opens in the agent in this window');
	});

	it('offers the draft pull request when a handoff found the work ready and nothing has changed since, with Run again', async () => {
		const READY = 'a1b2c3d';
		const ready = (more: Record<string, unknown>) =>
			WITH_CODE.map((p) =>
				p.id === 'zone-coverage' ? { ...p, work: p.work.map((work) => (work.name === 'codebase' ? { ...work, readyAt: READY, ...more } : work)) } : p,
			);
		await showOpen(OPEN, ready({}) as typeof SAMPLE_PROJECTS);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		expect(dialog()!.textContent).toContain('ready for engineering');
		expect(inDialog('Open a draft pull request').className).toContain('button-primary');
		expect(inDialog('Run again').className).toContain('button-secondary');
		await press(inDialog('Open a draft pull request'));
		expect(lastAsk()).toEqual(['codebase', ['share', 'zone-coverage']]);
		expect(dialog()).toBeNull();
	});

	it('offers the way to its pull request when the handoff found it ready and one is open, not a second one', async () => {
		const ready = WITH_CODE.map((p) =>
			p.id === 'zone-coverage'
				? {
						...p,
						work: p.work.map((work) =>
							work.name === 'codebase' ? { ...work, readyAt: 'a1b2c3d', pullRequest: 'https://github.com/flocksafety/flock-coke/pull/9' } : work,
						),
					}
				: p,
		);
		await showOpen(OPEN, ready as typeof SAMPLE_PROJECTS);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		expect(allByRole('button', 'Open a draft pull request', dialog()!)).toEqual([]);
		await press(inDialog('View on GitHub'));
		expect(lastAsk()).toEqual(['codebase', ['open-code', 'zone-coverage']]);
	});

	it('runs a handoff again from there, as a first one runs', async () => {
		await showOpen(
			OPEN,
			WITH_CODE.map((p) =>
				p.id === 'zone-coverage' ? { ...p, work: p.work.map((work) => (work.name === 'codebase' ? { ...work, readyAt: 'a1b2c3d' } : work)) } : p,
			) as typeof SAMPLE_PROJECTS,
		);
		await press(menuOf('Zone coverage'));
		await press(item('Hand off'));
		await press(inDialog('Run again'));
		expect(lastAsk()).toEqual(['codebase', ['hand-off', 'zone-coverage']]);
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

		it('acts on the newest version as the project is when the dialog opens, not as the list showed it: the list is read again', async () => {
			await open();
			expect(sent.filter((m) => m.name === 'buildInCodebasePlan').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v3']);
			// A Version 4 an agent made in a terminal meanwhile: the list read again has it, and the dialog follows.
			const withV4 = WITH_CODE.map((p) =>
				p.id === 'alert-history' ? { ...p, work: [...p.work, { ...p.work[0]!, name: 'v4', branch: 'prototype/alert-history/v4' }] } : p,
			);
			await answer('listProjects', withV4);
			expect(sent.filter((m) => m.name === 'buildInCodebasePlan').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v4']);
		});

		it('reads what it would do in the product open here, for the project’s newest prototype', async () => {
			await open();
			expect(dialog()?.getAttribute('aria-label')).toBe('Build in the codebase');
			expect(sent.filter((m) => m.name === 'buildInCodebasePlan').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v3']);
			expect(sent.filter((m) => m.name === 'branchesWithSetup').at(-1)?.args).toEqual(['/work/flock-coke']);
			expect(dialog()!.textContent).toContain('Creates feature/alert-history from this branch and moves your checkout to it.');
			expect(dialog()!.textContent).toContain('Before it reports, the implementation reviewer checks the work once');
			expect(dialog()!.textContent).toContain('the full reviews and the gate are Handoff’s');
		});

		it('starts from what the prototype was modeled on, from the branches that have DSNR’s setup, and hands it to Claude Code here', async () => {
			await open();
			expect([...select().options].map((o) => o.textContent)).toEqual(['main', 'develop']);
			expect(select().value).toBe('develop');
			await press(inDialog('Build in Claude Code'));
			expect(sent.filter((m) => m.name === 'buildInCodebase').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v3', 'develop']);
			const reads = sent.filter((m) => m.name === 'listProjects').length;
			await answer('buildInCodebase', { agent: 'Claude Code', opened: 'typed', command: null });
			expect(dialog()!.textContent).toContain('The build, on feature/alert-history, is in Claude Code in this window now');
			expect(sent.filter((m) => m.name === 'listProjects').length).toBe(reads + 1);
			await press(closeX());
			expect(dialog()).toBeNull();
		});

		it('gives the command for a terminal when Claude Code is not in this VS Code', async () => {
			await open();
			await press(inDialog('Build in Claude Code'));
			await answer('buildInCodebase', { agent: 'Claude Code', opened: null, command: "cd /work/flock-coke && claude 'Build it.'" });
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
			expect(sent.filter((m) => m.name === 'buildInCodebase').at(-1)?.args).toEqual(['/work/flock-coke', 'alert-history', 'v3']);
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
		await key('Escape', { on: search() });
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

	describe('a prototype started here and not saved yet', () => {
		const STARTED = {
			id: 'widgets',
			title: 'Widget explorer',
			folder: null,
			records: [],
			people: [],
			localOnly: true,
			work: [projectWork({ name: 'v1', branch: 'prototype/widgets/v1', createdAt: '2026-10-20T10:00:00Z', building: true })],
		};
		const started = () =>
			cards()
				.find((c) => c.querySelector('[data-part="name"]')?.textContent === 'Widget explorer')!
				.closest('li') as HTMLElement;

		it('keeps its name, says Building… under it, shimmers, with only Delete… in its menu, and opens nothing', async () => {
			await showOpen(OPEN, [STARTED, ...SAMPLE_PROJECTS]);
			expect(started().querySelector('[data-part="meta"]')?.textContent?.trim()).toBe('Building…');
			expect(spinning(started().querySelector('[data-part="meta"]'))).toBe(true);
			expect(started().querySelector('[data-part="picture"]')?.getAttribute('data-loading')).toBe('true');
			await press(started().querySelector('[aria-label="Project actions"]') as HTMLElement);
			expect(allByRole('menuitem').map((i) => i.textContent)).toEqual(['Delete…']);
			await key('Escape');
			await press(started().querySelector('[data-part="name"]') as HTMLElement);
			expect(lastAsk()?.[0]).not.toBe('openReview');
		});

		it('is deleted saying nothing of it was shared, once its name is typed', async () => {
			await showOpen(OPEN, [STARTED, ...SAMPLE_PROJECTS]);
			await press(started().querySelector('[aria-label="Project actions"]') as HTMLElement);
			await press(menuItem(allByRole('menuitem'), 'Delete…'));
			expect(dialog()?.textContent).toContain('This deletes Widget explorer. It was started here and not saved yet, so nothing of it was shared.');
			expect(dialog()?.textContent).not.toContain('Its review issues on GitHub');
			await type(fieldNamed<HTMLInputElement>('Type Widget explorer to delete it', dialog()!), 'Widget explorer');
			await press(dialog()!.querySelector('button[type="submit"]') as HTMLButtonElement);
			expect(sent.filter((m) => m.name === 'deleteProject').at(-1)?.args).toEqual(['widgets', 'Widget explorer']);
		});

		it('is not counted, nor opened, beside a version already saved: the project opens at its newest saved one', async () => {
			const more = SAMPLE_PROJECTS.map((p, at) =>
				at === 0 ? { ...p, work: [...p.work, projectWork({ name: 'v4', branch: 'prototype/alert-history/v4', building: true })] } : p,
			);
			await showOpen(OPEN, more);
			const card = cards().find((c) => c.querySelector('[data-part="name"]')?.textContent === 'Alert history') as HTMLElement;
			expect(card.querySelector('[data-part="meta"]')?.textContent).toBe('3 versions');
			await press(card.querySelector('[data-part="name"]') as HTMLElement);
			expect(lastAsk()).toEqual(['openReview', ['alert-history']]);
		});
	});

	it('shows each project as a card in a grid: its picture, its name and what it has, with its comments as a badge', async () => {
		await showOpen();
		expect(cards().map((c) => c.querySelector('[data-part="name"]')?.textContent)).toEqual([
			'Alert history',
			'Zone coverage',
			'Admin usage',
			'Role comparison',
		]);
		expect(cards()[0]!.querySelector('[data-part="meta"]')?.textContent).toBe('3 versions');
		expect(cards()[0]!.querySelector('.badge')?.getAttribute('aria-label')).toBe('2 open comments');
		expect(cards()[0]!.querySelector('.badge')?.classList.contains('badge-brand')).toBe(true);
		expect(cards()[1]!.querySelector('.badge')).toBeNull();
		expect(cards()[0]!.querySelector('[data-part="picture"]')).not.toBeNull();
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
		// The wash is the picture's size, not the row's.
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
		expect(lastAsk()).toEqual(['openReview', ['alert-history']]);
		expect(JSON.parse(cards()[0]!.closest('li')!.dataset.vscodeContext ?? '{}')).toMatchObject({
			webviewSection: 'project',
			projectId: 'alert-history',
		});
	});

	it('draws the pictures in either', async () => {
		await showOpen();
		// A cover name of its own: pictures are cached by name across the tests of this file.
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v3', cover: 'fedcba654321' }]);
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
		work: on.map(([product, createdAt], i) => ({
			...SAMPLE_PROJECTS[0]!.work[0]!,
			name: `v${i + 1}`,
			branch: `prototype/${id}/v${i + 1}`,
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

	it('counts a project’s versions, and no version for work in the code', async () => {
		const at = (name: string, createdAt: string) => ({
			...made('x', 'X', null, [COKE, createdAt]).work[0]!,
			name,
			branch: name === 'codebase' ? 'feature/x' : `prototype/x/${name}`,
		});
		const project = {
			...made('x', 'Many', null, [COKE, '2026-10-01T10:00:00Z']),
			work: [
				at('v1', '2026-10-01T10:00:00Z'),
				at('v3', '2026-10-02T10:00:00Z'),
				at('v2', '2026-10-03T10:00:00Z'),
				at('codebase', '2026-10-04T10:00:00Z'),
			],
		};
		const inCode = { ...project, id: 'y', title: 'Only code', work: [at('codebase', '2026-10-04T10:00:00Z')] };
		await showOpen(OPEN, [project, inCode]);
		await choose('All projects');
		expect(meta('Many')).toBe('3 versions');
		expect(meta('Only code')).toBeUndefined();
	});

	it('shows everyone’s by product, the open one first and No product last, each project once with its folder and where else it is', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		expect(sections()).toEqual(['flock-coke', 'flock-pepsi', 'No product']);
		expect(names()).toEqual(['Alerts', 'Maps', 'Both', 'Old']);
		// Both's newest work is Pepsi's, so it is listed under Pepsi.
		expect(rows()[2]!.closest('[role="list"]')?.getAttribute('aria-label')).toBe('flock-pepsi');
		expect(meta('Both')).toBe('2 versions · Admin · Also in flock-coke');
		expect(meta('Alerts')).toBe('1 version · Admin');
	});

	it('starts each product’s group closed but the open product’s, and keeps what is opened or closed by hand', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		const groups = () => [...body().querySelectorAll<HTMLDetailsElement>('details.section')];
		expect(groups().map((g) => [g.querySelector('[data-part="title"]')?.textContent, g.open])).toEqual([
			['flock-coke', true],
			['flock-pepsi', false],
			['No product', false],
		]);
		await press(groups()[1]!.querySelector('summary') as HTMLElement);
		await say({ type: 'projects-changed' });
		await answer('listProjects', PROJECTS);
		expect(groups()[1]!.open).toBe(true);
	});

	it('starts every product’s group closed with no product open', async () => {
		await showOpen({ ...OPEN, product: null, productRepository: null, designSystem: null, source: null }, PROJECTS);
		const groups = [...body().querySelectorAll<HTMLDetailsElement>('details.section')];
		expect(groups.length).toBeGreaterThan(1);
		expect(groups.map((g) => g.open)).toEqual(groups.map(() => false));
	});

	it('changes nothing of what can be done: a project of another product opens for review as any does', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		await press(
			rows()
				.find((r) => r.querySelector('[data-part="name"]')?.textContent === 'Maps')!
				.querySelector('button')!,
		);
		expect(lastAsk()).toEqual(['openReview', ['maps']]);
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
		expect(meta('Acme')).toBe('2 versions · Also in acme/flock-coke');
	});

	it('goes back to the product’s own when another product is opened', async () => {
		await showOpen(OPEN, PROJECTS);
		await choose('All projects');
		await share('placed', { context: { ...OPEN, product: '/work/flock-pepsi', productRepository: PEPSI }, unreadable: null, setup: null });
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
		expect(choices.every((c) => c.firstElementChild?.classList.contains('codicon'))).toBe(true);
		expect(choices.map((c) => c.lastElementChild?.classList.contains('menu-check'))).toEqual([true, false, true, false]);
		expect(choices.map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true', 'false']);
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
		expect([...body().querySelectorAll('[role="list"]')].map((l) => l.getAttribute('aria-label'))).toEqual(['Admin', 'Maps', 'No folder']);
		expect(rows().map((r) => part(r, 'name'))).toEqual(['Alert history', 'Zone coverage', 'Admin usage', 'Role comparison']);
		expect(rows()[0]!.querySelector('[data-part="picture"]')).not.toBeNull();
		expect(part(rows()[0]!, 'meta')).toBe('3 versions');
		expect(part(rows()[3]!, 'meta')).toBe('1 version');
	});

	it('marks the project whose review is in front in the editor, in a grid and in a list, and no other', async () => {
		await showOpen();
		const current = () => [...body().querySelectorAll<HTMLElement>('[data-current]')].map((i) => i.querySelector('[data-part="name"]')?.textContent);
		expect(current()).toEqual([]);
		await share('tabs', { projects: ['zone-coverage'], components: [] });
		expect(current()).toEqual(['Zone coverage']);
		expect(body().querySelector('[aria-current="true"] [data-part="name"]')?.textContent).toBe('Zone coverage');
		await viewChoice('List');
		expect(current()).toEqual(['Zone coverage']);
		await share('tabs', { projects: [], components: [] });
		expect(current()).toEqual([]);
	});

	it('shows the open comments only when there are some, and says what the number is', async () => {
		await showOpen();
		const badges = rows().map((r) => r.querySelector('.badge'));
		expect(badges.map((b) => b?.textContent ?? null)).toEqual(['2', null, null, '5']);
		expect(badges[0]?.getAttribute('aria-label')).toBe('2 open comments');
	});

	it('opens a project’s newest prototype for review when its row is pressed: it names the project, and the extension finds the newest as it is then', async () => {
		await showOpen();
		await press(rows()[0]!.querySelector('button') as HTMLElement);
		expect(lastAsk()).toEqual(['openReview', ['alert-history']]);
	});

	it('draws each project’s picture: those built here are made once the list is read, then each is read by its name', async () => {
		await showOpen();
		expect(rows()[0]!.querySelector('img')).toBeNull();
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v3', cover: 'abc123def456' }]);
		const asked = sent.filter((m) => m.name === 'projectCover').at(-1);
		expect(asked?.args).toEqual(['alert-history', 'v3', 'abc123def456']);
		await answer('projectCover', 'data:image/jpeg;base64,AAAA');
		expect(rows()[0]!.querySelector('[data-part="picture"]')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
		expect(rows()[1]!.querySelector('[data-part="picture"]')?.tagName).toBe('SPAN');
	});

	it('shows a picture drawn again, not the one before it', async () => {
		await showOpen();
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v3', cover: 'aaaaaaaaaaaa' }]);
		await say({ type: 'projects-changed' });
		await answer(
			'listProjects',
			SAMPLE_PROJECTS.map((p) => ({ ...p })),
		);
		await answer('ensureCovers', [{ projectId: 'alert-history', name: 'v3', cover: 'bbbbbbbbbbbb' }]);
		expect(sent.filter((m) => m.name === 'projectCover').at(-1)?.args).toEqual(['alert-history', 'v3', 'bbbbbbbbbbbb']);
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
		expect(body().querySelector('.message')?.textContent).toBe("These are the projects on this machine. Sign in to see your team's too.");
	});

	describe('setting the open repository up', () => {
		const signedIn = { state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } };
		const NONE: Context = { ...OPEN, product: null, productRepository: null, designSystem: null, source: null, missing: ['No product is open.'] };
		const placed = async (context: Context, setup: unknown, signIn = true) => {
			await show();
			await share('placed', { context, unreadable: null, setup } as never);
			if (signIn) await say({ type: 'event', name: 'onSignInChanged', payload: signedIn });
			await answer('listProjects', SAMPLE_PROJECTS);
		};
		const setupMessage = () => [...body().querySelectorAll('.message-block')].find((m) => /set ?up/i.test(m.textContent ?? '')) as HTMLElement;

		it('offers Set up, once signed in, for a repository that is not set up, in place of cloning one', async () => {
			await placed(NONE, { state: 'not-set-up', root: '/work/paradome' });
			expect(setupMessage().querySelector('.message-title')?.textContent).toBe('paradome is not set up for DSNR');
			expect(body().textContent).not.toContain('No product is open');
			await press(button('Set up'));
			expect(lastAsk()).toEqual(['setUp', []]);
		});

		it('says to sign in first, and offers nothing until then', async () => {
			await placed(NONE, { state: 'not-set-up', root: '/work/paradome' }, false);
			expect(setupMessage().textContent).toContain('Sign in, at the top of DSNR, to set it up.');
			expect(setupMessage().querySelector('button')).toBeNull();
		});

		it('asks for a review before the workspace file is committed, showing what to fix, what it lacks and what DSNR may run', async () => {
			const check = {
				problems: ['test runs the script test, which package.json does not have.'],
				missing: ['No design-mode command: it runs the real product on mock data, for codebase work and its accessibility check.'],
				commands: [{ id: 'lint', label: 'Lint', argv: ['npm', 'run', 'lint'] }],
			};
			await placed(OPEN, { state: 'review', root: '/work/flock-coke', check });
			expect(setupMessage().querySelector('.message-title')?.textContent).toBe("flock-coke's setup has something to fix");
			await press(button('Review'));
			const shown = dialog()!;
			expect([...shown.querySelectorAll('[data-part="title"]')].map((t) => t.textContent)).toEqual([
				'To fix',
				'What it does not have, which DSNR would use',
				'The commands it lets DSNR run',
			]);
			expect(shown.textContent).toContain('test runs the script test, which package.json does not have.');
			expect(shown.querySelector('code')?.textContent).toBe('lint: npm run lint');
		});

		it('asks only for a review when there is nothing to fix, and says nothing once it is committed', async () => {
			await placed(OPEN, { state: 'review', root: '/work/flock-coke', check: { problems: [], missing: [], commands: [] } });
			expect(setupMessage().querySelector('.message-title')?.textContent).toBe("Review flock-coke's setup, then commit it");
			await placed(OPEN, null);
			expect(setupMessage()).toBeUndefined();
		});
	});

	it('says why it could not read them', async () => {
		await show();
		await share('placed', { context: OPEN, unreadable: null, setup: null });
		const call = sent.find((m) => m.name === 'listProjects');
		await say({ type: 'answer', id: call?.id, result: { ok: false, error: 'GitHub could not be reached.' } });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('The projects could not be read');
		expect(body().textContent).toContain('GitHub could not be reached.');
	});

	it('says when there are none, and that one is started by asking the agent, which it names: there is no form for it here', async () => {
		await showOpen(OPEN, []);
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No projects yet');
		await share('agent', { name: null });
		expect(body().querySelector('.empty')?.textContent).toContain('Ask the agent to create a prototype, for example');
		await share('agent', { name: 'Claude Code' });
		expect(body().querySelector('.empty')?.textContent).toContain('Ask Claude Code to create a prototype, for example');
		expect(body().querySelector('.empty button')).toBeNull();
	});
});

describe('Design System', () => {
	const open = async (context: Context = OPEN, unreadable?: string) => {
		await show();
		await share('placed', { context, unreadable: unreadable ?? null, setup: null });
		if (context.product) await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
	};
	const read = async (catalog: Catalog = SAMPLE_CATALOG, pictures: Partial<ComponentPictures> = {}) => {
		await open();
		await shareCatalog(catalog);
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

	it('says, when there is none, what DSNR looked for and where, and offers to choose one for the product', async () => {
		await open({ ...OPEN, designSystem: null, source: { state: 'none' } });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No design system found');
		expect(body().textContent).toContain('DSNR looks in the folders open in this window');
		await press(button('Choose design system…'));
		expect(lastAsk()).toEqual(['chooseDesignSystem', []]);
	});

	it('says why the one chosen, or found, was refused, in place of what DSNR looks for', async () => {
		const why = "/far/ui, the design system chosen for flock-coke, is not on this computer any more. Choose another, or use the product's.";
		await open({ ...OPEN, designSystem: null, source: { state: 'refused', root: '/far/ui', why } });
		expect(body().textContent).toContain(why);
		expect(body().textContent).not.toContain('DSNR looks in the folders open in this window');
		expect(button('Choose design system…')).toBeTruthy();
	});

	it('offers no choice with no product open: there is nothing to keep it for', async () => {
		await open({ ...OPEN, product: null, designSystem: null, source: null });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('No design system found');
		expect(body().querySelector('.empty button')).toBeNull();
		expect(body().textContent).toContain('Open a product to choose a design system');
	});

	it('says why the one found cannot be read, reads nothing, and offers to locate another', async () => {
		await open(OPEN, '/work/plain is not a git repository.');
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('The design system cannot be read');
		expect(body().textContent).toContain('/work/plain is not a git repository.');
	});

	it('says it is reading the design system until the extension says what it read, which every page is told', async () => {
		await open();
		expect(body().textContent?.trim()).toBe('Reading the design system…');
		expect(spinning(body())).toBe(true);
		await shareCatalog(SAMPLE_CATALOG);
		expect(body().querySelector('.ds-name')?.textContent).toBe('FUI');
	});

	it('names the design system, the icon of its branch directly after it with the branch as its tooltip, with Sync and its menu, and starts on its components', async () => {
		await read();
		expect(body().querySelector('.ds-name')?.textContent).toBe('FUI');
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
		expect(parts().querySelector('.codicon')).toBeNull();
		expect(body().querySelector('.ds-actions [aria-label="Sync with GitHub"]')).toBeNull();
		expect(body().querySelector('[aria-label="Design system actions"]')?.className).toBe('menu-button menu-button-small menu-button-shown');
		await press(body().querySelector('[aria-label="Design system actions"]') as HTMLElement);
		const items = allByRole('menuitem', undefined, body().querySelector('.ds-actions')!);
		expect(items.map((i) => i.textContent)).toEqual(['Sync with GitHub', 'Primitives', 'Voice and Tone', 'Choose design system…']);
		expect(body().querySelectorAll('.ds-actions [role="separator"]')).toHaveLength(2);
		expect(items[0]!.nextElementSibling?.getAttribute('role')).toBe('separator');
		expect(items[3]!.previousElementSibling?.getAttribute('role')).toBe('separator');
		await press(items[2]!);
		expect(lastAsk()).toEqual(['openVoiceAndTone', []]);
		await press(body().querySelector('[aria-label="Design system actions"]') as HTMLElement);
		await press(allByRole('menuitem', undefined, body().querySelector('.ds-actions')!)[3]!);
		expect(lastAsk()).toEqual(['chooseDesignSystem', []]);
		await press(body().querySelector('[aria-label="Design system actions"]') as HTMLElement);
		await press(allByRole('menuitem', undefined, body().querySelector('.ds-actions')!)[0]!);
		expect(lastAsk()).toEqual(['syncDesignSystem', []]);
	});

	it('opens onto its tokens with nothing over them but the search: no line saying which files they were read from', async () => {
		await read();
		await press([...parts().querySelectorAll<HTMLElement>('[role="radio"]')][1]!);
		expect(body().querySelector('[data-token]')).not.toBeNull();
		expect(body().textContent).not.toMatch(/Read from|theme files/);
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
		expect(under(section('Buttons')).querySelector('[data-part="meta"]')).toBeNull();
		expect(under(section('Buttons')).querySelector('.badge')).toBeNull();
	});

	it('opens a component in its own tab when pressed, and its links, and no Open, from its menu, naming it only', async () => {
		await read();
		const card = [...body().querySelectorAll<HTMLElement>('.card-item')].find((c) => c.textContent?.includes('FSButton')) as HTMLElement;
		await press(card.querySelector('.card') as HTMLElement);
		expect(lastAsk()).toEqual(['openComponent', ['src/components/FSButton/FSButton.stories.tsx']]);
		await press(card.querySelector('.menu-button') as HTMLElement);
		expect(allByRole('menuitem', undefined, card).map((i) => i.textContent)).toEqual(['Open in Storybook', 'View on GitHub']);
		await press(allByRole('menuitem', undefined, card).find((i) => i.textContent === 'Open in Storybook')!);
		expect(lastAsk()).toEqual(['componentLink', ['src/components/FSButton/FSButton.stories.tsx', 'storybook']]);
		// Its Storybook's address not known yet, it is offered all the same: opening it asks for the address, once.
		const other = [...body().querySelectorAll<HTMLElement>('.card-item')].find((c) => c.textContent?.includes('FSSelect')) as HTMLElement;
		await press(other.querySelector('.menu-button') as HTMLElement);
		expect(allByRole('menuitem', undefined, other).map((i) => i.textContent)).toEqual(['Open in Storybook', 'View on GitHub']);
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
		await share('tabs', { projects: [], components: ['src/components/FSButton/FSButton.stories.tsx'] });
		expect(current()).toEqual(['FSButton']);
		await share('tabs', { projects: [], components: [] });
		expect(current()).toEqual([]);
	});

	it('offers the mode components are shown in as a Color mode section of the view options, light chosen, and only when the library has a dark', async () => {
		await read();
		const mode = async () => (await viewChoices()).filter((o) => o.closest('[role="group"]')?.getAttribute('aria-label') === 'Color mode');
		expect((await mode()).map((o) => [o.textContent, o.getAttribute('aria-checked')])).toEqual([
			['Light', 'true'],
			['Dark', 'false'],
		]);
		const [light, dark] = await mode();
		expect(light!.querySelector('svg circle')).not.toBeNull();
		expect(dark!.querySelector('svg circle')).toBeNull();
		expect(dark!.querySelector('svg path')).not.toBeNull();
		await viewChoice('Dark');
		expect(lastAsk()).toEqual(['setMode', ['dark']]);
		expect((await mode()).map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true']);
		await share('mode', 'light');
		expect((await mode()).map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false']);
		await unmount();
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
		expect(body().querySelector('.message')?.textContent).toContain('No component matches “nothing like it”.');
	});

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
		const headings = [...set.querySelectorAll<HTMLElement>('[data-theme-heading]')];
		expect(headings.map((h) => [h.getAttribute('aria-label'), h.title, h.textContent])).toEqual([
			['Light', 'Light', ''],
			['Dark', 'Dark', ''],
		]);
		expect(headings.map((h) => h.querySelector('svg')?.querySelector('circle') !== null)).toEqual([true, false]);
		const rows = [...set.querySelectorAll<HTMLElement>('[data-token-row]')];
		expect(rows.map((r) => r.dataset.tokenRow)).toEqual(['main', 'contrastText']);
		const light = rows[0]!.querySelector('[data-token="palette.light.primary.main"] button') as HTMLElement;
		expect(light.getAttribute('title')).toBe('Light primary main');
		expect(light.className).toBe('color-dot');
		expect(rows[0]!.querySelector('[data-token="palette.dark.primary.main"] button')?.getAttribute('title')).toBe('Dark primary main');
		expect(rows[1]!.querySelector('.theme-none')?.textContent).toBe('—');
		await press(light);
		expect(dialog()?.getAttribute('aria-label')).toBe('Light · primary.main');
	});

	it('says nothing on a colour’s dot but the token’s name, in the grid of roles and in the palette: one line, no hex, no pointer', async () => {
		for (const palette of [false, true]) {
			await unmount();
			await tokens(palette);
			const dots = [...body().querySelectorAll<HTMLElement>('.color-dot')];
			expect(dots.length).toBeGreaterThan(0);
			for (const d of dots) expect(d.title).toBe(d.getAttribute('aria-label')?.replace(/^Change /, ''));
		}
	});

	it('shows the palette behind the roles, a press away: each step as its name and only its dot, whose hover is its name, and its own file', async () => {
		await tokens(true);
		expect(titles()[0]).toEqual(['Color', '2']);
		const step = body().querySelector('[data-token="tone.pineGreen.50"]') as HTMLElement;
		expect(step.querySelectorAll('[data-swatch]')).toHaveLength(1);
		expect(step.querySelector('[data-part="value"]')).toBeNull();
		expect(step.querySelector('[data-part="name"]')?.textContent).toBe('50');
		expect(step.querySelector('.color-dot')?.getAttribute('title')).toBe('Tones pineGreen 50');
		expect(step.title).toBe('src/colors/tones.ts:3');
		const link = step.querySelector('button[data-part="name"]') as HTMLElement;
		expect(link.getAttribute('aria-label')).toBe('50: open src/colors/tones.ts:3');
		expect(step.querySelector('.item-actions, .codicon-go-to-file')).toBeNull();
		await press(link);
		expect(lastAsk()).toEqual(['openLibrarySource', ['src/colors/tones.ts', 3]]);
		await press(step.querySelector('button.color-dot') as HTMLElement);
		expect(dialog()).not.toBeNull();
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
		await share('tokenEdits', [{ path: 'tone.pineGreen.50', value: '#000000' }]);
		const step = body().querySelector('[data-token="tone.pineGreen.50"]') as HTMLElement;
		expect(step.dataset.changed).toBe('true');
		expect((step.querySelector('.color-dot [data-swatch]') as HTMLElement).style.backgroundColor).toBe('rgb(0, 0, 0)');
		expect(step.querySelector('.color-dot [data-changed-mark]')?.getAttribute('data-changed-mark')).toBe('Changed');
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
		const bubble = body().querySelector('.ds-actions [aria-label="1 value in its token files is not read"]') as HTMLElement;
		expect(bubble.textContent).toBe('1');
		expect(bubble.className).toBe('badge badge-warning badge-button');
		expect(body().querySelector('.message .link')).toBeNull();
		await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
		const order = [...body().querySelectorAll('.ds-actions > *')].map((e) => e.getAttribute('aria-label') ?? e.className);
		expect(order.slice(0, 2)).toEqual(['1 change being tried', '1 value in its token files is not read']);
		expect(body().querySelector('.ds-actions')?.lastElementChild?.matches('.menu, .menu *, [aria-label="Design system actions"]')).toBe(true);
		await press(bubble);
		expect(dialog()?.textContent).toContain('src/colors/tones.ts:9 A value worked out as it runs.');
	});

	it('has no not-read bubble when every value is read, and a changes count that is always there: gray at none, the brand’s from one', async () => {
		await read();
		expect(body().querySelector('.ds-actions .badge-warning')).toBeNull();
		const none = () => body().querySelector('.ds-actions [aria-label="No changes yet"]') as HTMLElement;
		expect(none().textContent).toBe('0');
		expect(none().className).toBe('badge badge-button');
		await press(none());
		expect(dialog('Changes')?.textContent).toContain('No changes yet');
		await key('Escape');
		await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
		const changes = body().querySelector('.ds-actions [aria-label="1 change being tried"]') as HTMLElement;
		expect(changes.classList.contains('badge-brand')).toBe(true);
		await share('tokenEdits', []);
		expect(none().classList.contains('badge-brand')).toBe(false);
	});

	it('says when the design system is no longer on this computer, and offers to choose another', async () => {
		await read({ state: 'lost', name: 'FUI', root: '/work/flock-react-component-lib' });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('FUI is no longer on this computer');
		expect(body().textContent).toContain('Open its folder again, or choose another.');
		await press(button('Choose design system…'));
		expect(lastAsk()).toEqual(['chooseDesignSystem', []]);
	});

	it('says why a clone with no copy of its branch cannot be read, with a way to try again', async () => {
		await read({ state: 'no-branch', root: '/work/flock-react-component-lib', branch: 'develop' });
		expect(body().querySelector('.empty [data-part="title"]')?.textContent).toBe('This clone has no develop branch');
		await press(button('Try again'));
		expect(lastAsk()).toEqual(['syncDesignSystem', []]);
	});
});

describe('every change being tried, in the panel’s Changes: the tokens and each component’s values (the changes being tried, DESIGN_SYSTEM.md)', () => {
	const SYSTEM = 'flocksafety/flock-react-component-lib';
	const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
	const SMALL = { property: 'height' as const, value: '32px', targets: ['height:sm:0', 'height:sm:1', 'height:sm:2'] };
	const ID = 'height\u0000height:sm:0\u0001height:sm:1\u0001height:sm:2';
	const FOUND = {
		state: 'ready',
		values: [{ id: ID, state: 'found', places: [{ file: 'src/utils/theme.ts', line: 158, written: '28px', writes: '32px' }] }],
		reach: { state: 'none' },
	};
	const designOpen = async () => {
		await show();
		await share('placed', { context: OPEN, unreadable: null, setup: null });
		await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
		await share('catalog', { system: { id: SYSTEM, name: 'FUI' }, catalog: SAMPLE_CATALOG, error: null, syncing: false });
		await answerOf('changeBranch', 'tokens', null);
	};
	const count = () => document.querySelector('.ds-actions [aria-label$="being tried"]') as HTMLElement;
	const changes = () => dialog('Changes');
	const group = () => document.querySelector('[aria-label="Value changes · FSButton"]') as HTMLElement | null;
	const trialsSaid = () => calls('setValueTrial').map((c) => c.args);

	it('counts every component’s values tried on this commit, and lists each by its name, with its Save, Propose and Reset', async () => {
		await designOpen();
		await share('valueTrials', {
			[BUTTON]: { commit: 'abc123', values: [SMALL] },
			'src/components/FSIconButton/FSIconButton.stories.tsx': { commit: 'def456', values: [SMALL] },
		});
		expect(count().getAttribute('aria-label')).toBe('1 change being tried');
		expect(count().classList.contains('badge-brand')).toBe(true);
		await press(count());
		await answerOf('changeScopes', 'values', []);
		await answerOf('changeBranch', 'values', null);
		await answer('valueSources', FOUND);
		expect(calls('valueSources').at(-1)?.args).toEqual([BUTTON, [SMALL]]);
		expect(group()?.querySelector('.heading-set')?.textContent).toBe('FSButton 1');
		expect(document.querySelector('[aria-label="Value changes · FSIconButton"]')).toBeNull();
		await press(button('Save to a branch'));
		expect(callsOf('saveChange', 'values').at(-1)?.args).toEqual(['values', BUTTON, [SMALL]]);
		await answerOf('saveChange', 'values', { branch: 'dsnr/values-20261016-ab12', saved: [SMALL], saves: 1, pullRequest: null });
		expect(group()?.querySelector('.branch-line')?.textContent).toBe('dsnr/values-20261016-ab12 · 1 save');
		await press(button('Propose'));
		expect(callsOf('proposeChange', 'values').at(-1)?.args).toEqual(['values', BUTTON, null]);
		await press(group()!.querySelector('[aria-label^="Reset "]') as HTMLElement);
		expect(trialsSaid().at(-1)).toEqual([BUTTON, 'abc123', []]);
	});

	it('lists a component with a branch of its values kept and nothing tried, and puts its values back, as opening its tab does', async () => {
		await designOpen();
		await answerOf('changeScopes', 'values', [BUTTON]);
		await answerOf('changeScopes', 'handOver', []);
		await press(count());
		await answerOf('changeBranch', 'values', { branch: 'dsnr/values-20261016-ab12', saved: [SMALL], saves: 1, pullRequest: null });
		expect(trialsSaid().at(-1)).toEqual([BUTTON, 'abc123', [SMALL]]);
		expect(group()).not.toBeNull();
	});

	it('counts what it lists, kept up as a trial ends: its values kept as a branch are still one change', async () => {
		await designOpen();
		await answerOf('changeScopes', 'values', []);
		await answerOf('changeScopes', 'handOver', []);
		expect(count()).toBeNull();
		await share('valueTrials', { [BUTTON]: { commit: 'abc123', values: [SMALL] } });
		expect(count().getAttribute('aria-label')).toBe('1 change being tried');
		// A value moved is not a trial started or ended: what is kept is not asked again for it.
		const asked = callsOf('changeScopes', 'values').length;
		await share('valueTrials', { [BUTTON]: { commit: 'abc123', values: [{ ...SMALL, value: '36px' }] } });
		expect(callsOf('changeScopes', 'values')).toHaveLength(asked);
		await share('valueTrials', {});
		expect(callsOf('changeScopes', 'values')).toHaveLength(asked + 1);
		await answerOf('changeScopes', 'values', [BUTTON]);
		await answerOf('changeScopes', 'handOver', []);
		expect(count().getAttribute('aria-label')).toBe('1 change being tried');
	});

	describe('a component’s values, in the panel’s Changes: where each is written, and what it moves', () => {
		afterEach(() => void vi.useRealTimers());
		const found = (over: Record<string, unknown> = {}) => ({
			state: 'ready',
			values: [{ id: ID, state: 'found', places: [{ file: 'src/utils/theme.ts', line: 158, written: '28px', writes: '32px' }] }],
			reach: {
				state: 'ready',
				moved: [
					{ file: BUTTON, changes: [{ mode: 'light', property: 'height', variant: 'sm', from: '28px', to: '32px', instances: 3 }], inside: false },
				],
				unchanged: 12,
				notDrawn: [],
			},
			...over,
		});
		const trying = async () => {
			await designOpen();
			await share('valueTrials', { [BUTTON]: { commit: 'abc123', values: [SMALL] } });
			await press(count());
			await answerOf('changeScopes', 'values', []);
			await answerOf('changeBranch', 'values', null);
		};

		it('offers Save only once every value is found where it is written, each place opening the library at its line', async () => {
			await trying();
			await answer('valueSources', found());
			expect(group()!.querySelector('[data-value-places]')?.textContent).toBe('src/utils/theme.ts (158)');
			await press(group()!.querySelector('[data-value-places] button') as HTMLElement);
			expect(lastAsk()).toEqual(['openLibrarySource', ['src/utils/theme.ts', 158]]);
			expect(group()!.textContent).not.toMatch(/Saving writes|Saving waits|DSNR cannot write/);
			expect(button('Save to a branch', group()!).disabled).toBe(false);
			expect(allByRole('button', 'Process changes')).toEqual([]);
			// In the card of the change it is of, closed: the toggle is the last thing in it.
			const affected = group()!.querySelector('[data-reach]') as HTMLElement;
			expect(affected.querySelector('summary')?.textContent).toBe('1 component affected');
			expect(affected.querySelector('details')?.open).toBe(false);
			expect(group()!.lastElementChild).toBe(affected);
			expect(affected.querySelector('[data-reach-note]')).toBeNull();
		});

		it('holds Save, and offers no Process changes, while where each value is written is looked for', async () => {
			await trying();
			expect(button('Save to a branch', group()!).disabled).toBe(true);
			expect(allByRole('button', 'Process changes')).toEqual([]);
			expect(group()!.textContent).not.toMatch(/Saving writes|Saving waits|DSNR cannot write/);
		});

		it('gives each place its own line, one link of its file and its line, opening the library there', async () => {
			await trying();
			const file = 'src/components/FSFab/index.tsx';
			await answer(
				'valueSources',
				found({ values: [{ id: ID, state: 'found', places: [9, 10, 11].map((line) => ({ file, line, written: '8px', writes: '15px' })) }] }),
			);
			const lines = [...group()!.querySelectorAll('[data-value-places] .value-place-line')];
			expect(lines.map((l) => l.textContent)).toEqual([`${file} (9)`, `${file} (10)`, `${file} (11)`]);
			expect(group()!.querySelector('[data-value-places]')?.textContent).not.toMatch(/Written in|line/);
			await press(lines[1]!.querySelector('button') as HTMLElement);
			expect(lastAsk()).toEqual(['openLibrarySource', [file, 10]]);
		});

		it('says why a value cannot be saved, in words, where it is, and offers Process changes in Save’s place', async () => {
			await trying();
			await answer('valueSources', {
				state: 'ready',
				values: [{ id: ID, state: 'refused', why: '28px is written in 2 places that each draw it here, so which to change cannot be said.' }],
				reach: { state: 'none' },
			});
			expect(group()!.querySelector('[data-value-refused]')?.textContent).toBe(
				'28px is written in 2 places that each draw it here, so which to change cannot be said.',
			);
			expect(allByRole('button', 'Save to a branch')).toEqual([]);
			expect(button('Process changes', group()!).disabled).toBe(false);
			expect(group()!.textContent).toContain('DSNR cannot write every value where it is written, so the agent writes the change');
			expect(changes()!.querySelector('[data-reach]')).toBeNull();
		});

		it('offers the agent where a value cannot be found, asks it once pressed, and says what it wrote and why', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
			await trying();
			await answer('valueSources', {
				state: 'ready',
				values: [{ id: ID, state: 'refused', why: '28px is not written in the design system’s own files for it.', agent: 'write' }],
				reach: { state: 'none' },
			});
			await press(group()!.querySelector('[data-value-agent]') as HTMLElement);
			expect(calls('writeValue').at(-1)?.args).toEqual([BUTTON, SMALL]);
			await answer('writeValue', null);
			await answer('valueSources', { state: 'ready', values: [{ id: ID, state: 'writing' }], reach: { state: 'none' } });
			expect(group()!.textContent).toContain('The agent is writing it…');
			expect(button('Save to a branch', group()!).disabled).toBe(true);
			expect(allByRole('button', 'Process changes')).toEqual([]);
			const asked = calls('valueSources').length;
			await act(async () => void (await vi.advanceTimersByTimeAsync(ASK_EVERY_MS)));
			expect(calls('valueSources').length).toBe(asked + 1);
			await answer(
				'valueSources',
				found({
					values: [
						{
							id: ID,
							state: 'found',
							by: 'agent',
							said: 'MUI’s default sets it, so the theme’s override does.',
							places: [{ file: 'src/utils/theme.ts', line: 59, written: '', writes: "height: '32px'," }],
						},
					],
				}),
			);
			expect(group()!.querySelector('[data-value-places]')?.textContent).toBe('By the agent:src/utils/theme.ts (59)');
			expect(group()!.textContent).toContain('MUI’s default sets it, so the theme’s override does.');
			expect(group()!.textContent).not.toContain('Saving writes');
		});

		it('lists a value that follows a token as following it', async () => {
			await designOpen();
			await share('valueTrials', {
				[BUTTON]: { commit: 'abc123', values: [{ property: 'radius', value: '4px', targets: ['radius:0'], follows: 'radius' }] },
			});
			await press(count());
			await answerOf('changeScopes', 'values', []);
			await answerOf('changeBranch', 'values', null);
			await answer('componentTokens', {
				state: 'ready',
				uses: [],
				sharedWith: {},
				notTokens: [],
				derived: [],
				accessibility: null,
				values: {
					state: 'read',
					instances: 12,
					unmarked: 0,
					rows: {
						light: [
							{
								property: 'radius',
								by: null,
								cells: [{ variant: null, value: '4px', kind: 'own', tokens: [], instances: 12, targets: ['radius:0'] }],
							},
						],
						dark: null,
					},
				},
			});
			expect(group()!.querySelector('[data-value-change] .value-cell')?.textContent).toBe('Radius4px → follows Radius');
		});

		const RADIUS = { property: 'radius' as const, value: '4px', targets: ['radius:0'] };

		it('has no Reset of its own for one value, whose own undo is on its row', async () => {
			await trying();
			await answer('valueSources', found());
			expect(allByRole('button', 'Reset', group()!)).toEqual([]);
			expect(allByRole('button', /^Reset /, group()!)).toHaveLength(1);
		});

		it('puts every value of a component back with its Reset, once there are two', async () => {
			await trying();
			await share('valueTrials', { [BUTTON]: { commit: 'abc123', values: [SMALL, RADIUS] } });
			await answer('valueSources', found());
			await press(button('Reset', group()!));
			expect(trialsSaid().at(-1)).toEqual([BUTTON, 'abc123', []]);
			await share('valueTrials', {});
			expect(group()).toBeNull();
		});
	});

	describe('what a token change moves, in the panel’s Changes', () => {
		const RED = [{ path: 'tone.pineGreen.50', value: '#C80000' }];
		const STORY = (name: string) => `src/components/${name}/${name}.stories.tsx`;
		const moved = (over: Record<string, unknown> = {}) => ({
			state: 'ready',
			moved: [
				{
					file: BUTTON,
					changes: [{ mode: 'light', property: 'background', variant: 'primary', from: 'rgb(16, 128, 98)', to: 'rgb(200, 0, 0)', instances: 6 }],
					inside: false,
				},
				{
					file: STORY('FSIconButton'),
					changes: [{ mode: 'dark', property: 'radius', variant: 'sm', from: '8px', to: '12px', instances: 2 }],
					inside: false,
				},
				{ file: STORY('FSTextField'), changes: [], inside: true },
			],
			unchanged: 40,
			notDrawn: [STORY('FSSelect')],
			...over,
		});
		const part = () => changes()?.querySelector('[data-reach]') as HTMLElement | null;
		const card = () => changes()?.querySelector('[data-changed-tokens]') as HTMLElement | null;
		const tried = async () => {
			await designOpen();
			await share('tokenEdits', RED);
		};

		it('is not asked for while the dialog is shut or no change is tried: drawing every component is for someone who asked to see it', async () => {
			await designOpen();
			expect(calls('changeReach')).toHaveLength(0);
			await share('tokenEdits', RED);
			expect(calls('changeReach')).toHaveLength(0);
		});

		it('is asked for once opened with a change being tried, and says it is drawing every component until it is answered', async () => {
			await tried();
			await press(count());
			expect(calls('changeReach').at(-1)?.args).toEqual([RED]);
			expect(part()?.textContent).toContain('Thinking…');
			expect(part()?.textContent).not.toMatch(/Loading|drawing every component/);
		});

		it('names each component the change moves, with what changed as the Values say it, and how many it does not move', async () => {
			await tried();
			await press(count());
			await answer('changeReach', moved());
			const reach = part()!;
			// A closed toggle at the bottom of the tokens' own card, which says how many.
			expect(reach.querySelector('summary')?.textContent).toBe('3 components affected');
			expect(reach.querySelector('details')?.open).toBe(false);
			expect(card()!.lastElementChild).toBe(reach);
			await press(reach.querySelector('summary') as HTMLElement);
			expect(reach.querySelector('details')?.open).toBe(true);
			// No line to count what the list says: only what it does not, the one that could not be drawn.
			expect(reach.querySelector('[data-reach-note]')?.textContent).toBe('1 component did not draw, so cannot be said.');
			expect(reach.textContent).not.toMatch(/It moves|unchanged/);
			const here = reach.querySelector(`[data-moved="${BUTTON}"]`) as HTMLElement;
			expect(here.querySelector('h3')?.textContent).toBe('FSButton');
			expect(here.querySelector('.value-cell')?.textContent).toBe('Background · primary#108062 → #C80000');
			const icon = reach.querySelector(`[data-moved="${STORY('FSIconButton')}"]`) as HTMLElement;
			expect(icon.querySelector('.value-cell')?.textContent).toBe('Radius · sm · dark8px → 12px');
			await press(icon.querySelector('h3 button') as HTMLElement);
			expect(lastAsk()).toEqual(['openComponent', [STORY('FSIconButton')]]);
			expect(reach.querySelector(`[data-moved="${STORY('FSTextField')}"]`)?.textContent).toContain('in a part its values do not read');
		});

		it('shows nothing where the change affects none, and says so only where some could not be drawn, or the change could not be', async () => {
			await tried();
			await press(count());
			await answer('changeReach', moved({ moved: [], unchanged: 44, notDrawn: [] }));
			expect(part()).toBeNull();
			expect(changes()!.textContent).not.toMatch(/No component is affected|moves no component/);
			await share('tokenEdits', [{ path: 'tone.pineGreen.50', value: '#111111' }]);
			await answer('changeReach', moved({ moved: [], unchanged: 40, notDrawn: [STORY('FSSelect')] }));
			expect(part()?.textContent).toBe('1 component did not draw, so cannot be said.');
			expect(part()?.querySelector('summary')).toBeNull();
			await share('tokenEdits', [{ path: 'tone.pineGreen.50', value: '#000000' }]);
			await answer('changeReach', { state: 'failed', error: 'the change did not build' });
			expect(part()?.textContent).toContain('the change did not build');
		});
	});

	describe('Reset all, in the title, for everything tried', () => {
		const ICON = 'src/components/FSIconButton/FSIconButton.stories.tsx';
		const resetAll = () => allByRole('button', 'Reset all', changes()!);
		const opened = async (edits: boolean, components: string[]) => {
			await designOpen();
			if (edits) await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
			await share('valueTrials', Object.fromEntries(components.map((c) => [c, { commit: 'abc123', values: [SMALL] }])));
			await press(count());
		};

		it('is not there for one group, which has its own Reset', async () => {
			await opened(false, [BUTTON]);
			expect(resetAll()).toEqual([]);
			expect(allByRole('button', 'Reset', changes()!)).toEqual([]);
		});

		it('is at the end of the title, before its close, once two components have values tried, and puts both back', async () => {
			await opened(false, [BUTTON, ICON]);
			const head = changes()!.querySelector('.dialog-head') as HTMLElement;
			expect([...head.children].map((c) => c.textContent || c.getAttribute('aria-label'))).toEqual(['Changes', 'Reset all', 'Close']);
			await press(resetAll()[0]!);
			expect(trialsSaid()).toEqual(
				expect.arrayContaining([
					[BUTTON, 'abc123', []],
					[ICON, 'abc123', []],
				]),
			);
		});

		it('includes the tokens: the tokens and one component are two, and both are put back', async () => {
			await opened(true, [BUTTON]);
			expect(resetAll()).toHaveLength(1);
			await press(resetAll()[0]!);
			expect(calls('setTokenEdits').at(-1)?.args).toEqual([[]]);
			expect(trialsSaid().at(-1)).toEqual([BUTTON, 'abc123', []]);
		});

		it('is not there for the tokens alone: that is one group, with its own Reset', async () => {
			await opened(true, []);
			expect(resetAll()).toEqual([]);
		});
	});

	describe('the cards say what is, not how it works', () => {
		it('has no line explaining where a change is tried, what is read from git, or what a copy is', async () => {
			await designOpen();
			await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
			await share('valueTrials', { [BUTTON]: { commit: 'abc123', values: [SMALL] } });
			await press(count());
			await answerOf('changeScopes', 'values', []);
			await answerOf('changeBranch', 'values', null);
			await answer('valueSources', FOUND);
			const said = changes()!.textContent ?? '';
			expect(said).not.toMatch(
				/Tried in the stories|in Primitives|read from git|Nothing in it is changed|each is a copy|Chromatic’s build is linked/,
			);
		});
	});

	describe('what is none is not shown', () => {
		it('lists no group for a count of none, and says only that nothing is being tried where nothing is', async () => {
			await show();
			await share('placed', { context: OPEN, unreadable: null, setup: null });
			await answer('listProjects', SAMPLE_PROJECTS);
			await say({ type: 'open-dialog', dialog: { kind: 'changes' } });
			await share('catalog', { system: { id: SYSTEM, name: 'FUI' }, catalog: SAMPLE_CATALOG, error: null, syncing: false });
			await answerOf('changeBranch', 'tokens', null);
			const box = changes()!;
			expect(box.querySelector('[data-changed-tokens], [data-value-changes], [data-branch-actions]')).toBeNull();
			expect(box.querySelector('.section-count')).toBeNull();
			expect(box.textContent).toBe('ChangesNo changes yetChanges you try, or edit in your code, are listed here.');
		});

		it('shows a component with a branch kept and nothing tried by its name alone, with no count and no line that none are tried', async () => {
			await designOpen();
			await answerOf('changeScopes', 'values', [BUTTON]);
			await answerOf('changeScopes', 'handOver', []);
			await press(count());
			await answerOf('changeBranch', 'values', { branch: 'dsnr/values-20261016-ab12', saved: [SMALL], saves: 1, pullRequest: null });
			await share('valueTrials', {});
			const only = group()!;
			expect(only.querySelector('.heading-set')?.textContent).toBe('FSButton');
			expect(only.querySelector('.section-count')).toBeNull();
			expect(only.textContent).not.toMatch(/Every value is|Reset/);
			expect(only.querySelector('.branch-line')?.textContent).toContain('dsnr/values-20261016-ab12');
		});
	});

	it('opens when a component’s tab asks for it, on the Design System tab', async () => {
		await show();
		await share('placed', { context: OPEN, unreadable: null, setup: null });
		await answer('listProjects', SAMPLE_PROJECTS);
		expect(chosen()).toBe('Projects');
		await say({ type: 'open-dialog', dialog: { kind: 'changes' } });
		expect(chosen()).toBe('Design System');
		await share('catalog', { system: { id: SYSTEM, name: 'FUI' }, catalog: SAMPLE_CATALOG, error: null, syncing: false });
		await answerOf('changeBranch', 'tokens', null);
		expect(changes()).not.toBeNull();
		await press(button('Close', changes()!));
		expect(changes()).toBeNull();
	});

	describe('Process changes: one group handed to Claude Code on a branch DSNR names, read from git, proposed as the rules allow', () => {
		const EDITS = [{ path: 'tone.pineGreen.60', value: '#000000' }];
		const BRANCH = 'dsnr/handoff-20261017-ab12';
		const handOver = () => document.querySelector('[data-hand-over]') as HTMLElement | null;
		/** `file` null is the tokens' hand-over; otherwise a component's story file. */
		const answerHandOver = async (file: string | null, value: unknown) => {
			const call = callsOf('changeBranch', 'handOver')
				.filter((c) => c.args?.[1] === file)
				.at(-1);
			if (!call) throw new Error(`the page asked for no hand-over of ${String(file)}`);
			await say({ type: 'answer', id: call.id, result: { ok: true, value } });
		};
		const tokensChanged = async () => {
			await designOpen();
			await share('tokenEdits', EDITS);
			await press(count());
			await answerHandOver(null, null);
			await answerOf('changeScopes', 'values', []);
			await answerOf('changeScopes', 'handOver', []);
		};
		const REFUSED = 'The token is written in a file DSNR does not write.';
		/** DSNR could not write the change where it is, so the agent is offered in Save’s place. */
		const tokensRefused = async () => {
			await tokensChanged();
			await press(button('Save to a branch'));
			await say({ type: 'answer', id: callsOf('saveChange', 'tokens').at(-1)!.id, result: { ok: false, error: REFUSED } });
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

		it('offers Save alone for tokens, and the agent in its place once a save is refused, which says why', async () => {
			await tokensChanged();
			expect(button('Save to a branch').disabled).toBe(false);
			expect(allByRole('button', 'Process changes')).toEqual([]);
			await press(button('Save to a branch'));
			await say({ type: 'answer', id: callsOf('saveChange', 'tokens').at(-1)!.id, result: { ok: false, error: REFUSED } });
			expect(document.querySelector('[data-branch-actions] [role="alert"]')?.textContent).toBe(REFUSED);
			expect(allByRole('button', 'Save to a branch')).toEqual([]);
			expect(button('Process changes').disabled).toBe(false);
		});

		it('offers Save again, and not the agent, once what is tried changes after a refusal', async () => {
			await tokensRefused();
			await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#111111' }]);
			expect(button('Save to a branch').disabled).toBe(false);
			expect(allByRole('button', 'Process changes')).toEqual([]);
			expect(document.querySelector('[data-branch-actions] [role="alert"]')).toBeNull();
		});

		it('hands over that one group, and shows its branch in Save’s place until Claude Code makes it', async () => {
			await tokensRefused();
			await press(button('Process changes'));
			expect(calls('handOverChanges').at(-1)?.args).toEqual([null, { edits: EDITS }]);
			await answer('handOverChanges', { branch: BRANCH, agent: 'Claude Code', opened: 'typed', command: null });
			await answerHandOver(null, { branch: BRANCH, lines: ['primary: #000000'], review: { state: 'missing' }, pullRequest: null });
			expect(handOver()?.querySelector('.branch-line')?.textContent).toBe(BRANCH);
			expect(handOver()?.textContent).toContain('This hand-over is in Claude Code in this window now');
			expect(handOver()?.textContent).toContain('Waiting for the agent to make the branch.');
			expect(spinning(handOver())).toBe(true);
			expect(handOver()?.textContent).not.toMatch(/DSNR reads it from git|by the name its task gives/);
			expect(allByRole('button', 'Save to a branch')).toEqual([]);
			expect(allByRole('button', 'Process changes')).toEqual([]);
			expect(allByRole('button', 'Propose')).toEqual([]);
		});

		it('says why it was not handed over, and opens nothing', async () => {
			await tokensRefused();
			await press(button('Process changes'));
			const call = calls('handOverChanges').at(-1);
			const why = 'The library’s checkout has changes not committed: commit or stash them, then process the changes again.';
			await say({ type: 'answer', id: call?.id, result: { ok: false, error: why } });
			expect(document.querySelector('[data-branch-actions] [role="alert"]')?.textContent).toBe(why);
			expect(handOver()).toBeNull();
		});

		it('lists each file the branch changed, flags what the rules keep out, and proposes it only on a deliberate yes', async () => {
			await designOpen();
			await answerOf('changeScopes', 'values', []);
			await answerOf('changeScopes', 'handOver', ['']);
			await press(count());
			await answerHandOver(null, { branch: BRANCH, lines: ['primary: #000000'], review: READY, pullRequest: null });
			expect(handOver()?.querySelector('.branch-line')?.textContent).toBe(`${BRANCH} · 2 commits`);
			const files = [...(handOver()?.querySelectorAll('[data-hand-over-files] li') ?? [])];
			expect(files.map((f) => f.getAttribute('data-out'))).toEqual([null, 'a story']);
			expect(files[1]?.textContent).toContain('A story, which the rules keep out');
			await press(button('Propose'));
			expect(callsOf('proposeChange', 'handOver')).toEqual([]);
			expect(handOver()?.textContent).toContain('Its pull request says so.');
			await press(button('Cancel'));
			await press(button('Propose'));
			await press(button('Propose anyway'));
			expect(callsOf('proposeChange', 'handOver').at(-1)?.args).toEqual(['handOver', null, { tip: TIP, confirmed: true }]);
			const url = 'https://github.com/flocksafety/flock-react-component-lib/pull/7';
			await answerOf('proposeChange', 'handOver', { branch: BRANCH, lines: [], review: READY, pullRequest: { number: 7, url } });
			expect([...document.querySelectorAll('a')].find((a) => a.textContent === 'Draft pull request #7')?.getAttribute('href')).toBe(url);
			expect(allByRole('button', 'Propose')).toEqual([]);
			await press(button('Start over'));
			expect(callsOf('forgetChange', 'handOver').at(-1)?.args).toEqual(['handOver', null]);
			await answerOf('forgetChange', 'handOver', null);
			expect(handOver()).toBeNull();
		});

		it('proposes an unflagged branch in one press', async () => {
			await designOpen();
			await answerOf('changeScopes', 'values', []);
			await answerOf('changeScopes', 'handOver', ['']);
			await press(count());
			const clean = { ...READY, files: [READY.files[0]] };
			await answerHandOver(null, { branch: BRANCH, lines: [], review: clean, pullRequest: null });
			await press(button('Propose'));
			expect(callsOf('proposeChange', 'handOver').at(-1)?.args).toEqual(['handOver', null, { tip: TIP, confirmed: false }]);
		});

		it('is not offered while the group has a branch DSNR saved', async () => {
			await show();
			await share('placed', { context: OPEN, unreadable: null, setup: null });
			await answer('listProjects', SAMPLE_PROJECTS);
			await press(options()[1]!);
			await share('catalog', { system: { id: SYSTEM, name: 'FUI' }, catalog: SAMPLE_CATALOG, error: null, syncing: false });
			await answerOf('changeBranch', 'tokens', { branch: 'dsnr/tokens-1012-abc123', saved: [], saves: 1, pullRequest: null });
			await share('tokenEdits', EDITS);
			await press(count());
			await answerHandOver(null, null);
			expect(button('Save')).toBeDefined();
			expect(allByRole('button', 'Process changes')).toEqual([]);
		});

		it('previews a ready branch in every page, says so at the top, holds Save back while it is shown, and shows develop again', async () => {
			await designOpen();
			await share('tokenEdits', EDITS);
			await press(count());
			await answerHandOver(null, { branch: BRANCH, lines: [], review: { ...READY, files: [READY.files[0]] }, pullRequest: null });
			await press(button('Preview this branch'));
			expect(calls('showHandOver').at(-1)?.args).toEqual([null]);
			await answer('showHandOver', null);
			await shareCatalog({ ...SAMPLE_CATALOG, commit: 'f00d42', showing: BRANCH } as Catalog);
			const note = document.querySelector('[data-showing]') as HTMLElement;
			expect(note.textContent).toContain(`Showing ${BRANCH}, the agent’s branch, not develop.`);
			expect(button('Stop previewing')).toBeDefined();
			expect(allByRole('button', 'Propose')).toEqual([]);
			await press(button('Show develop'));
			expect(calls('showLibraryBranch')).toHaveLength(1);
			await press(button('Stop previewing'));
			expect(calls('showLibraryBranch')).toHaveLength(2);
		});

		it('holds Save while another branch is shown, and offers no Process changes where Save is the one offered', async () => {
			await show();
			await share('placed', { context: OPEN, unreadable: null, setup: null });
			await answer('listProjects', SAMPLE_PROJECTS);
			await press(options()[1]!);
			await share('catalog', { system: { id: SYSTEM, name: 'FUI' }, catalog: { ...SAMPLE_CATALOG, showing: BRANCH }, error: null, syncing: false });
			await answerOf('changeBranch', 'tokens', null);
			await share('tokenEdits', EDITS);
			await press(count());
			await answerHandOver(null, null);
			expect(button('Save to a branch')?.disabled).toBe(true);
			expect(allByRole('button', 'Process changes')).toEqual([]);
		});

		it('lists a component handed over with nothing tried, by its own hand-over', async () => {
			await designOpen();
			await answerOf('changeScopes', 'values', []);
			await answerOf('changeScopes', 'handOver', ['', BUTTON]);
			await press(count());
			await answerOf('changeBranch', 'values', null);
			await answerHandOver(BUTTON, {
				branch: BRANCH,
				lines: ['FSButton · Height: 28px → 32px'],
				review: { state: 'empty' },
				pullRequest: null,
			});
			expect(group()?.querySelector('[data-hand-over] .branch-line')?.textContent).toBe(BRANCH);
			expect(group()?.textContent).toContain('Waiting for the agent to commit its work.');
			expect(spinning(group())).toBe(true);
		});
	});
});

describe('trying a change to the tokens, saving it to a branch, and proposing it (6.2)', () => {
	const ID = 'flocksafety/flock-react-component-lib';
	const tokensOpen = async () => {
		await show();
		await share('placed', { context: OPEN, unreadable: null, setup: null });
		await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
		await share('catalog', { system: { id: ID, name: 'FUI' }, catalog: SAMPLE_CATALOG, error: null, syncing: false });
		await answerOf('changeBranch', 'tokens', null);
		await press([...document.querySelectorAll<HTMLElement>('[aria-label="Part"] [role="radio"]')][1]!);
	};
	const openChanges = async () => {
		if (!dialog('Changes')) await press(document.querySelector('.ds-actions [aria-label$="being tried"]') as HTMLElement);
	};
	const edited = () => calls('setTokenEdits').at(-1)?.args?.[0];

	it('syncs by asking the extension, which reads it for every page, and shows what it is told it read', async () => {
		await tokensOpen();
		await press(document.querySelector('[aria-label="Design system actions"]') as HTMLElement);
		await press(allByRole('menuitem', undefined, document.querySelector('.ds-actions')!)[0]!);
		expect(lastAsk()).toEqual(['syncDesignSystem', []]);
		await shareCatalog({ ...SAMPLE_CATALOG, commit: 'f00d42' } as Catalog);
		expect(document.querySelector('[data-showing]')).toBeNull();
	});

	it('opens a role’s control: what it points at, and its tone’s steps to point it at another, which keeps the link', async () => {
		await tokensOpen();
		await press(document.querySelector('[aria-label="Change Light primary main"]') as HTMLElement);
		expect(dialog()!.getAttribute('aria-label')).toBe('Light · primary.main');
		expect(dialog()!.querySelector('[data-reference]')?.textContent).toBe('primary.main → pineGreen 50');
		const steps = [...dialog()!.querySelectorAll<HTMLElement>('[aria-label="Steps of pineGreen"] [role="radio"]')];
		expect(steps.map((s) => [s.textContent, s.getAttribute('aria-checked')])).toEqual([
			['50', 'true'],
			['60', 'false'],
		]);
		expect(steps.map((step) => step.title)).toEqual(['pineGreen 50', 'pineGreen 60']);
		expect(dialog()!.querySelector('[data-editor-contrast]')?.textContent).toMatch(/^Contrast with contrastText: \d/);
		await press(steps[1]!);
		expect(edited()).toEqual([{ path: 'palette.light.primary.main', ref: 'tone.pineGreen.60' }]);
	});

	it('gives a color of its own a picker and its hex, applied when entered; a length a slider, applied when let go', async () => {
		await tokensOpen();
		await press(document.querySelector('[aria-label="Color view"] [aria-label="Palette"]') as HTMLElement);
		await press(document.querySelector('[aria-label="Change Tones pineGreen 60"]') as HTMLElement);
		const hex = dialog()!.querySelector('input[aria-label="Hex"]') as HTMLInputElement;
		// Focus starts on the dialog, so no field is drawn as chosen.
		expect(document.activeElement).toBe(dialog());
		expect(document.activeElement).not.toBe(hex);
		await type(hex, '#00aa00');
		await key('Enter', { on: hex });
		expect(edited()).toEqual([{ path: 'tone.pineGreen.60', value: '#00AA00' }]);
		expect(allByRole('button', 'Done', dialog()!)).toEqual([]);
		await press(button('Close', dialog()!));
		expect(dialog()).toBeNull();
		await press(document.querySelector('[aria-label="Change Spacing"]') as HTMLElement);
		const slider = dialog()!.querySelector('input[type="range"]') as HTMLInputElement;
		expect(document.activeElement).toBe(dialog());
		expect(document.activeElement).not.toBe(slider);
		await type(slider, '12');
		await act(async () => void slider.dispatchEvent(new Event('pointerup', { bubbles: true })));
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
		await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
		expect(part.previousElementSibling).toBe(before);
		expect(document.querySelector('.ds-part')).toBe(part);
		expect(document.querySelector('[data-changed-tokens]')).toBeNull();
	});

	it('lists what has been changed, from what it was to what it is, with a reset for each and for all', async () => {
		await tokensOpen();
		await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
		expect(document.querySelector('[data-changed-tokens]')).toBeNull();
		expect(document.querySelector('.ds-actions [aria-label="1 change being tried"]')?.classList.contains('badge-brand')).toBe(true);
		await openChanges();
		const changed = document.querySelector('[data-changed-tokens]') as HTMLElement;
		expect(changed.querySelector('.heading-set')?.textContent).toBe('Tokens 1');
		expect(changed.querySelector('[data-change="tone.pineGreen.60"] .value-drawn')?.textContent).toBe('#15584A → #000000');
		await press(changed.querySelector('[aria-label="Reset Tones pineGreen 60"]') as HTMLElement);
		expect(edited()).toEqual([]);
		// One change has its own undo on its row; Reset is for two or more.
		await share('tokenEdits', [{ path: 'tone.pineGreen.60', value: '#000000' }]);
		expect(allByRole('button', 'Reset', changed)).toEqual([]);
		await share('tokenEdits', [
			{ path: 'tone.pineGreen.60', value: '#000000' },
			{ path: 'tone.pineGreen.50', value: '#111111' },
		]);
		await press(button('Reset', document.querySelector('[data-changed-tokens]') as HTMLElement));
		expect(edited()).toEqual([]);
	});

	it('saves the change to a branch, proposes it as a draft pull request, and starts over, as the core does them', async () => {
		await tokensOpen();
		const edits = [{ path: 'tone.pineGreen.60', value: '#000000' }];
		await share('tokenEdits', edits);
		await openChanges();
		await press(button('Save to a branch'));
		expect(sent.filter((m) => m.name === 'saveChange' && m.args?.[0] === 'tokens').at(-1)?.args).toEqual(['tokens', null, edits]);
		await answerOf('saveChange', 'tokens', { branch: 'dsnr/tokens-1012-abc123', saved: edits, saves: 1, pullRequest: null });
		const actions = document.querySelector('[data-branch-actions]') as HTMLElement;
		expect(actions.querySelector('.branch-line')?.textContent).toBe('dsnr/tokens-1012-abc123 · 1 save');
		expect(allByRole('button', 'Save to a branch')).toEqual([]);
		await press(button('Propose'));
		expect(sent.some((m) => m.name === 'proposeChange' && m.args?.[0] === 'tokens')).toBe(true);
		await answerOf('proposeChange', 'tokens', {
			branch: 'dsnr/tokens-1012-abc123',
			saved: edits,
			saves: 1,
			pullRequest: { number: 12, url: 'https://github.com/flocksafety/flock-react-component-lib/pull/12', chromatic: null },
		});
		const link = [...document.querySelectorAll('a')].find((a) => a.textContent === 'Draft pull request #12');
		expect(link?.getAttribute('href')).toBe('https://github.com/flocksafety/flock-react-component-lib/pull/12');
		await press(button('Start over'));
		await answerOf('forgetChange', 'tokens', null);
		expect(edited()).toEqual([]);
		expect(document.querySelector('[data-changed-tokens]')).toBeNull();
		expect(dialog('Changes')?.textContent).toContain('No changes yet');
	});

	it('says why a save failed, and keeps the change', async () => {
		await tokensOpen();
		await share('tokenEdits', [{ path: 'spacing', value: '12px' }]);
		await openChanges();
		await press(button('Save to a branch'));
		const call = sent.filter((m) => m.name === 'saveChange' && m.args?.[0] === 'tokens').at(-1);
		await say({ type: 'answer', id: call?.id, result: { ok: false, error: 'git is not signed in to GitHub.' } });
		expect(document.querySelector('[data-branch-actions] [role="alert"]')?.textContent).toBe('git is not signed in to GitHub.');
		expect(document.querySelector('[data-changed-tokens] .heading-set')?.textContent).toBe('Tokens 1');
	});

	it('puts back a change saved before DSNR was last closed, when none is being tried', async () => {
		await show();
		await share('placed', { context: OPEN, unreadable: null, setup: null });
		await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
		await share('catalog', { system: { id: ID, name: 'FUI' }, catalog: SAMPLE_CATALOG, error: null, syncing: false });
		const saved = [{ path: 'radius', value: '8px' }];
		await answerOf('changeBranch', 'tokens', { branch: 'dsnr/tokens-1012-abc123', saved, saves: 2, pullRequest: null });
		expect(edited()).toEqual(saved);
	});
});

describe('what the person edited in the design system’s code, read from their checkout', () => {
	const SYSTEM = 'flocksafety/flock-react-component-lib';
	const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
	const EDITED = {
		state: 'ready',
		base: 'b'.repeat(40),
		components: [
			{
				file: BUTTON,
				files: [
					{ path: 'src/components/FSButton/index.tsx', edit: 'changed' },
					{ path: 'src/components/FSButton/sizes.ts', edit: 'moved', to: 'src/components/FSChip/sizes.ts' },
				],
			},
			{ file: 'src/components/FSTag/FSTag.stories.tsx', files: [{ path: 'src/components/FSTag/FSTag.tsx', edit: 'added' }] },
		],
		unowned: [{ path: 'src/utils/theme.ts', edit: 'changed' }],
		outside: [{ path: 'cli/src/commands/cli.ts', edit: 'changed' }],
	};
	const designOpen = async () => {
		await show();
		await share('placed', { context: OPEN, unreadable: null, setup: null });
		await answer('listProjects', SAMPLE_PROJECTS);
		await press(options()[1]!);
		await share('catalog', { system: { id: SYSTEM, name: 'FUI' }, catalog: SAMPLE_CATALOG, error: null, syncing: false });
		await answerOf('changeBranch', 'tokens', null);
	};
	const count = () => document.querySelector('.ds-actions .badge-brand') as HTMLElement | null;
	const section = () => dialog('Changes')?.querySelector('[data-edited-in-code]') as HTMLElement | null;
	afterEach(() => void vi.useRealTimers());

	it('is not counted, or shown, when nothing is edited', async () => {
		await designOpen();
		await answer('editedInCode', { state: 'none' });
		expect(count()).toBeNull();
	});

	it('counts each component edited, and the files in none once, and says so apart from what is being tried', async () => {
		await designOpen();
		await answer('editedInCode', EDITED);
		expect(count()?.getAttribute('aria-label')).toBe('3 edited in your code');
		await share('valueTrials', { [BUTTON]: { commit: 'abc123', values: [{ property: 'height', value: '32px', targets: ['height:sm:0'] }] } });
		expect(count()?.getAttribute('aria-label')).toBe('1 change being tried, 3 edited in your code');
	});

	it('lists, in Changes, each component by its name with its files, the files in none, and what is outside and stays in the branch', async () => {
		await designOpen();
		await answer('editedInCode', EDITED);
		await press(count()!);
		const groups = [...section()!.querySelectorAll<HTMLElement>('.value-group')];
		expect(groups.map((g) => g.querySelector('h3')?.textContent)).toEqual([
			'FSButton2 files',
			'FSTag1 file',
			'In no component’s folder1 file',
			'Outside the design system1 file',
		]);
		expect([...groups[0]!.querySelectorAll('[data-edited-file]')].map((f) => f.textContent)).toEqual([
			'src/components/FSButton/index.tsxchanged',
			'src/components/FSButton/sizes.tsmoved to src/components/FSChip/sizes.ts',
		]);
		// A component the library does not list yet (a story the person added) is named by its story, not linked.
		expect(groups[1]!.querySelector('button')).toBeNull();
		// What the heading says is not said again under it.
		expect(groups[3]!.querySelector('h3')?.textContent).toContain('Outside the design system');
		expect(section()!.textContent).not.toMatch(/These stay in your branch|since your branch left|read from git/);
	});

	it('opens a component edited at its tab', async () => {
		await designOpen();
		await answer('editedInCode', EDITED);
		await press(count()!);
		await press(section()!.querySelector('[data-edited-component] button') as HTMLElement);
		expect(calls('openComponent').at(-1)?.args).toEqual([BUTTON]);
	});

	it('draws what the edits move, in the background, as a token change is drawn', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
		await designOpen();
		await answer('editedInCode', EDITED);
		await press(count()!);
		expect(calls('editedReach')).toHaveLength(1);
		await answer('editedReach', { state: 'building' });
		expect(dialog('Changes')!.textContent).toContain('Thinking…');
		await act(async () => void (await vi.advanceTimersByTimeAsync(ASK_EVERY_MS)));
		expect(calls('editedReach')).toHaveLength(2);
		await answer('editedReach', { state: 'ready', moved: [{ file: BUTTON, changes: [], inside: true }], unchanged: 6, notDrawn: [] });
		const reach = dialog('Changes')!.querySelector('[data-reach]') as HTMLElement;
		// In the code edits' own card, at its bottom, closed.
		expect(section()!.lastElementChild).toBe(reach);
		expect(reach.querySelector('summary')?.textContent).toBe('1 component affected');
		await press(reach.querySelector('summary') as HTMLElement);
		expect(reach.querySelector('[data-moved]')?.textContent).toContain('FSButton');
	});

	it('says why what the edits move is not drawn, where it cannot be', async () => {
		await designOpen();
		await answer('editedInCode', EDITED);
		await press(count()!);
		await answer('editedReach', { state: 'failed', error: 'src/components/FSButton/sizes.ts is moved, and the drawing can only change files.' });
		expect(dialog('Changes')!.textContent).toContain('src/components/FSButton/sizes.ts is moved, and the drawing can only change files.');
	});

	describe('the pull requests a split would make', () => {
		const UNITS = [
			{ file: null, files: [{ path: 'src/utils/theme.ts', edit: 'changed' }], lines: 3, large: false },
			{ file: BUTTON, files: [{ path: 'src/components/FSButton/index.tsx', edit: 'changed' }], lines: 12, large: false },
			{ file: 'src/components/FSTag/FSTag.stories.tsx', files: [{ path: 'src/components/FSTag/FSTag.tsx', edit: 'added' }], lines: 400, large: true },
		];
		const READY = {
			state: 'ready',
			tip: 'c'.repeat(40),
			seen: 'e'.repeat(64),
			units: UNITS,
			stays: [{ file: { path: 'package-lock.json', edit: 'changed' }, why: 'a lockfile' }],
			check: { state: 'not-checked' },
		};
		const split = () => section()!.querySelector('[data-split]') as HTMLElement;
		const units = () => [...split().querySelectorAll('[data-split-unit]')].map((u) => u.textContent);
		const prepared = async (check: unknown = READY.check) => {
			await designOpen();
			await answer('editedInCode', EDITED);
			await press(count()!);
			expect(calls('splitPreview')).toHaveLength(0);
			await press(button('Prepare pull requests', section()!)!);
			await answer('splitPreview', { ...READY, check });
		};

		it('is asked for only once Prepare is pressed, and lists each with its files and lines, unchecked, and what stays', async () => {
			await prepared();
			expect(split().querySelector('h3')?.textContent).toBe('3 pull requestsagainst develop');
			expect(units()).toEqual([
				'1. utils/theme.ts1 file, 3 lines',
				'2. FSButton1 file, 12 lines',
				'3. FSTag1 file, 400 lines · more than is read in one sitting',
			]);
			expect(split().querySelector('[data-split-stays]')?.textContent).toBe('package-lock.jsona lockfile');
			expect(button('Check that they build', split())).not.toBeNull();
		});

		it('checks in the background, with a line of how far it is and Stop', async () => {
			await prepared();
			await press(button('Check that they build', split())!);
			expect(calls('checkSplit')).toHaveLength(1);
			await answer('checkSplit', null);
			await answer('splitPreview', { ...READY, check: { state: 'checking', done: 2, doing: 'FSButton, alone' } });
			expect(split().querySelector('[data-split-checking]')?.textContent?.trim()).toBe('Checking FSButton, alone… (2 checks done)');
			expect(spinning(split().querySelector('[data-split-checking]'))).toBe(true);
			await press(button('Stop', split())!);
			expect(calls('stopSplitCheck')).toHaveLength(1);
		});

		it('lists them in merge order once checked, each on what it stands on and why', async () => {
			const stacks = [
				{ unit: 0, on: null },
				{ unit: 2, on: null },
				{ unit: 1, on: 0 },
			];
			await prepared({ state: 'built', stacks, seconds: 7, by: 'TypeScript, against its tsconfig.json' });
			expect(units()).toEqual([
				'1. utils/theme.ts1 file, 3 lines · on develop',
				'2. FSTag1 file, 400 lines · on develop · more than is read in one sitting',
				'3. FSButton1 file, 12 lines · on utils/theme.ts: it does not build without it',
			]);
			expect(split().querySelector('[data-split-built]')?.textContent).toBe(
				'Each builds on what it stands on, checked by TypeScript, against its tsconfig.json in 7 s.',
			);
		});

		it('refuses, in words, units that need each other, and says what the person can do', async () => {
			await prepared({ state: 'cycle', units: [1, 2] });
			expect(split().querySelector('[data-split-refused]')?.textContent?.trim()).toBe(
				'FSButton and FSTag each need the other, so they are not split. Propose the whole change as one pull request yourself, or split the work so one stands alone.',
			);
		});

		it('says why it cannot be checked, and still lists them', async () => {
			await prepared({ state: 'unproven', why: 'It has no tsconfig.json.' });
			expect(split().querySelector('[data-split-unproven]')?.textContent?.trim()).toBe('Not checked: It has no tsconfig.json.');
			expect(units()).toHaveLength(3);
		});

		describe('proposed', () => {
			const PROPOSAL = {
				seen: 's'.repeat(64),
				baseBranch: 'develop',
				opened: 3,
				parts: [
					{
						name: 'theme.ts',
						branch: 'dsnr/split-20261020-aaaa',
						on: null,
						pullRequest: { number: 11, url: 'https://github.com/o/ds/pull/11' },
						divergence: { state: 'same' },
					},
					{
						name: 'FSTag',
						branch: 'dsnr/split-20261020-bbbb',
						on: null,
						pullRequest: { number: 12, url: 'https://github.com/o/ds/pull/12' },
						divergence: { state: 'added', commits: 1, by: ['A Reviewer'], files: ['src/components/FSTag/FSTag.tsx'] },
					},
					{
						name: 'FSButton',
						branch: 'dsnr/split-20261020-cccc',
						on: 0,
						pullRequest: { number: 13, url: 'https://github.com/o/ds/pull/13' },
						divergence: { state: 'rewritten', sameChange: false, files: ['src/components/FSButton/index.tsx'] },
					},
				],
			};
			const BUILT = {
				state: 'built',
				stacks: [
					{ unit: 0, on: null },
					{ unit: 2, on: null },
					{ unit: 1, on: 0 },
				],
				seconds: 7,
				by: 'TypeScript',
			};
			const proposed = () => section()!.querySelector('[data-split-proposed]') as HTMLElement;

			it('proposes what was checked once it builds, on purpose where a part is large, and then shows each draft', async () => {
				await prepared(BUILT);
				await answer('splitProposal', null);
				await press(button('Propose anyway', split())!);
				expect(calls('proposeSplit').at(-1)?.args).toEqual([READY.seen, true]);
				await answer('proposeSplit', PROPOSAL);
				await answer('splitProposal', PROPOSAL);
				expect([...proposed().querySelectorAll('[data-split-part]')].map((p) => p.querySelector('.value-place')?.textContent)).toEqual([
					'Draft pull request #11 · on develop',
					'Draft pull request #12 · on develop',
					'Draft pull request #13 · on theme.ts',
				]);
				expect(proposed().querySelector('a')?.getAttribute('href')).toBe('https://github.com/o/ds/pull/11');
				expect([...proposed().querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Start over']);
			});

			it('says what each draft has that the person’s branch does not', async () => {
				await prepared(BUILT);
				await answer('splitProposal', PROPOSAL);
				const said = [...proposed().querySelectorAll('[data-split-diverged]')].map((d) => d.textContent?.trim());
				expect(said).toEqual([
					'It has 1 commit your branch does not, by A Reviewer: src/components/FSTag/FSTag.tsx.',
					'Rewritten on GitHub since DSNR opened it, and its change is not yours now: src/components/FSButton/index.tsx.',
				]);
			});

			it('offers Continue where it stopped partway, proposing the same split again, and Start over', async () => {
				await prepared(BUILT);
				const partway = {
					...PROPOSAL,
					opened: 1,
					parts: PROPOSAL.parts.map((p, i) => (i === 0 ? p : { ...p, pullRequest: null, divergence: null })),
				};
				await answer('splitProposal', partway);
				expect(proposed().querySelectorAll('[data-split-part]')[1]?.querySelector('.value-place')?.textContent).toBe('Not opened yet · on develop');
				await press(button('Continue', proposed())!);
				expect(calls('proposeSplit').at(-1)?.args).toEqual([PROPOSAL.seen, false]);
				await answer('proposeSplit', PROPOSAL);
				await answer('splitProposal', partway);
				await press(button('Start over', proposed())!);
				expect(calls('startSplitOver')).toHaveLength(1);
			});

			it('says why a proposal was refused', async () => {
				await prepared(BUILT);
				await answer('splitProposal', null);
				await press(button('Propose anyway', split())!);
				await say({
					type: 'answer',
					id: calls('proposeSplit').at(-1)!.id,
					result: { ok: false, error: 'Your edits have changed since they were checked.' },
				});
				expect(split().textContent).toContain('Your edits have changed since they were checked.');
			});
		});

		it('proposes without asking twice when it builds and nothing is large, and sends anyway where it is not proven', async () => {
			const small = { ...READY, units: UNITS.map((u) => ({ ...u, large: false })) };
			await designOpen();
			await answer('editedInCode', EDITED);
			await press(count()!);
			await answer('splitProposal', null);
			await press(button('Prepare pull requests', section()!)!);
			await answer('splitPreview', {
				...small,
				check: {
					state: 'built',
					stacks: [
						{ unit: 0, on: null },
						{ unit: 1, on: null },
						{ unit: 2, on: null },
					],
					seconds: 3,
					by: 'TypeScript',
				},
			});
			await press(button('Propose 3 pull requests', split())!);
			expect(calls('proposeSplit').at(-1)?.args).toEqual([READY.seen, false]);
		});

		it('says a change in too many parts is not split', async () => {
			await designOpen();
			await answer('editedInCode', EDITED);
			await press(count()!);
			await press(button('Prepare pull requests', section()!)!);
			await answer('splitPreview', { state: 'not-split', parts: 14 });
			expect(section()!.querySelector('[data-split-not-split]')?.textContent).toContain(
				'This would be 14 pull requests, one for each component and shared file it changes.',
			);
		});
	});

	it('follows the checkout as it is edited, and asks nothing while the panel is hidden', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
		await designOpen();
		await answer('editedInCode', { state: 'none' });
		const asked = calls('editedInCode').length;
		await act(async () => void (await vi.advanceTimersByTimeAsync(READ_EVERY_MS)));
		expect(calls('editedInCode').length).toBe(asked + 1);
		await answer('editedInCode', EDITED);
		expect(count()?.getAttribute('aria-label')).toBe('3 edited in your code');
		const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
		const now = calls('editedInCode').length;
		await act(async () => void (await vi.advanceTimersByTimeAsync(READ_EVERY_MS * 3)));
		expect(calls('editedInCode').length).toBe(now);
		hidden.mockRestore();
	});
});
