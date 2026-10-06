import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { isQuick, nextQuickName, quickKey, quickPagePath } from '../src/shared/projects';
import { type RecordStore, cloneStore, moveToCodeTask, quickBuildTask, quickReadable, recordQuick } from '../src/main/services/quick';
import { QuickServer } from '../src/main/services/quickServer';
import { claudeCodeAdapter } from '../src/main/services/agent';
import { type QuickApi, runQuickBuild } from '../src/renderer/quickBuild';
import type { BuildPhase } from '../src/renderer/localBuild';

/** A design repository held in memory. */
const memoryStore = (files: Record<string, string> = {}) => {
	const writes: string[] = [];
	const store: RecordStore = {
		read: async (p) => files[p] ?? null,
		has: async (p) => p in files,
		write: async (p, c) => {
			files[p] = c;
			writes.push(p);
		},
	};
	return { store, files, writes };
};

describe('what a quick prototype is called', () => {
	it('is keyed apart from every branch, and numbered one past the highest', () => {
		expect(quickKey('users', 'q2')).toBe('quick/users/q2');
		expect(isQuick('quick/users/q2')).toBe(true);
		expect(isQuick('fd/users/i1')).toBe(false);
		expect(nextQuickName(['i1', 'codebase'])).toBe('q1');
		expect(nextQuickName(['q1', 'q3', 'i2'])).toBe('q4');
		expect(quickPagePath('users', 'q1')).toBe('projects/users/quick/q1.html');
	});
});

describe('recordQuick', () => {
	const me = { name: 'Noah', login: 'noah' };
	const now = new Date('2026-10-06T12:00:00Z');

	it('starts a new project with its brief, then records the quick prototype', async () => {
		const { store, files, writes } = memoryStore();
		const it = await recordQuick(store, { projectId: 'users', title: 'Users — inactivity', note: 'flag inactive users', me, now });
		expect(it).toMatchObject({ name: 'q1', branch: 'quick/users/q1', contributors: [me], createdAt: now.toISOString() });
		expect(files['projects/users/brief.md']).toBe('# Users — inactivity\n\nflag inactive users\n');
		expect(it.note).toBe('flag inactive users');
		expect(JSON.parse(files['projects/users/iterations.json'] as string)).toHaveLength(1);
		// The brief first: a record that names a project with no brief would list it under its bare id.
		expect(writes).toEqual(['projects/users/brief.md', 'projects/users/iterations.json']);
	});

	it("adds to an existing project's records and leaves its brief alone", async () => {
		const { store, files } = memoryStore({
			'projects/users/brief.md': '# Users\n\nThe real brief.\n',
			'projects/users/iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/users/i1' }, { name: 'q1', branch: 'quick/users/q1' }]),
		});
		const it = await recordQuick(store, { projectId: 'users', title: 'Other', note: 'n', me: null, now });
		expect(it.name).toBe('q2');
		expect(it.contributors).toBeUndefined();
		expect(files['projects/users/brief.md']).toBe('# Users\n\nThe real brief.\n');
		expect(JSON.parse(files['projects/users/iterations.json'] as string).map((i: { name: string }) => i.name)).toEqual(['i1', 'q1', 'q2']);
	});

	it('keeps the whole request in the brief, and its first line on the record', async () => {
		const { store, files } = memoryStore();
		const it = await recordQuick(store, { projectId: 'users', title: 'Users', note: 'Add a Usage tab.\n\nWho uses it: admins.\n', me, now });
		expect(files['projects/users/brief.md']).toBe('# Users\n\nAdd a Usage tab.\n\nWho uses it: admins.\n');
		expect(it.note).toBe('Add a Usage tab.');
	});

	it('keeps what it was modelled on', async () => {
		const { store } = memoryStore();
		const basedOn = { repository: 'flock-coke', branch: 'develop', commit: 'abc1234' };
		expect((await recordQuick(store, { projectId: 'users', title: 't', note: 'n', me, basedOn, now })).basedOn).toEqual(basedOn);
	});

	it('refuses to write over records it cannot read', async () => {
		const { store, writes } = memoryStore({ 'projects/users/iterations.json': '{not json' });
		await expect(recordQuick(store, { projectId: 'users', title: 't', note: 'n', me, now })).rejects.toThrow(/not readable JSON/);
		expect(writes).toEqual([]);
	});
});

describe('cloneStore', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('writes into the clone, then has the change published', async () => {
		dir = mkdtempSync(join(tmpdir(), 'fd-quick-clone-'));
		const published = vi.fn();
		const store = cloneStore(dir, published);
		await store.write('projects/users/quick/q1.html', '<p>hi</p>', 'm');
		expect(readFileSync(join(dir, 'projects/users/quick/q1.html'), 'utf8')).toBe('<p>hi</p>');
		expect(await store.read('projects/users/quick/q1.html')).toBe('<p>hi</p>');
		expect(await store.read('projects/users/nothing.md')).toBeNull();
		expect(published).toHaveBeenCalledOnce();
	});

	it('never writes outside the clone', async () => {
		dir = mkdtempSync(join(tmpdir(), 'fd-quick-clone-'));
		await expect(cloneStore(dir, vi.fn()).write('../outside.html', 'x', 'm')).rejects.toThrow();
		expect(existsSync(join(dir, '..', 'outside.html'))).toBe(false);
	});
});

describe('what the agent is told', () => {
	const sources = {
		code: '/q/source/coke',
		productGuidance: '/c/coke/.flkd',
		designSystemGuidance: '/c/fui',
		installedDesignSystem: null,
		sharedStandards: '/d/standards',
		nodeModules: '/c/node_modules',
	};
	const build = { source: '/q/users/q1.tsx', page: '/q/users/q1.html', buildCommand: 'node /q/build-quick.mjs /e /q/users/q1.tsx /q/users/q1.html /c/node_modules /q/_shared' };

	it('names the source to write, the exact command that checks it builds, and every folder it may read, read-only', () => {
		const task = quickBuildTask({ skill: '# Skill', build, sources, request: 'A users list' });
		expect(task.startsWith('# Skill')).toBe(true);
		expect(task).toContain('Write `/q/users/q1.tsx`');
		expect(task).toContain(`\`${build.buildCommand}\``);
		expect(task).toContain('Read only: never change anything');
		for (const dir of ['/q/source/coke', '/c/coke/.flkd', '/c/fui', '/d/standards', '/c/node_modules']) expect(task).toContain(`\`${dir}\``);
		expect(task.trimEnd().endsWith('A users list')).toBe(true);
	});

	it('says what is missing rather than leaving the agent to guess', () => {
		expect(quickBuildTask({ skill: 's', build, sources, request: 'r' })).toContain('The design system as installed:** not on this machine');
	});

	it('lets the agent read only the folders that exist', () => {
		expect(quickReadable(sources)).toEqual(['/q/source/coke', '/c/coke/.flkd', '/c/fui', '/d/standards', '/c/node_modules']);
		expect(quickReadable(null)).toEqual([]);
	});

	it('asks for the audit before any code changes', () => {
		const task = moveToCodeTask({ skill: 's', pageFile: '/q/q1.html', auditFile: '/d/projects/users/audit-q1.md', name: 'q1' });
		expect(task).toContain('Write the audit to `/d/projects/users/audit-q1.md` before you change any code.');
	});

	it('lets the agent read the product but never change it', () => {
		const argv = claudeCodeAdapter.argvFor('t', { readOnly: ['/c/coke'] });
		const settings = JSON.parse(argv[argv.indexOf('--settings') + 1] as string);
		expect(settings.permissions).toEqual({ allow: ['Read(//c/coke/**)'], deny: ['Edit(//c/coke/**)', 'Write(//c/coke/**)'] });
		expect(argv).not.toContain('--add-dir');
		// No product, no permissions block: nothing extra is granted.
		const plain = JSON.parse(claudeCodeAdapter.argvFor('t')[claudeCodeAdapter.argvFor('t').indexOf('--settings') + 1] as string);
		expect(plain.permissions).toBeUndefined();
	});
});

describe('QuickServer', () => {
	it('serves a page it was given on this machine only, and nothing else', async () => {
		const server = new QuickServer();
		try {
			const url = await server.serve('users/q1', '<h1>Hi</h1>');
			expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/users\/q1\/$/);
			const res = await fetch(url);
			expect(res.headers.get('content-type')).toContain('text/html');
			expect(await res.text()).toBe('<h1>Hi</h1>');
			expect((await fetch(url.replace('/users/q1/', '/users/q2/'))).status).toBe(404);
			// A shared file, served beside every page by its name, as the data it was embedded as.
			server.share('0123456789abcdef', `data:font/woff2;base64,${Buffer.from('font bytes').toString('base64')}`);
			const font = await fetch(url.replace('/users/q1/', '/_shared/0123456789abcdef'));
			expect(font.headers.get('content-type')).toBe('font/woff2');
			expect(await font.text()).toBe('font bytes');
			expect(server.hasShared('0123456789abcdef')).toBe(true);
			// Serving again replaces it.
			await server.serve('users/q1', '<h1>Again</h1>');
			expect(await (await fetch(url)).text()).toBe('<h1>Again</h1>');
		} finally {
			server.close();
		}
	});
});

describe('runQuickBuild', () => {
	const project: Project = { id: 'users', title: 'Users', records: [], iterations: [], people: [], openComments: 0 };
	const iteration: ProjectIteration = { name: 'q1', branch: 'quick/users/q1', issueNumber: null, previewUrl: null, commit: null, contributors: [], createdAt: null, route: null };
	const api = (over: Partial<Record<keyof QuickApi, unknown>> = {}) => {
		const calls: string[] = [];
		const ok = (name: string, value: unknown) => vi.fn(async () => (calls.push(name), { ok: true as const, value }));
		const a = {
			buildQuick: ok('buildQuick', { state: 'running', startedAt: 'now' }),
			agentStatus: ok('agentStatus', { state: 'finished', exitCode: 0 }),
			saveQuick: ok('saveQuick', null),
			openQuick: ok('openQuick', 'http://127.0.0.1:5000/users/q1/'),
			...over,
		} as unknown as QuickApi;
		return { a, calls };
	};
	const run = async (a: QuickApi, task?: string) => {
		const phases: BuildPhase[] = [];
		const url = await runQuickBuild({ api: a, project, iteration, task, isLive: () => true, onPhase: (p) => phases.push(p), pollMs: 1 });
		return { url, phases: phases.map((p) => p.kind) };
	};

	it('builds, saves, then shows new work', async () => {
		const { a, calls } = api();
		const { url, phases } = await run(a, 'A users list');
		expect(url).toBe('http://127.0.0.1:5000/users/q1/');
		expect(phases).toEqual(['agent', 'preview', 'running']);
		expect(calls).toEqual(['agentStatus', 'buildQuick', 'agentStatus', 'saveQuick', 'openQuick']);
	});

	it('only opens work that already exists', async () => {
		const { a, calls } = api();
		expect((await run(a)).phases).toEqual(['preview', 'running']);
		expect(calls).toEqual(['agentStatus', 'openQuick']);
	});

	it('picks up a build still running when the screen is opened again, then saves and shows it', async () => {
		let asked = 0;
		const agentStatus = vi.fn(async () => ({
			ok: true as const,
			value: asked++ < 2 ? { state: 'running', startedAt: 'now', work: 'quick/users/q1' } : { state: 'finished', exitCode: 0, work: 'quick/users/q1' },
		}));
		const { a, calls } = api({ agentStatus });
		const { url, phases } = await run(a);
		expect(phases).toEqual(['agent', 'preview', 'running']);
		expect(url).toBe('http://127.0.0.1:5000/users/q1/');
		// It waits on the run that is there; it never starts a second one.
		expect(calls).not.toContain('buildQuick');
		expect(calls).toContain('saveQuick');
	});

	it("does not wait on another piece of work's run", async () => {
		const { a, calls } = api({ agentStatus: vi.fn(async () => ({ ok: true as const, value: { state: 'running', startedAt: 'now', work: 'quick/other/q1' } })) });
		expect((await run(a)).phases).toEqual(['preview', 'running']);
		expect(calls).toEqual(['openQuick']);
	});

	it('does not show a page that could not be saved, and says why', async () => {
		const { a } = api({ saveQuick: vi.fn(async () => ({ ok: false, error: 'Saving needs write access.' })) });
		const phases: BuildPhase[] = [];
		await runQuickBuild({ api: a, project, iteration, task: 't', isLive: () => true, onPhase: (p) => phases.push(p), pollMs: 1 });
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'Saving needs write access.' });
	});
});
