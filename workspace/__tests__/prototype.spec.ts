import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectIteration } from '../src/shared/contract';
import { isPrototypeKey, nextPrototypeName, prototypeKey, prototypePagePath } from '../src/shared/projects';
import { type RecordStore, cloneStore, moveToCodePrompt, moveToCodeTask, prototypeBuildTask, prototypeReadable, recordPrototype } from '../src/main/services/prototype';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { claudeCodeAdapter } from '../src/main/services/agent';
import { type PrototypeApi, runPrototypeBuild } from '../src/renderer/prototypeBuild';
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

describe('what a prototype is called', () => {
	it('is keyed apart from every branch, and numbered one past the highest', () => {
		expect(prototypeKey('users', 'i2')).toBe('prototype/users/i2');
		expect(isPrototypeKey('prototype/users/i2')).toBe(true);
		expect(isPrototypeKey('fd/users/i1')).toBe(false);
		expect(nextPrototypeName(['codebase'])).toBe('v1-i1');
		expect(nextPrototypeName(['i1', 'codebase'])).toBe('v2-i1');
		expect(prototypePagePath('users', 'i1')).toBe('projects/users/prototypes/i1.html');
	});
});

describe('recordPrototype', () => {
	const me = { name: 'Noah', login: 'noah' };
	const now = new Date('2026-10-06T12:00:00Z');

	it('starts a new project with its brief, then records the prototype', async () => {
		const { store, files, writes } = memoryStore();
		const it = await recordPrototype(store, { projectId: 'users', title: 'Users — inactivity', note: 'flag inactive users', me, now });
		expect(it).toMatchObject({ name: 'v1-i1', branch: 'prototype/users/v1-i1', contributors: [me], createdAt: now.toISOString() });
		expect(files['projects/users/brief.md']).toBe('# Users — inactivity\n\nflag inactive users\n');
		expect(it.note).toBe('flag inactive users');
		expect(JSON.parse(files['projects/users/iterations.json'] as string)).toHaveLength(1);
		// The brief first: a record that names a project with no brief would list it under its bare id.
		expect(writes).toEqual(['projects/users/brief.md', 'projects/users/iterations.json']);
	});

	it("adds to an existing project's records and leaves its brief alone", async () => {
		const { store, files } = memoryStore({
			'projects/users/brief.md': '# Users\n\nThe real brief.\n',
			'projects/users/iterations.json': JSON.stringify([{ name: 'i1', branch: 'fd/users/i1' }, { name: 'i2', branch: 'prototype/users/i2' }]),
		});
		const it = await recordPrototype(store, { projectId: 'users', title: 'Other', note: 'n', me: null, now });
		// Another prototype on a project is another idea: the next version, after the older names, which are version 1.
		expect(it.name).toBe('v2-i1');
		expect(it.contributors).toBeUndefined();
		expect(files['projects/users/brief.md']).toBe('# Users\n\nThe real brief.\n');
		expect(JSON.parse(files['projects/users/iterations.json'] as string).map((i: { name: string }) => i.name)).toEqual(['i1', 'i2', 'v2-i1']);
	});

	it('keeps the whole request in the brief, and its first line on the record', async () => {
		const { store, files } = memoryStore();
		const it = await recordPrototype(store, { projectId: 'users', title: 'Users', note: 'Add a Usage tab.\n\nWho uses it: admins.\n', me, now });
		expect(files['projects/users/brief.md']).toBe('# Users\n\nAdd a Usage tab.\n\nWho uses it: admins.\n');
		expect(it.note).toBe('Add a Usage tab.');
	});

	it('keeps what it was modelled on', async () => {
		const { store } = memoryStore();
		const basedOn = { repository: 'flock-coke', branch: 'develop', commit: 'abc1234' };
		expect((await recordPrototype(store, { projectId: 'users', title: 't', note: 'n', me, basedOn, now })).basedOn).toEqual(basedOn);
	});

	it('refuses to write over records it cannot read', async () => {
		const { store, writes } = memoryStore({ 'projects/users/iterations.json': '{not json' });
		await expect(recordPrototype(store, { projectId: 'users', title: 't', note: 'n', me, now })).rejects.toThrow(/not a readable list of records/);
		expect(writes).toEqual([]);
	});

	it('refuses records that are readable but not a list, rather than writing a list over them', async () => {
		const { store, writes } = memoryStore({ 'projects/users/iterations.json': '{"name":"i1"}' });
		await expect(recordPrototype(store, { projectId: 'users', title: 't', note: 'n', me, now })).rejects.toThrow(/not a readable list/);
		expect(writes).toEqual([]);
	});
});

describe('cloneStore', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('writes into the clone, then has the change published', async () => {
		dir = mkdtempSync(join(tmpdir(), 'fd-prototype-clone-'));
		const published = vi.fn();
		const store = cloneStore(dir, published);
		await store.write('projects/users/prototypes/i1.html', '<p>hi</p>', 'm');
		expect(readFileSync(join(dir, 'projects/users/prototypes/i1.html'), 'utf8')).toBe('<p>hi</p>');
		expect(await store.read('projects/users/prototypes/i1.html')).toBe('<p>hi</p>');
		expect(await store.read('projects/users/nothing.md')).toBeNull();
		expect(published).toHaveBeenCalledOnce();
	});

	it('never writes outside the clone', async () => {
		dir = mkdtempSync(join(tmpdir(), 'fd-prototype-clone-'));
		await expect(cloneStore(dir, vi.fn()).write('../outside.html', 'x', 'm')).rejects.toThrow();
		expect(existsSync(join(dir, '..', 'outside.html'))).toBe(false);
	});
});

describe('what the agent is told', () => {
	const sources = {
		code: '/q/source/coke',
		productGuidance: '/c/coke/.dsnr',
		designSystemGuidance: '/c/fui',
		installedDesignSystem: null,
		sharedStandards: '/d/standards',
		nodeModules: '/c/node_modules',
	};
	const build = { source: '/q/users/i1.tsx', page: '/q/users/i1.html', buildCommand: 'node /q/build-prototype.mjs /e /q/users/i1.tsx /q/users/i1.html /c/node_modules /q/_shared' };

	it('names the source to write, the exact command that checks it builds, and every folder it may read, read-only', () => {
		const task = prototypeBuildTask({ skill: '# Skill', build, sources, request: 'A users list' });
		expect(task.startsWith('# Skill')).toBe(true);
		expect(task).toContain('Write `/q/users/i1.tsx`');
		expect(task).toContain(`\`${build.buildCommand}\``);
		expect(task).toContain('Read only: never change anything');
		for (const dir of ['/q/source/coke', '/c/coke/.dsnr', '/c/fui', '/d/standards', '/c/node_modules']) expect(task).toContain(`\`${dir}\``);
		expect(task.trimEnd().endsWith('A users list')).toBe(true);
	});

	it('says what is missing rather than leaving the agent to guess', () => {
		expect(prototypeBuildTask({ skill: 's', build, sources, request: 'r' })).toContain('The design system as installed:** not on this machine');
	});

	it('lets the agent read only the folders that exist', () => {
		expect(prototypeReadable(sources)).toEqual(['/q/source/coke', '/c/coke/.dsnr', '/c/fui', '/d/standards', '/c/node_modules']);
		expect(prototypeReadable(null)).toEqual([]);
	});

	it('asks for the audit before any code changes', () => {
		const task = moveToCodeTask({ skill: 's', pageFile: '/q/i1.html', auditFile: '/d/projects/users/audit-i1.md', name: 'i1' });
		expect(task).toContain('Write the audit to `/d/projects/users/audit-i1.md` before you change any code.');
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

describe('PrototypeServer', () => {
	it('serves a page it was given on this machine only, and nothing else', async () => {
		const server = new PrototypeServer();
		try {
			const url = await server.serve('users/i1', '<h1>Hi</h1>');
			expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/users\/i1\/$/);
			const res = await fetch(url);
			expect(res.headers.get('content-type')).toContain('text/html');
			expect(await res.text()).toBe('<h1>Hi</h1>');
			expect((await fetch(url.replace('/users/i1/', '/users/i2/'))).status).toBe(404);
			// A shared file, served beside every page by its name, as the data it was embedded as.
			server.share('0123456789abcdef', `data:font/woff2;base64,${Buffer.from('font bytes').toString('base64')}`);
			const font = await fetch(url.replace('/users/i1/', '/_shared/0123456789abcdef'));
			expect(font.headers.get('content-type')).toBe('font/woff2');
			expect(await font.text()).toBe('font bytes');
			expect(server.hasShared('0123456789abcdef')).toBe(true);
			// Serving again replaces it.
			await server.serve('users/i1', '<h1>Again</h1>');
			expect(await (await fetch(url)).text()).toBe('<h1>Again</h1>');
		} finally {
			server.close();
		}
	});
});

describe('runPrototypeBuild', () => {
	const project: Project = { id: 'users', title: 'Users', records: [], iterations: [], people: [] };
	const iteration: ProjectIteration = { name: 'i1', branch: 'prototype/users/i1', issueNumber: null, previewUrl: null, commit: null, contributors: [], createdAt: null, route: null };
	const api = (over: Partial<Record<keyof PrototypeApi, unknown>> = {}) => {
		const calls: string[] = [];
		const ok = (name: string, value: unknown) => vi.fn(async () => (calls.push(name), { ok: true as const, value }));
		const a = {
			buildPrototype: ok('buildPrototype', { state: 'running', startedAt: 'now' }),
			agentStatus: ok('agentStatus', { state: 'finished', exitCode: 0 }),
			savePrototype: ok('savePrototype', null),
			openPrototype: ok('openPrototype', { url: 'http://127.0.0.1:5000/users/i1/', states: ['default', 'empty'] }),
			...over,
		} as unknown as PrototypeApi;
		return { a, calls };
	};
	const run = async (a: PrototypeApi, task?: string) => {
		const phases: BuildPhase[] = [];
		const url = await runPrototypeBuild({ api: a, project, iteration, task, isLive: () => true, onPhase: (p) => phases.push(p), pollMs: 1 });
		return { url, phases: phases.map((p) => p.kind) };
	};

	it('builds, saves, then shows new work', async () => {
		const { a, calls } = api();
		const { url, phases } = await run(a, 'A users list');
		expect(url).toBe('http://127.0.0.1:5000/users/i1/');
		expect(phases).toEqual(['agent', 'preview', 'running']);
		expect(calls).toEqual(['agentStatus', 'buildPrototype', 'agentStatus', 'savePrototype', 'openPrototype']);
	});

	it('shows the page with the states it has', async () => {
		const phases: BuildPhase[] = [];
		await runPrototypeBuild({ api: api().a, project, iteration, isLive: () => true, onPhase: (p) => phases.push(p), pollMs: 1 });
		expect(phases.at(-1)).toEqual({ kind: 'running', url: 'http://127.0.0.1:5000/users/i1/', states: ['default', 'empty'] });
	});

	it('only opens work that already exists', async () => {
		const { a, calls } = api();
		expect((await run(a)).phases).toEqual(['preview', 'running']);
		expect(calls).toEqual(['agentStatus', 'openPrototype']);
	});

	it('picks up a build still running when the screen is opened again, then saves and shows it', async () => {
		let asked = 0;
		const agentStatus = vi.fn(async () => ({
			ok: true as const,
			value: asked++ < 2 ? { state: 'running', startedAt: 'now', work: 'prototype/users/i1' } : { state: 'finished', exitCode: 0, work: 'prototype/users/i1' },
		}));
		const { a, calls } = api({ agentStatus });
		const { url, phases } = await run(a);
		expect(phases).toEqual(['agent', 'preview', 'running']);
		expect(url).toBe('http://127.0.0.1:5000/users/i1/');
		// It waits on the run that is there; it never starts a second one.
		expect(calls).not.toContain('buildPrototype');
		expect(calls).toContain('savePrototype');
	});

	it("does not wait on another piece of work's run", async () => {
		const { a, calls } = api({ agentStatus: vi.fn(async () => ({ ok: true as const, value: { state: 'running', startedAt: 'now', work: 'prototype/other/i1' } })) });
		expect((await run(a)).phases).toEqual(['preview', 'running']);
		expect(calls).toEqual(['openPrototype']);
	});

	it('does not show a page that could not be saved, and says why', async () => {
		const { a } = api({ savePrototype: vi.fn(async () => ({ ok: false, error: 'Saving needs write access.' })) });
		const phases: BuildPhase[] = [];
		await runPrototypeBuild({ api: a, project, iteration, task: 't', isLive: () => true, onPhase: (p) => phases.push(p), pollMs: 1 });
		expect(phases.at(-1)).toEqual({ kind: 'failed', message: 'Saving needs write access.' });
	});
});

describe('the first line of a Build conversation', () => {
	const at = { label: 'V2 · I1', projectId: 'alert-history', taskFile: '/app/prototypes/alert-history/v2-i1-into-code.md' };

	it('says what to build and points at the task, for new work', () => {
		expect(moveToCodePrompt({ ...at, continuing: null })).toBe(
			"Build prototype V2 · I1 of alert-history into this codebase. Your task, with the skill to follow and the prototype's files, is in /app/prototypes/alert-history/v2-i1-into-code.md: read it and do what it says.",
		);
	});

	it('says to look at what is on the branch first, for work started before', () => {
		const prompt = moveToCodePrompt({ ...at, continuing: 'feature/alert-history' });
		expect(prompt).toMatch(/^Continue building prototype V2 · I1 of alert-history into this codebase, on feature\/alert-history\. Some of it may be done already, so look at the branch and the audit first\./);
		expect(prompt).toContain('is in /app/prototypes/alert-history/v2-i1-into-code.md: read it and do what it says.');
	});
});
