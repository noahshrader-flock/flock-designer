import { request } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPrototypeKey, prototypeKey, prototypePagePath } from '../src/shared/designPaths';
import { nextPrototypeName } from '../src/shared/prototypeNames';
import { cloneStore, buildInCodebasePrompt, prototypeReadable, recordPrototype, setCover } from '../src/main/services/prototype';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { memoryStore } from './fixtures';
import { prototypeBuildTask } from '../src/main/services/agentTasks';
import { claudeCodeAdapter } from '../src/main/services/agent';

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
		const recorded = await recordPrototype(store, { projectId: 'users', title: 'Users — inactivity', note: 'flag inactive users', me, now });
		expect(recorded).toMatchObject({ name: 'v1-i1', branch: 'prototype/users/v1-i1', contributors: [me], createdAt: now.toISOString() });
		expect(files['projects/users/brief.md']).toBe('# Users — inactivity\n\nflag inactive users\n');
		expect(recorded.note).toBe('flag inactive users');
		expect(JSON.parse(files['projects/users/iterations.json'] as string)).toHaveLength(1);
		// The brief first: a record that names a project with no brief would list recorded under its bare id.
		expect(writes).toEqual(['projects/users/brief.md', 'projects/users/iterations.json']);
	});

	it("adds to an existing project's records and leaves its brief alone", async () => {
		const { store, files } = memoryStore({
			'projects/users/brief.md': '# Users\n\nThe real brief.\n',
			'projects/users/iterations.json': JSON.stringify([
				{ name: 'i1', branch: 'fd/users/i1' },
				{ name: 'i2', branch: 'prototype/users/i2' },
			]),
		});
		const recorded = await recordPrototype(store, { projectId: 'users', title: 'Other', note: 'n', me: null, now });
		// Another prototype on a project is another idea: the next version, after the older names, which are version 1.
		expect(recorded.name).toBe('v2-i1');
		expect(recorded.contributors).toBeUndefined();
		expect(files['projects/users/brief.md']).toBe('# Users\n\nThe real brief.\n');
		expect(JSON.parse(files['projects/users/iterations.json'] as string).map((i: { name: string }) => i.name)).toEqual(['i1', 'i2', 'v2-i1']);
	});

	it('keeps the whole request in the brief, and its first line on the record', async () => {
		const { store, files } = memoryStore();
		const recorded = await recordPrototype(store, {
			projectId: 'users',
			title: 'Users',
			note: 'Add a Usage tab.\n\nWho uses recorded: admins.\n',
			me,
			now,
		});
		expect(files['projects/users/brief.md']).toBe('# Users\n\nAdd a Usage tab.\n\nWho uses recorded: admins.\n');
		expect(recorded.note).toBe('Add a Usage tab.');
	});

	it('keeps what it was modeled on', async () => {
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

describe('setCover', () => {
	const RECORDS = 'projects/users/iterations.json';
	const rec = (name: string, more: Record<string, unknown> = {}) => ({
		projectId: 'users',
		name,
		branch: `prototype/users/${name}`,
		commit: null,
		createdAt: '2026-10-10T00:00:00Z',
		note: '',
		...more,
	});

	it('says on one prototype’s record which picture is its, and changes nothing else', async () => {
		const { store, files } = memoryStore({ [RECORDS]: JSON.stringify([rec('v1-i1', { previewUrl: 'https://x.test' }), rec('v2-i1')]) });
		expect(await setCover(store, 'users', 'v1-i1', 'aaaaaaaaaaaa')).toBe(true);
		const after = JSON.parse(files[RECORDS] as string) as Array<Record<string, unknown>>;
		expect(after).toEqual([rec('v1-i1', { previewUrl: 'https://x.test', cover: 'aaaaaaaaaaaa' }), rec('v2-i1')]);
	});

	it('writes nothing for a prototype it has no record of, and refuses a picture that is not a hash', async () => {
		const { store, writes } = memoryStore({ [RECORDS]: JSON.stringify([rec('v1-i1')]) });
		expect(await setCover(store, 'users', 'v9-i1', 'aaaaaaaaaaaa')).toBe(false);
		await expect(setCover(store, 'users', 'v1-i1', '../../x')).rejects.toThrow();
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

	it('writes a picture as the bytes it is, and reads it back as bytes', async () => {
		dir = mkdtempSync(join(tmpdir(), 'fd-prototype-clone-'));
		const store = cloneStore(dir, vi.fn());
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x80, 0xfe]);
		await store.write('projects/users/covers/v1-i1-aaaaaaaaaaaa.jpg', jpeg, 'm');
		expect(readFileSync(join(dir, 'projects/users/covers/v1-i1-aaaaaaaaaaaa.jpg'))).toEqual(jpeg);
		expect(await store.readBytes('projects/users/covers/v1-i1-aaaaaaaaaaaa.jpg')).toEqual(jpeg);
		expect(await store.readBytes('projects/users/covers/none.jpg')).toBeNull();
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
	const build = {
		source: '/q/users/i1.tsx',
		page: '/q/users/i1.html',
		buildCommand: 'node /q/build-prototype.mjs /e /q/users/i1.tsx /q/users/i1.html /c/node_modules /q/_shared',
		checkCommand: 'node /q/check-prototype.mjs /q/users/i1.build-check.json',
	};

	it('names the source to write, the exact command that checks it builds, and every folder it may read, read-only', () => {
		const task = prototypeBuildTask({ guide: '', skill: '# Skill', build, sources, accessibility: '', voice: '', request: 'A users list' });
		expect(task.startsWith('# Skill')).toBe(true);
		expect(task).toContain('Write `/q/users/i1.tsx`');
		expect(task).toContain(`\`${build.buildCommand}\``);
		// Its accessibility checked after it builds, as the build is, for two rounds, and no words written that are a person's.
		expect(task).toContain(`check its accessibility with exactly: \`${build.checkCommand}\``);
		expect(task).toMatch(
			/two rounds are used up: then finish, and what is left is recorded with the page\. Never write words it says are a person's/,
		);
		expect(task).toContain('Read only: never change anything');
		for (const dir of ['/q/source/coke', '/c/coke/.dsnr', '/c/fui', '/d/standards', '/c/node_modules']) expect(task).toContain(`\`${dir}\``);
		expect(task.trimEnd().endsWith('A users list')).toBe(true);
	});

	it('says what is missing rather than leaving the agent to guess', () => {
		expect(prototypeBuildTask({ guide: '', skill: 's', build, sources, accessibility: '', voice: '', request: 'r' })).toContain(
			'The design system as installed:** not on this machine',
		);
	});

	it('lets the agent read only the folders that exist', () => {
		expect(prototypeReadable(sources)).toEqual(['/q/source/coke', '/c/coke/.dsnr', '/c/fui', '/d/standards', '/c/node_modules']);
		expect(prototypeReadable(null)).toEqual([]);
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
	it('serves what came from a repository on an address of its own: the bar’s address serves only what DSNR wrote', async () => {
		const server = new PrototypeServer();
		const site = mkdtempSync(join(tmpdir(), 'dsnr-site-'));
		const previews = mkdtempSync(join(tmpdir(), 'dsnr-previews-'));
		try {
			mkdirSync(join(site, 'a', 'v1', 'i1'), { recursive: true });
			mkdirSync(join(site, '_shared'), { recursive: true });
			mkdirSync(join(site, '_viewer'), { recursive: true });
			writeFileSync(join(site, 'a', 'v1', 'i1', 'index.html'), '<p>the bar</p>');
			writeFileSync(join(site, 'a', 'v1', 'i1', 'page.html'), '<p>the prototype</p>');
			writeFileSync(join(site, '_viewer', 'viewer.js'), 'bar();');
			writeFileSync(join(site, '_shared', 'font.woff2'), 'font');
			writeFileSync(join(site, '_shared', 'logo.svg'), '<svg onload="alert(1)"/>');
			writeFileSync(join(previews, 'index.html'), '<p>stories</p>');
			const app = await server.origin();
			const pages = await server.pagesOrigin();
			expect(pages).not.toBe(app);
			expect(await server.serveFolder('review', site)).toBe(`${app}/review/`);
			expect(await server.serveFolder('previews-x', previews, { code: true })).toBe(`${pages}/previews-x/`);
			const status = async (url: string) => (await fetch(url)).status;
			// The bar and its own files on the app's address.
			expect(await status(`${app}/review/a/v1/i1/`)).toBe(200);
			expect(await status(`${app}/review/_viewer/viewer.js`)).toBe(200);
			expect(await status(`${app}/review/_shared/font.woff2`)).toBe(200);
			// Nothing a repository wrote that opens as a page: the prototype, however it is spelled (a Mac's disk ignores
			// case), and a picture that can carry a script.
			for (const named of ['page.html', 'Page.html', 'PAGE.HTML']) expect(await status(`${app}/review/a/v1/i1/${named}`)).toBe(404);
			expect(await status(`${app}/review/_shared/logo.svg`)).toBe(404);
			// All of it on the pages' address.
			expect(await (await fetch(`${pages}/review/a/v1/i1/page.html`)).text()).toBe('<p>the prototype</p>');
			expect(await status(`${pages}/review/_shared/logo.svg`)).toBe(200);
			// Story previews, a library's code, on the pages' address only.
			expect(await status(`${app}/previews-x/`)).toBe(404);
			expect(await status(`${pages}/previews-x/`)).toBe(200);
			// A prototype given whole (the app's preview, a cover, a check) and what it shares, on the pages' address only.
			const own = await server.serve('p/i1', '<h1>Hi</h1>');
			server.share('0123456789abcdef', 'data:text/html,<script>bar()</script>');
			expect(own).toBe(`${pages}/p/i1/`);
			expect(await status(`${app}/p/i1/`)).toBe(404);
			expect(await status(`${app}/_shared/0123456789abcdef`)).toBe(404);
			expect(await status(`${pages}/_shared/0123456789abcdef`)).toBe(200);
			// No browser takes a file for something else than it is said to be.
			expect((await fetch(`${app}/review/a/v1/i1/`)).headers.get('x-content-type-options')).toBe('nosniff');
			expect((await fetch(own)).headers.get('x-content-type-options')).toBe('nosniff');
		} finally {
			server.close();
			rmSync(site, { recursive: true, force: true });
			rmSync(previews, { recursive: true, force: true });
		}
	});

	it('answers only what is asked of its own address: a page with another name for this machine gets nothing', async () => {
		const server = new PrototypeServer();
		try {
			const url = await server.serve('x', '<p>x</p>');
			const port = new URL(url).port;
			const appPort = new URL(await server.origin()).port;
			const ask = (at: string, host: string) =>
				new Promise<number>((resolve, reject) =>
					request({ host: '127.0.0.1', port: at, path: '/x/', headers: { host } }, (res) => resolve(res.statusCode ?? 0))
						.on('error', reject)
						.end(),
				);
			expect(await ask(port, `127.0.0.1:${port}`)).toBe(200);
			expect(await ask(port, `attacker.example:${port}`)).toBe(403);
			expect(await ask(port, `localhost:${port}`)).toBe(403);
			expect(await ask(port, `127.0.0.1:${appPort}`)).toBe(403);
			// The app's address answers only to its own name too.
			expect(await ask(appPort, `attacker.example:${appPort}`)).toBe(403);
			expect(await ask(appPort, `127.0.0.1:${port}`)).toBe(403);
		} finally {
			server.close();
		}
	});

	it('says its origins, starting each once however many ask at once, so a page can name them as the places it frames', async () => {
		const server = new PrototypeServer();
		try {
			const [a, b] = await Promise.all([server.origin(), server.origin()]);
			expect(a).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
			expect(b).toBe(a);
			const [c, d] = await Promise.all([server.pagesOrigin(), server.pagesOrigin()]);
			expect(d).toBe(c);
			expect(await server.serve('x', '<p>x</p>')).toBe(`${c}/x/`);
		} finally {
			server.close();
		}
	});

	describe('a browser’s ask (BROWSER_COMMENTS_PLAN 1.1)', () => {
		const KEY = 'k'.repeat(22);
		const ASK = { dsnr: 'ask', id: 1, name: 'readComments', args: [] };
		/** A request as a browser, or anything else on this machine, could make it: every part of it named. */
		const post = (
			port: string,
			{
				path = '/_dsnr/ask',
				method = 'POST',
				headers = {},
				body = JSON.stringify(ASK),
			}: { path?: string; method?: string; headers?: Record<string, string>; body?: string } = {},
		) =>
			new Promise<{ status: number; headers: Record<string, unknown>; text: string }>((resolve, reject) => {
				const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
					let text = '';
					res.on('data', (d) => (text += d));
					res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
				});
				req.on('error', reject);
				req.end(body);
			});
		const asked: { key: string; body: unknown }[] = [];
		const served = async () => {
			const server = new PrototypeServer();
			server.answerAsks(async (key, body) => {
				asked.push({ key, body });
				return key === KEY ? { dsnr: 'answer', id: 1, result: { ok: true, value: [] } } : null;
			});
			const app = await server.origin();
			const pages = await server.pagesOrigin();
			const port = new URL(app).port;
			const right = { host: `127.0.0.1:${port}`, origin: app, 'content-type': 'application/json', 'x-dsnr-key': KEY };
			return { server, app, pages, port, right };
		};

		it('is answered on the bar’s own address, from its own page, with its key: the answer as JSON, kept nowhere', async () => {
			asked.length = 0;
			const { server, port, right } = await served();
			try {
				const r = await post(port, { headers: right });
				expect(r.status).toBe(200);
				expect(JSON.parse(r.text)).toEqual({ dsnr: 'answer', id: 1, result: { ok: true, value: [] } });
				expect(r.headers['content-type']).toContain('application/json');
				expect(r.headers['cache-control']).toBe('no-store');
				expect(asked).toEqual([{ key: KEY, body: ASK }]);
			} finally {
				server.close();
			}
		});

		it('refuses any other: another name, another origin or none, no key or another, not JSON, too big, not a POST, and on the pages’ address', async () => {
			asked.length = 0;
			const { server, app, pages, port, right } = await served();
			const pagesPort = new URL(pages).port;
			try {
				const without = (name: string) => Object.fromEntries(Object.entries(right).filter(([k]) => k !== name));
				const refused = [
					await post(port, { headers: { ...right, host: `localhost:${port}` } }),
					await post(port, { headers: { ...right, origin: pages } }),
					await post(port, { headers: { ...right, origin: 'https://attacker.example' } }),
					await post(port, { headers: { ...right, origin: 'null' } }),
					await post(port, { headers: without('origin') }),
					await post(port, { headers: without('x-dsnr-key') }),
					await post(port, { headers: { ...right, 'x-dsnr-key': 'short' } }),
					await post(port, { headers: { ...right, 'x-dsnr-key': 'x'.repeat(22) } }),
					await post(port, { headers: { ...right, 'content-type': 'text/plain' } }),
					await post(port, { headers: right, body: 'not json' }),
					await post(port, { headers: right, body: JSON.stringify({ ...ASK, args: ['x'.repeat(300_000)] }) }),
					await post(port, { headers: right, method: 'GET', body: '' }),
					// A preflight, as a browser sends one for another origin's ask with its header: refused, so it never asks.
					await post(port, { headers: { host: right.host, origin: pages, 'access-control-request-method': 'POST' }, method: 'OPTIONS', body: '' }),
					await post(pagesPort, { headers: { ...right, host: `127.0.0.1:${pagesPort}`, origin: pages } }),
				];
				expect(refused.map((r) => r.status >= 400)).toEqual(refused.map(() => true));
				// No other origin is ever told it may read an answer.
				expect(refused.filter((r) => Object.keys(r.headers).some((h) => h.startsWith('access-control-')))).toEqual([]);
				// Only a request with every part right reaches the handler, which is how a key is found to be no key.
				expect(asked.map((a) => a.key)).toEqual(['x'.repeat(22)]);
				expect(app).not.toBe(pages);
			} finally {
				server.close();
			}
		});

		it('is not answered before something answers asks', async () => {
			const server = new PrototypeServer();
			try {
				const app = await server.origin();
				const port = new URL(app).port;
				const r = await post(port, { headers: { host: `127.0.0.1:${port}`, origin: app, 'content-type': 'application/json', 'x-dsnr-key': KEY } });
				expect(r.status).toBe(404);
			} finally {
				server.close();
			}
		});
	});

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
			// A page that points at shared files is served with each it lacks, read once: one it has is not read again.
			const read = vi.fn(async (n: string) => (n === 'fedcba9876543210' ? 'data:font/woff,abc' : null));
			const page = await server.servePage('users/i3', '<link href="/_shared/0123456789abcdef"><link href="/_shared/fedcba9876543210">', read);
			expect(read.mock.calls).toEqual([['fedcba9876543210']]);
			expect(await (await fetch(page.replace('/users/i3/', '/_shared/fedcba9876543210'))).text()).toBe('abc');
			// Serving again replaces it.
			await server.serve('users/i1', '<h1>Again</h1>');
			expect(await (await fetch(url)).text()).toBe('<h1>Again</h1>');
		} finally {
			server.close();
		}
	});
});

describe('the first line of a Build conversation', () => {
	const at = { label: 'V2 · I1', projectId: 'alert-history', taskFile: '/app/prototypes/alert-history/v2-i1-into-code.md' };

	it('says what to build and points at the task, for new work', () => {
		expect(buildInCodebasePrompt({ ...at, continuing: null })).toBe(
			"Build prototype V2 · I1 of alert-history into this codebase. Your task, with the skill to follow and the prototype's files, is in /app/prototypes/alert-history/v2-i1-into-code.md: read it and do what it says.",
		);
	});

	it('says to look at what is on the branch first, for work started before', () => {
		const prompt = buildInCodebasePrompt({ ...at, continuing: 'feature/alert-history' });
		expect(prompt).toMatch(
			/^Continue building prototype V2 · I1 of alert-history into this codebase, on feature\/alert-history\. Some of it may be done already, so look at the branch and the audit first\./,
		);
		expect(prompt).toContain('is in /app/prototypes/alert-history/v2-i1-into-code.md: read it and do what it says.');
	});
});
