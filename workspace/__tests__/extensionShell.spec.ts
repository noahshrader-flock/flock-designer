import { describe, expect, it, vi } from 'vitest';
import { VsCodeGitHub } from '../extension/src/github';
import { vscodePorts } from '../extension/src/vscodePorts';
import { reviewsOf } from '../extension/src/messages';
import { Reviews, answerReview, reviewPage, reviewPath } from '../extension/src/review';
import { Panels, answerCall, hostApi } from '../extension/src/bridge';
import type { Route } from '../src/main/handle';
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

describe('VS Code’s ports', () => {
	const fake = () => ({
		window: { showOpenDialog: vi.fn(async (_options: unknown) => [{ fsPath: '/picked' }]), showInformationMessage: vi.fn(async () => undefined) },
		env: { openExternal: vi.fn(async () => true), clipboard: { writeText: vi.fn(async () => undefined) } },
		commands: { executeCommand: vi.fn(async () => undefined) },
		Uri: { file: (p: string) => ({ fsPath: p }), parse: (u: string) => ({ toString: () => u }) },
	});

	it('are VS Code’s own: its folder picker, its messages, its links, its clipboard, its reveal', async () => {
		const v = fake();
		const ports = vscodePorts(v as never, { draw: vi.fn(), scan: vi.fn(), measure: vi.fn() });
		expect(await ports.chooseFolder({ title: 'Locate design system' })).toBe('/picked');
		expect(v.window.showOpenDialog.mock.calls[0]?.[0]).toMatchObject({
			title: 'Locate design system',
			canSelectFolders: true,
			canSelectFiles: false,
		});
		await ports.tell({ message: 'Done', detail: 'It is.' });
		expect(v.window.showInformationMessage).toHaveBeenCalledWith('Done', { modal: true, detail: 'It is.' });
		await ports.copy('x');
		expect(v.env.clipboard.writeText).toHaveBeenCalledWith('x');
		await ports.openPath('/a');
		expect(v.commands.executeCommand).toHaveBeenCalledWith('revealFileInOS', { fsPath: '/a' });
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
	const deps = () => {
		const routes = new Map<InvokeName, Route>([
			['readComments', async (...args) => ({ ok: true, value: ['read', ...args] })],
			['postComment', async (...args) => ({ ok: true, value: ['posted', ...args] })],
			['resolveComment', async (...args) => ({ ok: true, value: ['resolved', ...args] })],
		]);
		return {
			routes: () => routes,
			signIn: vi.fn(async () => ({ state: 'signedOut' as const })),
			address: vi.fn(async () => null),
		};
	};

	it('are the core’s comment calls, VS Code’s sign-in, and Address on this review’s prototype', async () => {
		const d = deps();
		expect(await answerReview(d, review, 'readComments', ['demo', 'prototype/demo/v1-i1'])).toEqual({
			ok: true,
			value: ['read', 'demo', 'prototype/demo/v1-i1'],
		});
		expect(await answerReview(d, review, 'resolveComment', [{ thread: 1, id: 2 }, true])).toMatchObject({ ok: true });
		expect(await answerReview(d, review, 'signIn', [])).toEqual({ ok: true, value: { state: 'signedOut' } });
		await answerReview(d, review, 'address', [{ thread: 1, id: 2 }]);
		expect(d.address).toHaveBeenCalledWith(review, { thread: 1, id: 2 });
	});

	it('are only about this review’s project, and say so for anything else', async () => {
		const d = deps();
		expect(await answerReview(d, review, 'postComment', ['other', 'prototype/other/v1-i1', 'x', null])).toEqual({
			ok: false,
			error: 'This review is of demo, so it comments only on demo.',
		});
		expect(await answerReview(d, review, 'address', ['not a comment'])).toEqual({ ok: false, error: 'Address is given one comment.' });
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

	it('is held until the page is listening, then sent once, in order', () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		panels.show({ type: 'open-assign-folder', projectId: 'demo' });
		panels.show({ type: 'open-new-prototype' });
		expect(a.posted).toEqual([]);
		panels.ready(a.webview);
		expect(a.posted).toEqual([{ type: 'open-assign-folder', projectId: 'demo' }, { type: 'open-new-prototype' }]);
		panels.ready(a.webview);
		expect(a.posted).toHaveLength(2);
	});

	it('is sent at once to a page that is listening', () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		panels.ready(a.webview);
		panels.show({ type: 'open-new-prototype' });
		expect(a.posted).toEqual([{ type: 'open-new-prototype' }]);
	});

	it('is held again when the page goes (its view was hidden, and reloads when it is shown)', () => {
		const panels = new Panels();
		const a = webview();
		panels.add(a.webview);
		panels.ready(a.webview);
		panels.unready(a.webview);
		panels.show({ type: 'open-new-prototype' });
		expect(a.posted).toEqual([]);
		panels.ready(a.webview);
		expect(a.posted).toEqual([{ type: 'open-new-prototype' }]);
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
			{ type: 'answer', id: 4, result: { ok: false, error: 'readCheckout is not answered in VS Code yet.' } },
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
		expect(await api.readCheckout('/p')).toEqual({ ok: false, error: 'readCheckout is not answered in VS Code yet.' });
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
