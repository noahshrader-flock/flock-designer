import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VsCodeGitHub } from '../extension/src/github';
import { openableLink, vscodePorts } from '../extension/src/vscodePorts';
import { reviewsOf } from '../extension/src/messages';
import { Reviews, answerReview, reviewPage, reviewPath } from '../extension/src/review';
import { Panels, answerCall, hostApi } from '../extension/src/bridge';
import type { Route } from '../src/main/handle';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import type { InvokeName } from '../src/shared/contract';
import type { ProjectIteration } from '../src/shared/domain/projects';

/**
 * DSNR's shell in VS Code (ELECTRON_MIGRATION_PLAN, Phase 3): the person's GitHub account through VS Code's own sign-in,
 * VS Code's ports, where a prototype's review is, and the bridge that answers the panel's calls from the core's table.
 * Each takes what it uses of VS Code, so it is tested without one.
 */

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
		await expect(github.startSignIn()).rejects.toThrow(/DSNR: Sign in to GitHub/);
	});
});

/** The person's settings, as the fake VS Code reads them, by section and key. */
let settings: Record<string, unknown> = {};

describe('VS Code’s ports', () => {
	beforeEach(() => {
		settings = {};
	});
	const fake = () => ({
		window: { showOpenDialog: vi.fn(async (_options: unknown) => [{ fsPath: '/picked' }]), showInformationMessage: vi.fn(async () => undefined) },
		env: { openExternal: vi.fn(async (_uri: unknown) => true), clipboard: { writeText: vi.fn(async () => undefined) } },
		commands: { executeCommand: vi.fn(async (_id: string, ..._args: unknown[]) => undefined) },
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
		expect(await ports.chooseFolder({ title: 'Locate design system' })).toBe('/picked');
		expect(v.window.showOpenDialog.mock.calls[0]?.[0]).toMatchObject({
			title: 'Locate design system',
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
		for (const url of ['https://github.com/x/y/pull/1', 'http://127.0.0.1:4321/review/a/']) expect(openableLink(url), url).toBe(true);
		for (const url of ['http://example.com/', 'file:///etc/passwd', 'command:workbench.action.reloadWindow', 'vscode://x/y', 'not a link'])
			expect(openableLink(url), url).toBe(false);
		await ports.openExternal('https://github.com/x/y');
		expect(v.env.openExternal).toHaveBeenCalledTimes(1);
		await expect(ports.openExternal('command:workbench.action.reloadWindow')).rejects.toThrow(/opens only web pages/);
		expect(v.env.openExternal).toHaveBeenCalledTimes(1);
	});

	/** Claude Code's own commands: show its side panel (which it then remembers as where it is kept), and open a conversation. */
	const SIDEBAR = 'claude-vscode.sidebar.open';
	const OPEN = 'claude-vscode.editor.open';
	const WHERE = { programmatic: 'honor-preferred-location' };
	/** Claude Code's sidebar command, as it is: it saves its own setting as the sidebar a moment later, without waiting. */
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
		const { editor } = vscodePorts(v as never, none);
		expect(editor.find()).toBe('vscode');
		await editor.openPrompt('vscode', '/work/coke', 'Build it.');
		expect(v.commands.executeCommand.mock.calls).toEqual([[SIDEBAR], [OPEN, undefined, 'Build it.', undefined, undefined, undefined, WHERE]]);
		// Opened only once Claude Code had saved the sidebar as its place: before, it would read its old place, an editor tab.
		expect(placeWhenOpened).toBe('sidebar');
		expect(v.env.openExternal).not.toHaveBeenCalled();
	});

	it('open it there at once when Claude Code already keeps its conversations in its side panel, and continue a session the same way', async () => {
		const v = fake();
		settings['claudeCode.preferredLocation'] = 'sidebar';
		const { editor } = vscodePorts(v as never, none);
		await editor.openPrompt('vscode', '/work/coke', 'Build it.');
		const then = vi.fn();
		const session = '0b2e5b8e-46ac-4823-9acb-716bcb37aa64';
		await editor.openSession('vscode', { session, root: '/work/coke' } as never, then);
		expect(then).toHaveBeenCalled();
		expect(v.commands.executeCommand.mock.calls).toEqual([
			[OPEN, undefined, 'Build it.', undefined, undefined, undefined, WHERE],
			[OPEN, session, undefined, undefined, undefined, undefined, WHERE],
		]);
	});

	it('hand it to an editor tab instead, when that is the person’s setting', async () => {
		const v = fake();
		settings['dsnr.claudeCode.location'] = 'editor';
		const { editor } = vscodePorts(v as never, none);
		await editor.openPrompt('vscode', '/work/coke', 'Build it.');
		// No side panel is shown, and Claude Code is not asked to honour a place: an editor tab, as its own command opens one.
		expect(v.commands.executeCommand.mock.calls).toEqual([[OPEN, undefined, 'Build it.']]);
	});

	it('fall back to Claude Code’s link (an editor tab) when its open command is not there, as in another version', async () => {
		const v = fake();
		v.commands.executeCommand.mockImplementation(async (id: string) => {
			if (id.startsWith('claude-vscode.')) throw new Error(`command '${id}' not found`);
		});
		const { editor } = vscodePorts(v as never, none);
		await editor.openPrompt('vscode', '/work/coke', 'Build it.');
		expect(String(v.env.openExternal.mock.calls.at(-1)?.[0])).toBe('vscode://anthropic.claude-code/open?prompt=Build+it.');
	});

	it('refuse what is not a session, before asking Claude Code anything', async () => {
		const v = fake();
		const { editor } = vscodePorts(v as never, none);
		await expect(editor.openSession('vscode', { session: '../x', root: '/work/coke' } as never, vi.fn())).rejects.toThrow('That is not a session.');
		expect(v.commands.executeCommand).not.toHaveBeenCalled();
	});

	it('open a folder that is not in this window in a window of its own, and say there is no editor without Claude Code', async () => {
		const v = fake();
		const { editor } = vscodePorts(v as never, none);
		await editor.openFolder('vscode', '/work/other');
		expect(v.commands.executeCommand).toHaveBeenCalledWith('vscode.openFolder', { fsPath: '/work/other' }, { forceNewWindow: true });
		v.extensions.getExtension.mockReturnValue(undefined as never);
		expect(vscodePorts(v as never, none).editor.find()).toBeNull();
	});

	it('draw and check out of sight with the headless browser they are given', () => {
		const headless = { draw: vi.fn(), scan: vi.fn(), measure: vi.fn() };
		expect(vscodePorts(fake() as never, headless).headless).toBe(headless);
	});
});

describe('a prototype’s review', () => {
	it('is its page on the site, by version and iteration, as the site lays it out', () => {
		expect(reviewPath('alert-history', 'v2-i1')).toBe('alert-history/v2/i1/');
		expect(reviewPath('admin-usage', 'i1')).toBe('admin-usage/v1/i1/');
		expect(() => reviewPath('admin-usage', 'codebase')).toThrow(/not a prototype/);
	});

	it('is each of a project’s prototypes that has a page, newest first, titled with its project and its label', () => {
		const record = (name: string, branch: string, createdAt: string) => ({ name, branch, createdAt }) as ProjectIteration;
		const project = {
			id: 'alert-history',
			title: 'Alert history',
			iterations: [
				record('v1-i1', 'prototype/alert-history/v1-i1', '2026-10-01'),
				record('v2-i1', 'prototype/alert-history/v2-i1', '2026-10-03'),
				record('codebase', 'feature/alert-history', '2026-10-04'),
				// A prototype whose name the site cannot lay out has no page to open.
				record('spike', 'fd/alert-history/spike', '2026-10-05'),
			],
		};
		expect(reviewsOf(project)).toEqual([
			{ projectId: 'alert-history', name: 'v2-i1', title: 'Alert history · V2 · I1' },
			{ projectId: 'alert-history', name: 'v1-i1', title: 'Alert history · V1 · I1' },
		]);
	});

	it('frames only the page, from this machine, with its title as text, and runs only its own script', () => {
		const page = reviewPage({ src: 'http://127.0.0.1:5000/a/v1/i1/', title: 'Fish & <chips> "now"', nonce: 'n1' });
		expect(page).toContain("default-src 'none'; frame-src http://127.0.0.1:5000; style-src 'nonce-n1'; script-src 'nonce-n1'");
		expect([...page.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])).toEqual(['<script nonce="n1">']);
		// It says hello to the page, and passes what the page asks up, and the answers down, to that page's address alone.
		expect(page).toContain(`const page = "http://127.0.0.1:5000";`);
		expect(page).toContain("postMessage({ dsnr: 'hello' }, page)");
		expect(page).toContain('<title>Fish &amp; &lt;chips&gt; &quot;now&quot;</title>');
		expect(page).toContain('<iframe src="http://127.0.0.1:5000/a/v1/i1/" title="Fish &amp; &lt;chips&gt; &quot;now&quot;">');
	});
});

describe('a review tab’s answers to its page', () => {
	const review = { projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' };
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
			written: vi.fn(),
		};
	};
	/** A tab's answers, as the tab gives them: the comments it has been shown are its own. */
	const tab = () => {
		const d = deps();
		const seen = new Set<number>();
		return { d, ask: (name: Parameters<typeof answerReview>[2], args: unknown[]) => answerReview(d, review, name, args, seen) };
	};

	it('are the core’s comment calls, VS Code’s sign-in, and Address on this review’s prototype', async () => {
		const { d, ask } = tab();
		expect(await ask('readComments', ['demo', 'prototype/demo/v1-i1'])).toEqual({ ok: true, value: [comment(1, 2)] });
		expect(await ask('resolveComment', [{ thread: 1, id: 2 }, true])).toMatchObject({ ok: true });
		expect(await ask('signIn', [])).toEqual({ ok: true, value: { state: 'signedOut' } });
		await ask('address', [{ thread: 1, id: 2 }]);
		expect(d.address).toHaveBeenCalledWith(review, { thread: 1, id: 2 }, 'tab');
	});

	it('Address the iteration the page is on, when it says which, and say who asked (BROWSER_COMMENTS_PLAN 3.1)', async () => {
		const d = deps();
		const seen = new Set<number>();
		const ask = (args: unknown[]) => answerReview(d, review, 'address', args, seen, 'browser');
		await answerReview(d, review, 'readComments', ['demo', 'prototype/demo/v1-i2'], seen, 'browser');
		await ask([{ thread: 1, id: 2 }, 'prototype/demo/v1-i2']);
		expect(d.address).toHaveBeenCalledWith({ ...review, name: 'v1-i2' }, { thread: 1, id: 2 }, 'browser');
		// Only one of this review's project's prototypes, and only one comment.
		for (const branch of ['prototype/other/v1-i1', 'prototype/demo/../other/v1-i1', 'feature/demo'])
			expect(await ask([{ thread: 1, id: 2 }, branch]), branch).toEqual({
				ok: false,
				error: 'This review is of demo, so it comments only on demo’s prototypes.',
			});
		expect(await ask([{ thread: 1, id: 2 }, 'prototype/demo/v1-i2', 'more'])).toEqual({ ok: false, error: 'Address is given one comment.' });
		expect(d.address).toHaveBeenCalledTimes(1);
	});

	it('read and comment only on this review’s project, on any of its prototypes: not another project’s, whatever it is called', async () => {
		const { ask } = tab();
		expect(await ask('readComments', ['demo', 'prototype/demo/v2-i1'])).toMatchObject({ ok: true });
		for (const args of [
			['other', 'prototype/other/v1-i1'],
			// Its own id, with another project's branch: refused too.
			['demo', 'prototype/other/v1-i1'],
			['demo', 'prototype/demo/../other/v1-i1'],
			['demo', 'feature/demo'],
		])
			expect(await ask('readComments', args), JSON.stringify(args)).toEqual({
				ok: false,
				error: 'This review is of demo, so it comments only on demo’s prototypes.',
			});
		expect(await ask('postComment', ['demo', 'prototype/other/v1-i1', 'x', null, null])).toMatchObject({ ok: false });
	});

	it('change, and Address, only a comment the review has been shown or made: none of another thread', async () => {
		const { d, ask } = tab();
		const refused = { ok: false, error: 'That comment is not one of this review’s.' };
		// Nothing read yet: no comment is this review's.
		expect(await ask('resolveComment', [{ thread: 1, id: 2 }, true])).toEqual(refused);
		expect(await ask('address', [{ thread: 1, id: 2 }])).toEqual(refused);
		expect(d.address).not.toHaveBeenCalled();
		await ask('readComments', ['demo', 'prototype/demo/v1-i1']);
		expect(await ask('resolveComment', [{ thread: 1, id: 2 }, true])).toMatchObject({ ok: true });
		expect(await ask('deleteComment', [{ thread: 9, id: 2 }])).toEqual(refused);
		// One it made is its own too.
		await ask('postComment', ['demo', 'prototype/demo/v1-i1', 'Bigger', null, null]);
		expect(await ask('address', [{ thread: 1, id: 3 }])).toMatchObject({ ok: true });
		expect(await ask('address', ['not a comment'])).toEqual({ ok: false, error: 'Address is given one comment.' });
	});

	it('say a comment was written, once it was, so what shows how many there are is read again', async () => {
		const { d, ask } = tab();
		await ask('readComments', ['demo', 'prototype/demo/v1-i1']);
		expect(d.written).not.toHaveBeenCalled();
		await ask('postComment', ['demo', 'prototype/demo/v1-i1', 'Bigger', null, null]);
		await ask('resolveComment', [{ thread: 1, id: 2 }, true]);
		expect(d.written).toHaveBeenCalledTimes(2);
		// One that failed wrote nothing.
		await ask('deleteComment', [{ thread: 1, id: 2 }]);
		expect(d.written).toHaveBeenCalledTimes(2);
		await ask('address', [{ thread: 1, id: 2 }]);
		expect(d.written).toHaveBeenCalledTimes(3);
	});
});

describe('the review tabs', () => {
	const fakeVsCode = () => {
		const panels: { title: string; html: string; revealed: number; active: boolean; disposed: () => void }[] = [];
		return {
			panels,
			api: {
				ViewColumn: { Active: -1 },
				window: {
					createWebviewPanel: (_type: string, title: string) => {
						const panel = { title, html: '', revealed: 0, active: true, disposed: (): void => undefined };
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
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' });
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1-i2', title: 'Demo · V1 · I2' });
		expect(vs.panels.map((p) => p.title)).toEqual(['Demo · V1 · I2']);
		expect(vs.panels[0]!.html).toContain('http://127.0.0.1:5000/review/demo/v1/i2/');
		expect(vs.panels[0]!.revealed).toBe(1);
		// Built again each time, so it is the records as they are.
		expect(built).toEqual(['/d/projects', '/d/projects']);
		vs.panels[0]!.disposed();
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' });
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
		expect(await reviews.address({ records: '/d/projects', projectId: 'demo', name: 'v2-i1', title: 'Demo · V2 · I1' })).toBe(
			'http://127.0.0.1:5000/review/demo/v2/i1/',
		);
		expect(built).toEqual(['/d/projects']);
		expect(vs.panels).toHaveLength(0);
	});

	it('open in the browser with a key of their own, for that review alone, each with what it has been shown (BROWSER_COMMENTS_PLAN 1.2)', async () => {
		const answered: { review: unknown; name: string; args: unknown[]; seen: Set<number>; from: unknown }[] = [];
		const reviews = new Reviews({
			vscode: fakeVsCode().api as never,
			build: () => undefined,
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async (review, name, args, seen, from) => {
				answered.push({ review, name, args, seen, from });
				return { ok: true, value: [] };
			},
		});
		const demo = { projectId: 'demo', name: 'v1-i2', title: 'Demo · V1 · I2' };
		const first = await reviews.inBrowser({ records: '/d/projects', ...demo });
		const second = await reviews.inBrowser({ records: '/d/projects', ...demo });
		// The page's address, its key in the fragment (never sent to a server), new each time.
		const keyOf = (url: string) => /^http:\/\/127\.0\.0\.1:5000\/review\/demo\/v1\/i2\/#dsnr-key-([A-Za-z0-9_-]{22,})$/.exec(url)?.[1];
		const [a, b] = [keyOf(first), keyOf(second)];
		expect(a).toBeDefined();
		expect(b).toBeDefined();
		expect(a).not.toBe(b);
		// An ask with a key is answered as the review's tab is, as that review, in the answer's shape.
		const ask = { dsnr: 'ask', id: 3, name: 'readComments', args: ['demo', 'prototype/demo/v1-i2'] };
		expect(await reviews.answerBrowser(a as string, ask)).toEqual({ dsnr: 'answer', id: 3, result: { ok: true, value: [] } });
		await reviews.answerBrowser(b as string, ask);
		expect(answered.map((x) => [x.review, x.name, x.args])).toEqual([
			[demo, 'readComments', ['demo', 'prototype/demo/v1-i2']],
			[demo, 'readComments', ['demo', 'prototype/demo/v1-i2']],
		]);
		// Asked from the browser, as the answer says, for what Address shows.
		expect(answered.map((x) => x.from)).toEqual(['browser', 'browser']);
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
		const url = await reviews.inBrowser({ records: '/d/projects', projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' });
		const key = url.split('#dsnr-key-')[1] as string;
		const ask = { dsnr: 'ask', id: 1, name: 'readComments', args: [] };
		expect(await reviews.answerBrowser('A'.repeat(22), ask)).toBeNull();
		expect(await reviews.answerBrowser(`${key}x`, ask)).toBeNull();
		expect(await reviews.answerBrowser(key, { ...ask, name: 'removeDesignSystem' })).toBeNull();
		expect(await reviews.answerBrowser(key, { ...ask, extra: true })).toBeNull();
		expect(await reviews.answerBrowser(key, 'readComments')).toBeNull();
		expect(answers).toBe(0);
		// Opening it in a tab makes no key.
		expect(await reviews.address({ records: '/d/projects', projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' })).not.toContain('#');
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
			const url = await reviews.inBrowser({ records: '/d/projects', projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' });
			const key = url.split('#dsnr-key-')[1] as string;
			const asked = (k: string) =>
				fetch(`${app}/_dsnr/ask`, {
					method: 'POST',
					headers: { origin: app, 'content-type': 'application/json', 'x-dsnr-key': k },
					body: JSON.stringify({ dsnr: 'ask', id: 1, name: 'readComments', args: ['demo', 'prototype/demo/v1-i1'] }),
				});
			const r = await asked(key);
			expect(await r.json()).toEqual({ dsnr: 'answer', id: 1, result: { ok: true, value: 'readComments on demo' } });
			expect((await asked('B'.repeat(22))).status).toBe(403);
		} finally {
			server.close();
		}
	});

	it('show a review in its project’s tab if one is open, without bringing it in front, and open none (BROWSER_COMMENTS_PLAN 3.3)', async () => {
		const vs = fakeVsCode();
		const built: string[] = [];
		const reviews = new Reviews({
			vscode: vs.api as never,
			build: (records) => void built.push(records),
			serve: async () => 'http://127.0.0.1:5000/review/',
			answer: async () => ({ ok: true, value: null }),
		});
		// None open: nothing opened, but the site is built, so the browser has the page to go to.
		await reviews.showIfOpen({ records: '/d/projects', projectId: 'demo', name: 'v1-i2', title: 'Demo · V1 · I2' });
		expect(vs.panels).toHaveLength(0);
		expect(built).toEqual(['/d/projects']);
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' });
		await reviews.showIfOpen({ records: '/d/projects', projectId: 'demo', name: 'v1-i2', title: 'Demo · V1 · I2' });
		expect(vs.panels).toHaveLength(1);
		expect(vs.panels[0]!.title).toBe('Demo · V1 · I2');
		expect(vs.panels[0]!.html).toContain('http://127.0.0.1:5000/review/demo/v1/i2/');
		expect(vs.panels[0]!.revealed).toBe(0);
		// Another project's tab is not this one's.
		await reviews.showIfOpen({ records: '/d/projects', projectId: 'other', name: 'v1-i1', title: 'Other · V1 · I1' });
		expect(vs.panels).toHaveLength(1);
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
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1-i1', title: 'Demo · V1 · I1' });
		await reviews.inBrowser({ records: '/d/projects', projectId: 'other', name: 'v1-i1', title: 'Other · V1 · I1' });
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
		await reviews.open({ records: '/d/projects', projectId: 'demo', name: 'v1-i2', title: 'Demo · V1 · I2' });
		await reviews.open({ records: '/d/projects', projectId: 'other', name: 'v1-i1', title: 'Other · V1 · I1' });
		vs.panels[1]!.active = false;
		expect(reviews.active()).toEqual({ projectId: 'demo', name: 'v1-i2', title: 'Demo · V1 · I2' });
	});
});

describe('what the extension asks the panel to show', () => {
	const webview = () => {
		const posted: unknown[] = [];
		return { posted, webview: { postMessage: async (m: unknown) => void posted.push(m) } as never };
	};

	it('is held until the page is listening, then sent once: a later request replaces an earlier one it never saw', () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		panels.show({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'demo' } });
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([]);
		panels.ready(a.webview);
		expect(a.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
		panels.ready(a.webview);
		expect(a.posted).toHaveLength(1);
	});

	it('is sent at once to a page that is listening', () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		panels.ready(a.webview);
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
	});

	it('is held again when the page goes (its view was hidden, and reloads when it is shown)', () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		panels.ready(a.webview);
		panels.unready(a.webview);
		panels.show({ type: 'open-dialog', dialog: { kind: 'new' } });
		expect(a.posted).toEqual([]);
		panels.ready(a.webview);
		expect(a.posted).toEqual([{ type: 'open-dialog', dialog: { kind: 'new' } }]);
	});
});

describe('the bridge', () => {
	it('answers a call from the core’s table, by its id, and says when nothing answers it', async () => {
		const posted: unknown[] = [];
		const routes = new Map<InvokeName, Route>([['listProjects', async () => ({ ok: true, value: [] })]]);
		await answerCall({ postMessage: async (m: unknown) => void posted.push(m) } as never, routes, {
			type: 'call',
			id: 3,
			name: 'listProjects',
			args: [],
		});
		await answerCall({ postMessage: async (m: unknown) => void posted.push(m) } as never, routes, {
			type: 'call',
			id: 4,
			name: 'readCheckout',
			args: [],
		});
		expect(posted).toEqual([
			{ type: 'answer', id: 3, result: { ok: true, value: [] } },
			{ type: 'answer', id: 4, result: { ok: false, error: 'readCheckout is not answered in VS Code.' } },
		]);
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
		const stop = api.onAgentLog((l) => void heard.push(l));
		panels.sink('onAgentLog', line('one'));
		stop();
		panels.sink('onAgentLog', line('two'));
		// The extension hears it once, until it stops; the panels hear every one.
		expect(heard).toEqual([line('one')]);
		expect(posted).toEqual([
			{ type: 'event', name: 'onAgentLog', payload: line('one') },
			{ type: 'event', name: 'onAgentLog', payload: line('two') },
		]);
	});
});
