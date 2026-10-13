import { describe, expect, it, vi } from 'vitest';
import { VsCodeGitHub } from '../extension/src/github';
import { vscodePorts } from '../extension/src/vscodePorts';
import { reviewPath } from '../extension/src/review';
import { answerCall } from '../extension/src/bridge';
import type { Route } from '../src/main/handle';
import type { InvokeName } from '../src/shared/contract';

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
		await expect(github.startSignIn()).rejects.toThrow(/button at the top of DSNR's panel/);
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
		const ports = vscodePorts(v as never);
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

	it('say what is not built yet, rather than failing quietly', async () => {
		const ports = vscodePorts(fake() as never);
		await expect(ports.headless.draw('http://127.0.0.1/x')).rejects.toThrow(/later update/);
	});
});

describe('a prototype’s review', () => {
	it('is its page on the site, by version and iteration, as the site lays it out', () => {
		expect(reviewPath('alert-history', 'v2-i1')).toBe('alert-history/v2/i1/');
		expect(reviewPath('admin-usage', 'i1')).toBe('admin-usage/v1/i1/');
		expect(() => reviewPath('admin-usage', 'codebase')).toThrow(/not a prototype/);
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
});
