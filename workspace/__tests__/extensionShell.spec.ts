import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VsCodeGitHub } from '../extension/src/github';
import { claudeLink, moveLocationSetting } from '../extension/src/agentWindows';
import { claudeCode } from '../src/core/services/agent/claudeCode';
import { codex } from '../src/core/services/agent/codex';
import { copilot } from '../src/core/services/agent/copilot';
import { openableLink, vscodePorts } from '../extension/src/vscodePorts';
import { NO_TABS_SHOWN, reviewsOf } from '../extension/src/messages';
import { Reviews, answerReview, reviewPage, reviewPath } from '../extension/src/review';
import { Panels, answerCall, hostApi } from '../extension/src/bridge';
import type { Route } from '../src/core/handle';
import { PrototypeServer } from '../src/core/services/prototypes/prototypeServer';
import type { InvokeName } from '../src/shared/contract';
import type { ProjectWork } from '../src/shared/domain/projects';

const user = { login: 'noah', name: 'Noah', avatar_url: 'https://avatars.githubusercontent.com/u/1' };
const fetcher = vi.fn(async (url: string) => ({
	ok: true,
	status: 200,
	headers: { get: () => null },
	json: async () => (String(url).endsWith('/user') ? user : {}),
	text: async () => '',
}));
const auth = (session: { accessToken: string } | undefined) => ({
	getSession: vi.fn(async (_p: string, _s: readonly string[], o: { silent?: boolean; createIfNone?: boolean }) =>
		o.createIfNone ? (session ?? { accessToken: 'new' }) : session,
	),
	onDidChangeSessions: vi.fn(() => ({ dispose: () => undefined })),
});
const memento = () => {
	const kept = new Map<string, unknown>();
	return { get: <T>(k: string) => kept.get(k) as T | undefined, update: async (k: string, v: unknown) => void kept.set(k, v) };
};

describe('the person’s GitHub account, through VS Code', () => {
	it('restores a session VS Code already has, without asking, and says who it is', async () => {
		const a = auth({ accessToken: 't' });
		const github = new VsCodeGitHub(a as never, fetcher as never, memento(), vi.fn());
		expect(await github.restore()).toEqual({ state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: user.avatar_url } });
		expect(a.getSession.mock.calls[0]?.[2]).toEqual({ silent: true });
	});

	it('is signed out with no session, and signs in only when asked, through VS Code', async () => {
		const a = auth(undefined);
		const changed = vi.fn();
		const github = new VsCodeGitHub(a as never, fetcher as never, memento(), changed);
		expect(await github.restore()).toEqual({ state: 'signedOut' });
		await github.signIn();
		expect(a.getSession.mock.calls.at(-1)?.[2]).toEqual({ createIfNone: true });
		expect(github.state().state).toBe('signedIn');
		expect(changed).toHaveBeenLastCalledWith(github.state());
	});

	it('stays signed out after Sign out, even though VS Code keeps its session, until signed in again', async () => {
		const kept = memento();
		const github = new VsCodeGitHub(auth({ accessToken: 't' }) as never, fetcher as never, kept, vi.fn());
		await github.restore();
		github.signOut();
		expect(github.state()).toEqual({ state: 'signedOut' });
		const again = new VsCodeGitHub(auth({ accessToken: 't' }) as never, fetcher as never, kept, vi.fn());
		expect(await again.restore()).toEqual({ state: 'signedOut' });
		await again.signIn();
		expect(again.state().state).toBe('signedIn');
	});

	it('calls GitHub as the person, and asks for sign-in when there is no session', async () => {
		const github = new VsCodeGitHub(auth(undefined) as never, fetcher as never, memento(), vi.fn());
		await expect(github.api('/user')).rejects.toThrow(/Sign in/);
	});
});

let settings: Record<string, unknown> = {};
const terminalShown = vi.fn();
interface FakeList {
	items: { id: string; label: string; description: string }[];
	activeItems: unknown[];
	selectedItems: unknown[];
	buttons: { iconPath: { id: string } }[];
	title: string;
	placeholder: string;
	show: () => void;
	hide: () => void;
	dispose: () => void;
	onDidAccept: (f: () => void) => void;
	onDidHide: (f: () => void) => void;
	onDidTriggerButton: (f: () => void) => void;
	press: { accept: () => void; pin: () => void };
}
const lists: FakeList[] = [];
/** VS Code's quick pick, as far as DSNR uses it: what it was given, and the person's presses. */
const quickPick = (): FakeList => {
	const on: Record<string, () => void> = {};
	const list: FakeList = {
		items: [] as { id: string; label: string; description: string }[],
		activeItems: [] as unknown[],
		selectedItems: [] as unknown[],
		buttons: [] as { iconPath: { id: string } }[],
		title: '',
		placeholder: '',
		show: vi.fn(),
		hide: () => on.hide?.(),
		dispose: vi.fn(),
		onDidAccept: (f: () => void) => void (on.accept = f),
		onDidHide: (f: () => void) => void (on.hide = f),
		onDidTriggerButton: (f: () => void) => void (on.button = f),
		press: { accept: () => on.accept?.(), pin: () => on.button?.() },
	};
	lists.push(list);
	return list;
};

describe('VS Code’s ports', () => {
	beforeEach(() => {
		settings = {};
		terminalShown.mockClear();
		lists.length = 0;
	});
	const claude = claudeCode({ locate: () => '/bin/claude', run: async () => ({ stdout: '', stderr: '' }), spawnProcess: (() => null) as never });
	const fake = () => ({
		window: {
			showOpenDialog: vi.fn(async (_options: unknown) => [{ fsPath: '/picked' }]),
			showInformationMessage: vi.fn(async () => undefined),
			createTerminal: vi.fn((_options: unknown) => ({ show: terminalShown })),
			createQuickPick: vi.fn(() => quickPick()),
		},
		ThemeIcon: class {
			constructor(readonly id: string) {}
		},
		lm: { selectChatModels: vi.fn(async (_selector: unknown): Promise<unknown[]> => []) },
		ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
		env: { openExternal: vi.fn(async (_uri: unknown) => true), clipboard: { writeText: vi.fn(async () => undefined) } },
		commands: {
			executeCommand: vi.fn(async (_id: string, ..._args: unknown[]) => undefined),
			getCommands: vi.fn(async (_internal?: boolean) => ['workbench.action.chat.open']),
		},
		Uri: { file: (p: string) => ({ fsPath: p }), parse: (u: string) => ({ toString: () => u }) },
		extensions: { getExtension: vi.fn((id: string) => (id === 'anthropic.claude-code' ? { id } : undefined)) },
		workspace: {
			workspaceFolders: [{ uri: { fsPath: '/work/coke' } }],
			getConfiguration: vi.fn((section: string) => ({ get: (key: string, fallback?: unknown) => settings[`${section}.${key}`] ?? fallback })),
		},
	});
	const none = { draw: vi.fn(), scan: vi.fn(), measure: vi.fn() };

	it('are VS Code’s own: its folder picker, its messages, its links, its clipboard, its reveal', async () => {
		const v = fake();
		const ports = vscodePorts(v as never, { draw: vi.fn(), scan: vi.fn(), measure: vi.fn() });
		expect(await ports.chooseFolder({ title: 'Choose design system' })).toBe('/picked');
		expect(v.window.showOpenDialog.mock.calls[0]?.[0]).toMatchObject({
			title: 'Choose design system',
			canSelectFolders: true,
			canSelectFiles: false,
		});
		// A notification, never a box that stops the window.
		await ports.tell({ message: 'Done.', detail: 'It is.' });
		expect(v.window.showInformationMessage).toHaveBeenCalledWith('Done. It is.');
		await ports.copy('x');
		expect(v.env.clipboard.writeText).toHaveBeenCalledWith('x');
		await ports.openPath('/a');
		expect(v.commands.executeCommand).toHaveBeenCalledWith('revealFileInOS', { fsPath: '/a' });
	});

	it('open only web pages and this machine’s own in the browser: no other scheme a page might hand them', async () => {
		const v = fake();
		const ports = vscodePorts(v as never, { draw: vi.fn(), scan: vi.fn(), measure: vi.fn() });
		// This machine by either of its names: DSNR's own server, and a product's dev server, which says localhost (Run locally).
		for (const url of ['https://github.com/x/y/pull/1', 'http://127.0.0.1:4321/review/a/', 'http://localhost:3000/organization/o?tab=usage'])
			expect(openableLink(url), url).toBe(true);
		for (const url of [
			'http://example.com/',
			'http://localhost.example.com/',
			'http://127.0.0.1.example.com/',
			'file:///etc/passwd',
			'command:workbench.action.reloadWindow',
			'vscode://x/y',
			'not a link',
		])
			expect(openableLink(url), url).toBe(false);
		await ports.openExternal('https://github.com/x/y');
		expect(v.env.openExternal).toHaveBeenCalledTimes(1);
		await expect(ports.openExternal('command:workbench.action.reloadWindow')).rejects.toThrow(/opens only web pages/);
		expect(v.env.openExternal).toHaveBeenCalledTimes(1);
	});

	const SIDEBAR = 'claude-vscode.sidebar.open';
	const OPEN = 'claude-vscode.editor.open';
	const WHERE = { programmatic: 'honor-preferred-location' };
	/** Claude Code's sidebar command saves its own setting a moment later, without waiting. */
	const savesLater = (v: ReturnType<typeof fake>) =>
		v.commands.executeCommand.mockImplementation(async (id: string) => {
			if (id === SIDEBAR) setTimeout(() => (settings['claudeCode.preferredLocation'] = 'sidebar'), 30);
		});

	it('hand work to Claude Code in this window, in its side panel by default: shown first, and opened once Claude Code has it as its place', async () => {
		const v = fake();
		savesLater(v);
		let placeWhenOpened: unknown;
		const opened = v.commands.executeCommand.getMockImplementation()!;
		v.commands.executeCommand.mockImplementation(async (id: string, ...args: unknown[]) => {
			if (id === OPEN) placeWhenOpened = settings['claudeCode.preferredLocation'];
			return opened(id, ...args);
		});
		const { agentWindow } = vscodePorts(v as never, none);
		expect(await agentWindow.open(claude, '/work/coke', 'Build it.')).toBe('typed');
		expect(v.commands.executeCommand.mock.calls).toEqual([[SIDEBAR], [OPEN, undefined, 'Build it.', undefined, undefined, undefined, WHERE]]);
		// Opened only once Claude Code has saved the sidebar as its place; sooner, it reads its last place, an editor tab.
		expect(placeWhenOpened).toBe('sidebar');
		expect(v.env.openExternal).not.toHaveBeenCalled();
	});

	it('open it there at once when Claude Code already keeps its conversations in its side panel', async () => {
		const v = fake();
		settings['claudeCode.preferredLocation'] = 'sidebar';
		await vscodePorts(v as never, none).agentWindow.open(claude, '/work/coke', 'Build it.');
		expect(v.commands.executeCommand.mock.calls).toEqual([[OPEN, undefined, 'Build it.', undefined, undefined, undefined, WHERE]]);
	});

	it('hand it to an editor tab instead, when that is the person’s setting', async () => {
		const v = fake();
		settings['dsnr.agent.location'] = 'editor';
		await vscodePorts(v as never, none).agentWindow.open(claude, '/work/coke', 'Build it.');
		expect(v.commands.executeCommand.mock.calls).toEqual([[OPEN, undefined, 'Build it.']]);
	});

	it('give Claude Code’s link the prompt whole, whatever it holds', () => {
		const link = claudeLink('Build Version 1 into the codebase: read /tmp/a b.md & do it');
		expect(link.startsWith('vscode://anthropic.claude-code/open?prompt=')).toBe(true);
		expect(new URLSearchParams(link.split('?')[1]).get('prompt')).toBe('Build Version 1 into the codebase: read /tmp/a b.md & do it');
	});

	it('fall back to Claude Code’s link (an editor tab) when its open command is not there, as in another version', async () => {
		const v = fake();
		v.commands.executeCommand.mockImplementation(async (id: string) => {
			if (id.startsWith('claude-vscode.')) throw new Error(`command '${id}' not found`);
		});
		await vscodePorts(v as never, none).agentWindow.open(claude, '/work/coke', 'Build it.');
		expect(String(v.env.openExternal.mock.calls.at(-1)?.[0])).toBe('vscode://anthropic.claude-code/open?prompt=Build+it.');
	});

	it('open a folder that is not in this window in a window of its own, and say there is no window without Claude Code', async () => {
		const v = fake();
		await vscodePorts(v as never, none).agentWindow.open(claude, '/work/other', 'Build it.');
		expect(v.commands.executeCommand).toHaveBeenCalledWith('vscode.openFolder', { fsPath: '/work/other' }, { forceNewWindow: true });
		v.extensions.getExtension.mockReturnValue(undefined as never);
		v.commands.executeCommand.mockClear();
		expect(await vscodePorts(v as never, none).agentWindow.open(claude, '/work/coke', 'Build it.')).toBeNull();
		expect(v.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('start Codex in a terminal of its own in the folder, with the prompt as its argument, no shell between to quote it', async () => {
		const v = fake();
		const agent = codex({ locate: () => '/bin/codex', run: async () => ({ stdout: '', stderr: '' }) });
		expect(await vscodePorts(v as never, none).agentWindow.open(agent, '/work/coke', 'Build it, "now".')).toBe('started');
		expect(v.window.createTerminal).toHaveBeenCalledWith({
			name: 'Codex',
			cwd: '/work/coke',
			shellPath: '/bin/codex',
			shellArgs: ['--no-daemon', 'Build it, "now".'],
		});
		expect(terminalShown).toHaveBeenCalled();
		expect(v.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('hand Copilot its task in VS Code’s Chat, in agent mode, typed in and not sent, in the folder’s window', async () => {
		const v = fake();
		const agent = copilot({ locate: () => '/bin/copilot' });
		expect(await vscodePorts(v as never, none).agentWindow.open(agent, '/work/coke', 'Build it.')).toBe('typed');
		expect(v.commands.executeCommand.mock.calls).toEqual([
			['workbench.action.chat.open', { query: 'Build it.', mode: 'agent', isPartialQuery: true }],
		]);
		expect(v.window.createTerminal).not.toHaveBeenCalled();
	});

	it('start Copilot’s command line in a terminal instead, sending the task, when this VS Code has no Chat', async () => {
		const v = fake();
		v.commands.getCommands.mockResolvedValue([]);
		const agent = copilot({ locate: () => '/bin/copilot' });
		expect(await vscodePorts(v as never, none).agentWindow.open(agent, '/work/coke', 'Build it.')).toBe('started');
		expect(v.window.createTerminal).toHaveBeenCalledWith({
			name: 'GitHub Copilot',
			cwd: '/work/coke',
			shellPath: '/bin/copilot',
			shellArgs: ['-i', 'Build it.'],
		});
		expect(v.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('hand work to the agent the person chose, and ask until they choose, or for a choice it does not know', () => {
		const choice = (value?: unknown) => {
			settings = value === undefined ? {} : { 'dsnr.agent.use': value };
			return vscodePorts(fake() as never, none).agentChoice();
		};
		expect(choice()).toBe('ask');
		expect(choice('codex')).toBe('codex');
		expect(choice('copilot')).toBe('copilot');
		expect(choice('claude-code')).toBe('claude-code');
		expect(choice('someone else')).toBe('ask');
	});

	it('ask which agent in VS Code’s own list, saying which are signed in and which is used now, kept every time until the pin is pressed', async () => {
		const v = fake();
		const ports = vscodePorts(v as never, none);
		const offered = [
			{ id: 'claude-code' as const, name: 'Claude Code', readiness: { state: 'ready' as const } },
			{ id: 'copilot' as const, name: 'GitHub Copilot', readiness: { state: 'unknown' as const } },
		];
		const picked = ports.pickAgent(offered, null, 'claude-code');
		const list = lists[0]!;
		expect(list.title).toBe('Which agent do you want to use?');
		expect(list.placeholder).toMatch(/a conversation with one does not/);
		expect(list.items.map((i) => [i.label, i.description])).toEqual([
			['Claude Code', 'signed in · used now'],
			['GitHub Copilot', 'not sure it is signed in'],
		]);
		expect(list.activeItems).toEqual([list.items[0]]);
		expect(list.buttons[0]!.iconPath.id).toBe('pinned');
		list.press.pin();
		expect(list.buttons[0]!.iconPath.id).toBe('pin');
		list.selectedItems = [list.items[1]];
		list.press.accept();
		expect(await picked).toEqual({ id: 'copilot', keep: false });
		const dismissed = ports.pickAgent(offered, 'Codex is not signed in.', 'codex');
		expect(lists[1]!.placeholder).toBe('Codex is not signed in.');
		lists[1]!.hide();
		expect(await dismissed).toBeNull();
	});

	it('keep the choice at the person’s level, and say ask until there is one', async () => {
		const v = fake();
		const update = vi.fn(async () => undefined);
		v.workspace.getConfiguration = vi.fn((section: string) => ({
			get: (key: string, fallback?: unknown) => settings[`${section}.${key}`] ?? fallback,
			update,
		})) as never;
		const ports = vscodePorts(v as never, none);
		expect(ports.agentChoice()).toBe('ask');
		await ports.keepAgent('codex');
		expect(update).toHaveBeenCalledWith('use', 'codex', 1);
	});

	it('say Copilot is signed in when VS Code offers its models, and that it cannot tell when it does not', async () => {
		const v = fake();
		const agent = copilot({ locate: () => '/bin/copilot' });
		expect(await vscodePorts(v as never, none).agentWindow.signedIn(agent)).toBeNull();
		v.lm.selectChatModels.mockResolvedValue([{ id: 'gpt' }]);
		expect(await vscodePorts(v as never, none).agentWindow.signedIn(agent)).toBe(true);
		expect(v.lm.selectChatModels).toHaveBeenCalledWith({ vendor: 'copilot' });
		expect(
			await vscodePorts(v as never, none).agentWindow.signedIn(
				claudeCode({ locate: () => 'c', run: async () => ({ stdout: '', stderr: '' }), spawnProcess: (() => null) as never }),
			),
		).toBeNull();
	});

	it('move a location set under the setting’s old name to its new one, at each level it was set, once', async () => {
		const values = new Map<string, unknown>([
			['dsnr.claudeCode.location@1', 'editor'],
			['dsnr.claudeCode.location@2', 'sidebar'],
		]);
		const config = (section: string) => ({
			inspect: (key: string) => ({ globalValue: values.get(`${section}.${key}@1`), workspaceValue: values.get(`${section}.${key}@2`) }),
			update: async (key: string, value: unknown, target: number) =>
				void (value === undefined ? values.delete(`${section}.${key}@${target}`) : values.set(`${section}.${key}@${target}`, value)),
		});
		const v = { workspace: { getConfiguration: config }, ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 } };
		expect(await moveLocationSetting(v as never)).toBe(true);
		expect(Object.fromEntries(values)).toEqual({ 'dsnr.agent.location@1': 'editor', 'dsnr.agent.location@2': 'sidebar' });
		expect(await moveLocationSetting(v as never)).toBe(false);
	});

	it('draw and check out of sight with the headless browser they are given', () => {
		const headless = { draw: vi.fn(), scan: vi.fn(), measure: vi.fn() };
		expect(vscodePorts(fake() as never, headless).headless).toBe(headless);
	});
});

describe('a prototype’s review', () => {
	it('is its page on the site, by version, as the site lays it out', () => {
		expect(reviewPath('alert-history', 'v2')).toBe('alert-history/v2/');
		expect(reviewPath('admin-usage', 'v1')).toBe('admin-usage/v1/');
		expect(() => reviewPath('admin-usage', 'codebase')).toThrow(/not a prototype/);
	});

	it('is each of a project’s prototypes that has a page, newest first, titled with its project and its label', () => {
		const record = (name: string, branch: string, createdAt: string) => ({ name, branch, createdAt }) as ProjectWork;
		const project = {
			id: 'alert-history',
			title: 'Alert history',
			work: [
				record('v1', 'prototype/alert-history/v1', '2026-10-01'),
				record('v2', 'prototype/alert-history/v2', '2026-10-03'),
				record('codebase', 'feature/alert-history', '2026-10-04'),
			],
		};
		expect(reviewsOf(project)).toEqual([
			{ projectId: 'alert-history', name: 'v2', title: 'Alert history · Version 2' },
			{ projectId: 'alert-history', name: 'v1', title: 'Alert history · Version 1' },
		]);
	});

	it('frames only the page, from this machine, with its title as text, and runs only its own script', () => {
		const page = reviewPage({ src: 'http://127.0.0.1:5000/a/v1/', title: 'Fish & <chips> "now"', nonce: 'n1' });
		expect(page).toContain("default-src 'none'; frame-src http://127.0.0.1:5000; style-src 'nonce-n1'; script-src 'nonce-n1'");
		expect([...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])).toEqual(['<script nonce="n1">']);
		// A real browser checks this script's behaviour in `reviewIsolation.integration.spec.ts`.
		expect(page).toContain(`__fdPage.startReviewTab("http://127.0.0.1:5000");`);
		expect(page).toContain('<title>Fish &amp; &lt;chips&gt; &quot;now&quot;</title>');
		expect(page).toContain('<iframe src="http://127.0.0.1:5000/a/v1/" title="Fish &amp; &lt;chips&gt; &quot;now&quot;">');
	});
});

describe('a review tab’s answers to its page', () => {
	const review = { projectId: 'demo', name: 'v1', title: 'Demo · Version 1' };
	const comment = (thread: number, id: number) => ({ thread, id, body: 'Bigger' });
	const deps = () => {
		const routes = new Map<InvokeName, Route>([
			['readComments', async () => ({ ok: true, value: [comment(1, 2)] })],
			['postComment', async () => ({ ok: true, value: comment(1, 3) })],
			['resolveComment', async (...args) => ({ ok: true, value: ['resolved', ...args] })],
			['deleteComment', async () => ({ ok: false, error: 'GitHub would not.' })],
		]);
		return {
			routes: () => routes,
			signIn: vi.fn(async () => ({ state: 'signedOut' as const })),
			address: vi.fn(async () => null),
			baseBehind: vi.fn(async () => null),
			refresh: vi.fn(async () => null),
			designSystemBuild: vi.fn(async () => null),
			buildDesignSystemFrom: vi.fn(async () => ({ from: 'clone' as const, pkg: 'x', installed: '1.0.0', clone: { branch: 'main', changed: 0 } })),
			written: vi.fn(),
		};
	};
	const tab = () => {
		const d = deps();
		const seen = new Set<number>();
		return { d, ask: (name: Parameters<typeof answerReview>[2], args: unknown[]) => answerReview(d, review, name, args, seen) };
	};

	it('are the core’s comment calls, VS Code’s sign-in, and Address on this review’s prototype', async () => {
		const { d, ask } = tab();
		expect(await ask('readComments', ['demo', 'prototype/demo/v1'])).toEqual({ ok: true, value: [comment(1, 2)] });
		expect(await ask('resolveComment', [{ thread: 1, id: 2 }, true])).toMatchObject({ ok: true });
		expect(await ask('signIn', [])).toEqual({ ok: true, value: { state: 'signedOut' } });
		await ask('address', [{ thread: 1, id: 2 }]);
		expect(d.address).toHaveBeenCalledWith(review, { thread: 1, id: 2 }, false);
	});

	it('say how far the page’s version is behind, and Refresh it, only for one of this review’s prototypes', async () => {
		const { d, ask } = tab();
		await ask('baseBehind', ['prototype/demo/v3']);
		expect(d.baseBehind).toHaveBeenCalledWith({ ...review, name: 'v3' });
		await ask('refresh', ['prototype/demo/v3']);
		expect(d.refresh).toHaveBeenCalledWith({ ...review, name: 'v3' });
		for (const args of [['prototype/other/v1'], ['prototype/demo/../other/v1'], [], ['prototype/demo/v1', 'more']])
			for (const name of ['baseBehind', 'refresh'] as const)
				expect(await ask(name, args), `${name} ${args.join(' ')}`).toEqual({
					ok: false,
					error: 'This review is of demo, so it asks only of one of demo’s prototypes.',
				});
		expect(d.baseBehind).toHaveBeenCalledTimes(1);
		expect(d.refresh).toHaveBeenCalledTimes(1);
	});

	it('say what the page’s version is built from, and switch it, only for this review’s prototypes and only to one of the two', async () => {
		const { d, ask } = tab();
		await ask('designSystemBuild', ['prototype/demo/v3']);
		expect(d.designSystemBuild).toHaveBeenCalledWith({ ...review, name: 'v3' });
		await ask('buildDesignSystemFrom', ['prototype/demo/v3', 'clone']);
		expect(d.buildDesignSystemFrom).toHaveBeenCalledWith({ ...review, name: 'v3' }, 'clone');
		// The page is built again and saved: the counts and the list are read again.
		expect(d.written).toHaveBeenCalled();
		expect(await ask('buildDesignSystemFrom', ['prototype/demo/v3', 'elsewhere'])).toEqual({
			ok: false,
			error: "A version is built from the design system's 'clone' or its 'installed' package.",
		});
		for (const args of [['prototype/other/v1', 'clone'], ['prototype/demo/v1'], ['prototype/demo/v1', 'clone', 'more']])
			expect(await ask('buildDesignSystemFrom', args)).toEqual({
				ok: false,
				error: 'This review is of demo, so it asks only of one of demo’s prototypes.',
			});
		expect(d.buildDesignSystemFrom).toHaveBeenCalledTimes(1);
	});

	it('Address the version the page is on, when it says which (BROWSER_COMMENTS_PLAN 3.1)', async () => {
		const d = deps();
		const seen = new Set<number>();
		const ask = (args: unknown[]) => answerReview(d, review, 'address', args, seen);
		await answerReview(d, review, 'readComments', ['demo', 'prototype/demo/v3'], seen);
		await ask([{ thread: 1, id: 2 }, 'prototype/demo/v3']);
		expect(d.address).toHaveBeenCalledWith({ ...review, name: 'v3' }, { thread: 1, id: 2 }, false);
		await ask([{ thread: 1, id: 2 }, 'prototype/demo/v3', true]);
		expect(d.address).toHaveBeenLastCalledWith({ ...review, name: 'v3' }, { thread: 1, id: 2 }, true);
		for (const branch of ['prototype/other/v1', 'prototype/demo/../other/v1', 'feature/demo'])
			expect(await ask([{ thread: 1, id: 2 }, branch]), branch).toEqual({
				ok: false,
				error: 'This review is of demo, so it comments only on demo’s prototypes.',
			});
		expect(await ask([{ thread: 1, id: 2 }, 'prototype/demo/v3', true, 'more'])).toEqual({
			ok: false,
			error: 'Address is given one comment, and may say the version it is on and whether to make a new one.',
		});
		expect(await ask([{ thread: 1, id: 2 }, 'prototype/demo/v3', 'more'])).toEqual({
			ok: false,
			error: 'Address is given one comment, and may say the version it is on and whether to make a new one.',
		});
		expect(d.address).toHaveBeenCalledTimes(2);
	});

	it('read and comment only on this review’s project, on any of its prototypes: not another project’s, whatever it is called', async () => {
		const { ask } = tab();
		expect(await ask('readComments', ['demo', 'prototype/demo/v2'])).toMatchObject({ ok: true });
		for (const args of [
			['other', 'prototype/other/v1'],
			['demo', 'prototype/other/v1'],
			['demo', 'prototype/demo/../other/v1'],
			['demo', 'feature/demo'],
		])
			expect(await ask('readComments', args), JSON.stringify(args)).toEqual({
				ok: false,
				error: 'This review is of demo, so it comments only on demo’s prototypes.',
			});
		expect(await ask('postComment', ['demo', 'prototype/other/v1', 'x', null, null])).toMatchObject({ ok: false });
	});

	it('change, and Address, only a comment the review has been shown or made: none of another thread', async () => {
		const { d, ask } = tab();
		const refused = { ok: false, error: 'That comment is not one of this review’s.' };
		expect(await ask('resolveComment', [{ thread: 1, id: 2 }, true])).toEqual(refused);
		expect(await ask('address', [{ thread: 1, id: 2 }])).toEqual(refused);
		expect(d.address).not.toHaveBeenCalled();
		await ask('readComments', ['demo', 'prototype/demo/v1']);
		expect(await ask('resolveComment', [{ thread: 1, id: 2 }, true])).toMatchObject({ ok: true });
		expect(await ask('deleteComment', [{ thread: 9, id: 2 }])).toEqual(refused);
		await ask('postComment', ['demo', 'prototype/demo/v1', 'Bigger', null, null]);
		expect(await ask('address', [{ thread: 1, id: 3 }])).toMatchObject({ ok: true });
		expect(await ask('address', ['not a comment'])).toEqual({
			ok: false,
			error: 'Address is given one comment, and may say the version it is on and whether to make a new one.',
		});
	});

	it('say a comment was written, once it was, so what shows how many there are is read again', async () => {
		const { d, ask } = tab();
		await ask('readComments', ['demo', 'prototype/demo/v1']);
		expect(d.written).not.toHaveBeenCalled();
		await ask('postComment', ['demo', 'prototype/demo/v1', 'Bigger', null, null]);
		await ask('resolveComment', [{ thread: 1, id: 2 }, true]);
		expect(d.written).toHaveBeenCalledTimes(2);
		await ask('deleteComment', [{ thread: 1, id: 2 }]);
		expect(d.written).toHaveBeenCalledTimes(2);
		// Address writes nothing: the page's save is what is read again, when the agent has built it.
		await ask('address', [{ thread: 1, id: 2 }]);
		expect(d.written).toHaveBeenCalledTimes(2);
	});
});

describe('the review tabs', () => {
	const fakeVsCode = () => {
		const panels: { title: string; html: string; revealed: number; active: boolean; visible: boolean; disposed: () => void; changed: () => void }[] =
			[];
		return {
			panels,
			api: {
				ViewColumn: { Active: -1 },
				window: {
					createWebviewPanel: (_type: string, title: string) => {
						const panel = {
							title,
							html: '',
							revealed: 0,
							active: true,
							visible: true,
							disposed: (): void => undefined,
							changed: (): void => undefined,
						};
						panels.push(panel);
						return {
							get title() {
								return panel.title;
							},
							set title(t: string) {
								panel.title = t;
							},
							webview: {
								set html(h: string) {
									panel.html = h;
								},
								onDidReceiveMessage: () => ({ dispose: () => undefined }),
								postMessage: async () => true,
							},
							get active() {
								return panel.active;
							},
							get visible() {
								return panel.visible;
							},
							onDidChangeViewState: (l: () => void) => {
								panel.changed = l;
								return { dispose: () => undefined };
							},
							reveal: () => void panel.revealed++,
							onDidDispose: (l: () => void) => {
								panel.disposed = l;
								return { dispose: () => undefined };
							},
						};
					},
				},
			},
		};
	};

	it('are one for each project: opening another of its prototypes shows it in the same tab, and a closed tab is made again', async () => {
		const vs = fakeVsCode();
		const built: string[] = [];
		const reviews = new Reviews({
			vscode: vs.api as never,
			build: (records) => void built.push(records),
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async () => ({ ok: true, value: null }),
		});
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1', title: 'Demo · Version 1' });
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v3', title: 'Demo · Version 3' });
		expect(vs.panels.map((p) => p.title)).toEqual(['Demo · Version 3']);
		expect(vs.panels[0]!.html).toContain('http://127.0.0.1:5000/review/demo/v3/');
		expect(vs.panels[0]!.revealed).toBe(1);
		// Built again each time, so it is the records as they are.
		expect(built).toEqual(['/d/projects', '/d/projects']);
		vs.panels[0]!.disposed();
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1', title: 'Demo · Version 1' });
		expect(vs.panels).toHaveLength(2);
	});

	it('have an address for the browser: the same page, built from the records and served from this machine, with no tab made', async () => {
		const vs = fakeVsCode();
		const built: string[] = [];
		const reviews = new Reviews({
			vscode: vs.api as never,
			build: (records) => void built.push(records),
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async () => ({ ok: true, value: null }),
		});
		expect(await reviews.address({ records: '/d/projects', projectId: 'demo', name: 'v2', title: 'Demo · Version 2' })).toBe(
			'http://127.0.0.1:5000/review/demo/v2/',
		);
		expect(built).toEqual(['/d/projects']);
		expect(vs.panels).toHaveLength(0);
	});

	it('open in the browser with a key of their own, for that review alone, each with what it has been shown (BROWSER_COMMENTS_PLAN 1.2)', async () => {
		const answered: { review: unknown; name: string; args: unknown[]; seen: Set<number> }[] = [];
		const reviews = new Reviews({
			vscode: fakeVsCode().api as never,
			build: () => undefined,
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async (review, name, args, seen) => {
				answered.push({ review, name, args, seen });
				return { ok: true, value: [] };
			},
		});
		const demo = { projectId: 'demo', name: 'v3', title: 'Demo · Version 3' };
		const first = await reviews.inBrowser({ records: '/d/projects', ...demo });
		const second = await reviews.inBrowser({ records: '/d/projects', ...demo });
		// The key is in the fragment, which is never sent to a server.
		const keyOf = (url: string) => /^http:\/\/127\.0\.0\.1:5000\/review\/demo\/v3\/#dsnr-key-([A-Za-z0-9_-]{22,})$/.exec(url)?.[1];
		const [a, b] = [keyOf(first), keyOf(second)];
		expect(a).toBeDefined();
		expect(b).toBeDefined();
		expect(a).not.toBe(b);
		const ask = { dsnr: 'ask', id: 3, name: 'readComments', args: ['demo', 'prototype/demo/v3'] };
		expect(await reviews.answerBrowser(a as string, ask)).toEqual({ dsnr: 'answer', id: 3, result: { ok: true, value: [] } });
		await reviews.answerBrowser(b as string, ask);
		expect(answered.map((x) => [x.review, x.name, x.args])).toEqual([
			[demo, 'readComments', ['demo', 'prototype/demo/v3']],
			[demo, 'readComments', ['demo', 'prototype/demo/v3']],
		]);
		// Each key has its own list of what it has been shown: what one browser tab saw, another may not change.
		expect(answered[0]!.seen).not.toBe(answered[1]!.seen);
		await reviews.answerBrowser(a as string, { ...ask, id: 4 });
		expect(answered[2]!.seen).toBe(answered[0]!.seen);
	});

	it('answer no browser ask without a key they made, or that is not an ask', async () => {
		let answers = 0;
		const reviews = new Reviews({
			vscode: fakeVsCode().api as never,
			build: () => undefined,
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async () => {
				answers += 1;
				return { ok: true, value: null };
			},
		});
		const url = await reviews.inBrowser({ records: '/d/projects', projectId: 'demo', name: 'v1', title: 'Demo · Version 1' });
		const key = url.split('#dsnr-key-')[1] as string;
		const ask = { dsnr: 'ask', id: 1, name: 'readComments', args: [] };
		expect(await reviews.answerBrowser('A'.repeat(22), ask)).toBeNull();
		expect(await reviews.answerBrowser(`${key}x`, ask)).toBeNull();
		expect(await reviews.answerBrowser(key, { ...ask, name: 'removeDesignSystem' })).toBeNull();
		expect(await reviews.answerBrowser(key, { ...ask, extra: true })).toBeNull();
		expect(await reviews.answerBrowser(key, 'readComments')).toBeNull();
		expect(answers).toBe(0);
		expect(await reviews.address({ records: '/d/projects', projectId: 'demo', name: 'v1', title: 'Demo · Version 1' })).not.toContain('#');
	});

	it('answer a browser that asks with its key through this machine’s server, as the review’s tab is answered', async () => {
		const server = new PrototypeServer();
		try {
			const app = await server.origin();
			const reviews = new Reviews({
				vscode: fakeVsCode().api as never,
				build: () => undefined,
				serve: async () => `${app}/review/`,
				answer: async (review, name) => ({ ok: true, value: `${name} on ${review.projectId}` }),
			});
			server.answerAsks((key, ask) => reviews.answerBrowser(key, ask));
			const url = await reviews.inBrowser({ records: '/d/projects', projectId: 'demo', name: 'v1', title: 'Demo · Version 1' });
			const key = url.split('#dsnr-key-')[1] as string;
			const asked = (k: string) =>
				fetch(`${app}/_dsnr/ask`, {
					method: 'POST',
					headers: { origin: app, 'content-type': 'application/json', 'x-dsnr-key': k },
					body: JSON.stringify({ dsnr: 'ask', id: 1, name: 'readComments', args: ['demo', 'prototype/demo/v1'] }),
				});
			const r = await asked(key);
			expect(await r.json()).toEqual({ dsnr: 'answer', id: 1, result: { ok: true, value: 'readComments on demo' } });
			expect((await asked('B'.repeat(22))).status).toBe(403);
		} finally {
			server.close();
		}
	});

	it('say which projects are in use, by a tab or a browser’s key, so nothing they show is removed under them', async () => {
		const vs = fakeVsCode();
		const reviews = new Reviews({
			vscode: vs.api as never,
			build: () => undefined,
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async () => ({ ok: true, value: null }),
		});
		expect(reviews.inUse()).toEqual([]);
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1', title: 'Demo · Version 1' });
		await reviews.inBrowser({ records: '/d/projects', projectId: 'other', name: 'v1', title: 'Other · Version 1' });
		expect(reviews.inUse().sort()).toEqual(['demo', 'other']);
		// A tab closed is no longer in use; a browser's key is, until VS Code reloads.
		vs.panels[0]!.disposed();
		expect(reviews.inUse()).toEqual(['other']);
	});

	it('say which review is in front, for what its title bar does', async () => {
		const vs = fakeVsCode();
		const reviews = new Reviews({
			vscode: vs.api as never,
			build: () => undefined,
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async () => ({ ok: true, value: null }),
		});
		expect(reviews.active()).toBeUndefined();
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v3', title: 'Demo · Version 3' });
		await reviews.open({ records: '/d/projects', projectId: 'other', name: 'v1', title: 'Other · Version 1' });
		vs.panels[1]!.active = false;
		expect(reviews.active()).toEqual({ projectId: 'demo', name: 'v3', title: 'Demo · Version 3' });
	});
});

describe('the review tabs in front', () => {
	it('are the projects whose tab is visible, and are said again each time one opens, changes or closes', async () => {
		const panels = new Map<string, { visible: boolean; changed: () => void; disposed: () => void }>();
		const told: string[][] = [];
		const reviews: Reviews = new Reviews({
			vscode: {
				ViewColumn: { Active: -1 },
				window: {
					createWebviewPanel: (_t: string, title: string) => {
						const p = { visible: true, changed: (): void => undefined, disposed: (): void => undefined };
						panels.set(title, p);
						return {
							title,
							active: true,
							get visible() {
								return p.visible;
							},
							onDidChangeViewState: (l: () => void) => ((p.changed = l), { dispose: () => undefined }),
							onDidDispose: (l: () => void) => ((p.disposed = l), { dispose: () => undefined }),
							reveal: () => undefined,
							webview: { set html(_h: string) {}, onDidReceiveMessage: () => ({ dispose: () => undefined }), postMessage: async () => true },
						};
					},
				},
			} as never,
			build: () => undefined,
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async () => ({ ok: true, value: null }),
			onShown: () => told.push(reviews.shown()),
		});
		await reviews.open({ records: '/d', projectId: 'demo', name: 'v1', title: 'demo' });
		await reviews.open({ records: '/d', projectId: 'other', name: 'v1', title: 'other' });
		expect(told.at(-1)).toEqual(['demo', 'other']);
		panels.get('demo')!.visible = false;
		panels.get('demo')!.changed();
		expect(told.at(-1)).toEqual(['other']);
		panels.get('other')!.disposed();
		expect(told.at(-1)).toEqual([]);
	});
});

describe('what the extension asks the panel to show', () => {
	const webview = () => {
		const posted: unknown[] = [];
		return { posted, webview: { postMessage: async (m: unknown) => void posted.push(m) } as never };
	};

	it('tells a page that listens every value pages share, and every page when one changes, only then', async () => {
		const panels = new Panels();
		const tabs = panels.share('tabs', NO_TABS_SHOWN);
		const a = webview();
		panels.add(a.webview);
		await panels.ready(a.webview);
		expect(a.posted).toEqual([{ type: 'shared', name: 'tabs', value: NO_TABS_SHOWN }]);
		const front = { projects: ['demo'], components: ['src/FSButton.stories.tsx'] };
		tabs.set(front);
		expect(a.posted.at(-1)).toEqual({ type: 'shared', name: 'tabs', value: front });
		tabs.set({ projects: ['demo'], components: ['src/FSButton.stories.tsx'] });
		expect(a.posted).toHaveLength(2);
		const b = webview();
		panels.add(b.webview);
		await panels.ready(b.webview);
		expect(b.posted).toEqual([{ type: 'shared', name: 'tabs', value: front }]);
	});

	it('is held until the page is listening, then sent once: a later request replaces an earlier one it never saw', async () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		panels.show({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'demo' } });
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([]);
		await panels.ready(a.webview);
		expect(a.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
		await panels.ready(a.webview);
		expect(a.posted).toHaveLength(1);
	});

	it('is sent at once to a page that is listening', async () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		await panels.ready(a.webview);
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
	});

	const view = (page: ReturnType<typeof webview>) => {
		const visibility: (() => void)[] = [];
		const disposed: (() => void)[] = [];
		const v = {
			webview: page.webview,
			visible: true,
			onDidChangeVisibility: (l: () => void) => void visibility.push(l),
			onDidDispose: (l: () => void) => void disposed.push(l),
		};
		const set = (visible: boolean) => {
			v.visible = visible;
			for (const l of visibility) l();
		};
		return { view: v, hide: () => set(false), showAgain: () => set(true), dispose: () => disposed.forEach((l) => l()) };
	};

	it('reaches a page VS Code keeps while hidden: hiding it is not losing it, so a dialog asked for after still opens', async () => {
		// The panel is kept while hidden (PANEL_VIEW_OPTIONS), so its page never loads again and never says it listens
		// again. Taking it for gone when hidden would hold every dialog from then on, until the window is reloaded.
		const panels = new Panels();
		const a = webview();
		const v = view(a);
		panels.attach(v.view);
		await panels.ready(a.webview);
		v.hide();
		v.showAgain();
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
		v.hide();
		panels.show({ type: 'open-dialog', dialog: { kind: 'sync' } });
		expect(a.posted).toHaveLength(2);
	});

	it('is how the side panel connects its page, and nothing there takes the page for gone when it is hidden', () => {
		// Read as text: the panel's view needs VS Code to load.
		const source = readFileSync(join(__dirname, '../extension/src/panel.ts'), 'utf8');
		expect(source).toMatch(/panels\.attach\(view\)/);
		expect(source).not.toMatch(/onDidChangeVisibility/);
	});

	it('holds it once VS Code has thrown the page away, for the page it makes next', async () => {
		const panels = new Panels();
		const a = webview();
		const v = view(a);
		panels.attach(v.view);
		await panels.ready(a.webview);
		v.dispose();
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([]);
		const b = webview();
		panels.attach(view(b).view);
		await panels.ready(b.webview);
		expect(b.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
	});

	it('is held again when the page goes (it is reloading), until it says it listens again', async () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		await panels.ready(a.webview);
		panels.unready(a.webview);
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([]);
		await panels.ready(a.webview);
		expect(a.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
	});
});

describe('the bridge', () => {
	it('answers a call from the core’s table and an ask from the extension’s, by its id, and says when nothing answers it', async () => {
		const posted: unknown[] = [];
		const failed = vi.fn();
		const tables = {
			core: new Map<InvokeName, Route>([['listProjects', async () => ({ ok: true, value: [] })]]),
			asks: new Map([['openPrimitives', async () => ({ ok: true, value: null })]]) as never,
		};
		const page = { postMessage: async (m: unknown) => void posted.push(m) } as never;
		await answerCall(page, tables, { type: 'call', id: 3, name: 'listProjects', args: [] }, failed);
		await answerCall(page, tables, { type: 'call', id: 4, name: 'readCheckout', args: [] }, failed);
		await answerCall(page, tables, { type: 'call', id: 5, name: 'openPrimitives', args: [] }, failed);
		await answerCall(page, tables, { type: 'call', id: 6, name: 'openChanges', args: [] }, failed);
		expect(posted).toEqual([
			{ type: 'answer', id: 3, result: { ok: true, value: [] } },
			{ type: 'answer', id: 4, result: { ok: false, error: 'readCheckout is not answered in VS Code.' } },
			{ type: 'answer', id: 5, result: { ok: true, value: null } },
			{ type: 'answer', id: 6, result: { ok: false, error: 'openChanges is not answered in VS Code.' } },
		]);
		// An ask that failed is said, as the extension says what goes wrong; a call's failure is the page's to show.
		expect(failed).toHaveBeenCalledTimes(1);
		expect(failed).toHaveBeenCalledWith(new Error('openChanges is not answered in VS Code.'));
	});

	it('gives the extension the same API the panel has, from the same table, and the core’s events as they are sent', async () => {
		const line = (text: string) => ({ commandId: 'agent', stream: 'stdout' as const, text });
		const panels = new Panels();
		const posted: unknown[] = [];
		panels.add({ postMessage: async (m: unknown) => void posted.push(m) } as never);
		const routes = new Map<InvokeName, Route>([['listProjects', async () => ({ ok: true, value: ['p'] })]]);
		const api = hostApi(() => routes, panels);
		expect(await api.listProjects()).toEqual({ ok: true, value: ['p'] });
		expect(await api.readCheckout('/p')).toEqual({ ok: false, error: 'readCheckout is not answered in VS Code.' });
		const heard: unknown[] = [];
		const stop = api.onRunLog((l) => void heard.push(l));
		panels.sink('onRunLog', line('one'));
		stop();
		panels.sink('onRunLog', line('two'));
		expect(heard).toEqual([line('one')]);
		expect(posted).toEqual([
			{ type: 'event', name: 'onRunLog', payload: line('one') },
			{ type: 'event', name: 'onRunLog', payload: line('two') },
		]);
	});
});
