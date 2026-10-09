import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli/flkd';
import { g, installDesignSystem, makeProduct } from './fixtures';

/**
 * `flkd`, the command an agent runs from Claude Code in VS Code to make a prototype with no app running. Against a
 * temporary product checkout and design repository side by side, and the real bundler, as on a designer's machine.
 */

let home: string;
let product: string;
let design: string;
let prototypes: string;
let out: string[];
let err: string[];
let github: { api: (path: string) => Promise<unknown> } | null;

const esbuild = createRequire(__filename).resolve('esbuild');
const deps = (cwd: string) => ({ cwd, out: (t: string) => out.push(t), err: (t: string) => err.push(t), prototypesRoot: prototypes, esbuild, self: ['flkd'], github });
const run = (...argv: string[]) => main(argv, deps(product));
const iterations = () => JSON.parse(readFileSync(join(design, 'projects', 'demo', 'iterations.json'), 'utf8')) as { name: string }[];

beforeEach(() => {
	home = realpathSync(mkdtempSync(join(tmpdir(), 'fdw-cli-')));
	product = join(home, 'flock-coke');
	design = join(home, 'flock-designer');
	prototypes = join(home, 'app', 'prototypes');
	out = [];
	err = [];
	github = null;

	mkdirSync(product);
	makeProduct(product);
	installDesignSystem(product);

	// The design repository: who is making the prototype is read from its git identity, the record being written there.
	mkdirSync(join(design, 'skills'), { recursive: true });
	g(design, 'init', '-q');
	g(design, 'config', 'user.name', 'Test Person');
	g(design, 'config', 'user.email', '123+test-person@users.noreply.github.com');
	writeFileSync(join(design, 'skills', 'build-prototype.md'), '# Build a prototype\n');
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('new-prototype', () => {
	it('records v1-i1 for a new project, with its brief, and prints the task', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list of cameras')).toBe(0);

		expect(iterations()).toMatchObject([
			{ name: 'v1-i1', branch: 'prototype/demo/v1-i1', basedOn: { repository: 'flock-coke', branch: 'develop' }, contributors: [{ name: 'Test Person', login: 'test-person' }] },
		]);
		expect(readFileSync(join(design, 'projects', 'demo', 'brief.md'), 'utf8')).toBe('# Demo\n\nA list of cameras\n');

		const task = out.join('\n');
		expect(task).toContain('# Build a prototype');
		expect(task).toContain(`Write \`${join(prototypes, 'demo', 'v1-i1.tsx')}\``);
		expect(task).toContain(join(prototypes, 'build-prototype.mjs'));
		expect(task).toContain('A list of cameras');
		expect(task).toContain(`flkd save-prototype --project demo --name v1-i1 --product ${product}`);
		// It finishes by publishing, and with the link the command printed, or why there is none.
		expect(task).toContain('flkd publish --project demo --name v1-i1');
		expect(task).toMatch(/Never give a link the command did not print/);
	});

	it('makes the next version for a project that has one, keeping its brief', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		const brief = readFileSync(join(design, 'projects', 'demo', 'brief.md'), 'utf8');
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea: a map')).toBe(0);
		expect(iterations().map((i) => i.name)).toEqual(['v1-i1', 'v2-i1']);
		expect(readFileSync(join(design, 'projects', 'demo', 'brief.md'), 'utf8')).toBe(brief);
	});

	it('is modelled on the branch named, when there is one', async () => {
		g(product, 'branch', 'noah/baseline');
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list', '--from', 'noah/baseline')).toBe(0);
		expect(iterations()[0]).toMatchObject({ basedOn: { branch: 'noah/baseline' } });
		expect(await run('new-prototype', '--project', 'demo', '--note', 'A list', '--from', 'nope')).toBe(1);
		expect(err.join('\n')).toMatch(/no branch called nope/);
	});

	it('records nothing when it cannot be built here, and says what to install', async () => {
		rmSync(join(product, 'node_modules'), { recursive: true, force: true });
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(1);
		expect(err.join('\n')).toMatch(/npm ci/);
		expect(existsSync(join(design, 'projects', 'demo'))).toBe(false);
	});

	it('asks for a title for a new project, and for what to make', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--note', 'A list')).toBe(2);
		expect(err.join('\n')).toMatch(/--title/);
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo')).toBe(2);
		expect(existsSync(join(design, 'projects', 'demo'))).toBe(false);
	});
});

describe('save-prototype', () => {
	it('builds the page from its source and saves both to the design repository', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1-i1.tsx'), "/* A page made of the real thing. */\nimport { Hello } from 'x';\nexport default () => <Hello />;\n");

		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1-i1')).toBe(0);
		const saved = join(design, 'projects', 'demo', 'prototypes');
		expect(readFileSync(join(saved, 'v1-i1.tsx'), 'utf8')).toContain("from 'x'");
		expect(readFileSync(join(saved, 'v1-i1.html'), 'utf8')).toContain('Real component');
		expect(out.at(-1)).toMatch(/It is in Flock Designer/);
	});

	it('says what the build said when the source does not compile, and saves nothing', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1-i1.tsx'), "import { Nope } from 'not-installed';\nexport default () => <Nope />;\n");
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1-i1')).toBe(1);
		expect(err.join('\n')).toMatch(/did not build[\s\S]*not-installed/);
		expect(existsSync(join(design, 'projects', 'demo', 'prototypes'))).toBe(false);
	});

	it('refuses a name that is not a prototype', async () => {
		expect(await run('save-prototype', '--project', 'demo', '--name', '../../etc')).toBe(1);
	});
});

describe('change-prototype', () => {
	const local = (name: string) => join(prototypes, 'demo', `${name}.tsx`);
	const page = (text: string) => `import { Hello } from 'x';\nexport default () => <><Hello /><p>${text}</p></>;\n`;
	/** GitHub as its API answers: who the person is, and each iteration's review thread with its commenters. */
	const signedIn = (threads: Record<string, string[]>) => {
		const names = Object.keys(threads);
		github = {
			api: async (path: string) => {
				if (path === '/user') return { login: 'test-person' };
				const thread = /\/issues\/(\d+)\/comments/.exec(path);
				if (thread) {
					return (threads[names[Number(thread[1]) - 1] as string] ?? []).map((login, i) => ({ id: i + 1, body: 'x', user: { login }, created_at: '2026-10-08T00:00:00Z' }));
				}
				if (/\/issues\?/.test(path)) return names.map((name, i) => ({ number: i + 1, body: `branch: \`prototype/demo/${name}\``, comments: 1 }));
				throw new Error(`not faked: ${path}`);
			},
		};
	};
	const made = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(local('v1-i1'), page('first'));
		await run('save-prototype', '--project', 'demo', '--name', 'v1-i1');
		out = [];
	};

	it('changes the newest iteration in place when only its maker has commented', async () => {
		signedIn({ 'v1-i1': ['test-person'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1-i1', '--note', 'Make the title bigger')).toBe(0);
		expect(out.join('\n')).toMatch(/The change is made in v1-i1: change it/);
		expect(out.join('\n')).toContain('flkd save-prototype --project demo --name v1-i1');
		writeFileSync(local('v1-i1'), page('bigger'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1-i1')).toBe(0);
		expect(iterations().map((i) => i.name)).toEqual(['v1-i1']);
	});

	it('makes the change in the next iteration once someone else has commented, recorded only when saved', async () => {
		signedIn({ 'v1-i1': ['test-person', 'pm'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1-i1', '--note', 'Make the title bigger')).toBe(0);
		expect(out.join('\n')).toMatch(/Others have commented on v1-i1/);
		// What they said is read first, from a file, and the person is told how much there is.
		const said = /2 open comments on v1-i1, in (\S+?): read them first/.exec(out.join('\n'));
		expect(said).not.toBeNull();
		expect(readFileSync(said?.[1] as string, 'utf8')).toContain('feedback');
		expect(out.join('\n')).toContain(`Write \`${local('v1-i2')}\``);
		expect(out.join('\n')).toContain('flkd publish --project demo --name v1-i2');
		expect(out.join('\n')).toContain('flkd save-prototype --project demo --name v1-i2');
		expect(readFileSync(local('v1-i2'), 'utf8')).toBe(page('first'));
		expect(iterations().map((i) => i.name)).toEqual(['v1-i1']);

		writeFileSync(local('v1-i2'), page('bigger'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1-i2')).toBe(0);
		expect(iterations()).toMatchObject([{ name: 'v1-i1' }, { name: 'v1-i2', contributors: [{ name: 'Test Person', login: 'test-person' }] }]);
		expect(readFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1-i2.html'), 'utf8')).toContain('bigger');
		expect(readFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1-i1.html'), 'utf8')).toContain('first');
	});

	it('when the comments cannot be read, never changes what people may have seen', async () => {
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1-i1', '--note', 'Bigger')).toBe(0);
		expect(out.join('\n')).toMatch(/could not be read[\s\S]*change is made in v1-i2[\s\S]*gh, is missing or not signed in/);
	});

	it('makes nothing when the change was not made', async () => {
		signedIn({ 'v1-i1': ['pm'] });
		await made();
		await run('change-prototype', '--project', 'demo', '--name', 'v1-i1', '--note', 'Bigger');
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1-i2')).toBe(0);
		expect(out.at(-1)).toMatch(/nothing was made or saved/);
		expect(iterations().map((i) => i.name)).toEqual(['v1-i1']);
		expect(existsSync(local('v1-i2'))).toBe(false);
	});

	it('refuses to save a name that is not the next iteration of anything', async () => {
		await made();
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1-i5')).toBe(1);
		expect(err.join('\n')).toMatch(/not the next iteration/);
	});
});

describe('build-site', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1-i1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1-i1');
		out = [];
	};

	it('builds the site from the design repository beside the product, into the app folder by default', async () => {
		await saved();
		expect(await run('build-site')).toBe(0);
		expect(readFileSync(join(prototypes, '_site', 'demo', 'v1', 'i1', 'page.html'), 'utf8')).toContain('Real component');
		expect(readFileSync(join(prototypes, '_site', 'index.html'), 'utf8')).toContain('Demo');
		expect(out.join('\n')).toMatch(/Built 1 page in 1 project[\s\S]*Comment counts are left out/);
	});

	it('counts each iteration\'s comments when GitHub can be asked, and builds from the design repository itself too', async () => {
		await saved();
		github = {
			api: async (path: string) => (/\/issues\?/.test(path) ? [{ number: 1, body: 'branch: `prototype/demo/v1-i1`', comments: 2 }] : []),
		};
		const site = join(home, 'elsewhere-site');
		expect(await main(['build-site', '--out', site], deps(design))).toBe(0);
		expect(readFileSync(join(site, 'demo', 'index.html'), 'utf8')).toContain('2 comments');
	});
});

describe('publish', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1-i1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1-i1');
		out = [];
	};
	it('has no public-test option any more: a page says who can open it, and nothing else is asked', async () => {
		await saved();
		expect(await main(['publish', '--project', 'demo', '--name', 'v1-i1', '--public-test', 'yes'], deps(design))).toBe(2);
		expect(err.join('\n')).toMatch(/Unknown option '--public-test'/);
		expect(await main(['build-site', '--out', join(home, 's'), '--gate'], deps(design))).toBe(2);
	});

	it('publishes only a page that has been saved', async () => {
		expect(await main(['publish', '--project', 'demo', '--name', 'v1-i1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/no saved page[\s\S]*save-prototype/);
	});

	it('needs GitHub to be asked, and says how', async () => {
		await saved();
		expect(await main(['publish', '--project', 'demo', '--name', 'v1-i1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/gh auth login/);
	});
});

describe('publish opens the page the first time', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1-i1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1-i1');
		out = [];
		// GitHub: a bare repository to push to, and an API whose site deploys at once.
		const remote = join(home, 'remote.git');
		g(home, 'init', '-q', '--bare', remote);
		g(design, 'add', '-A');
		g(design, 'commit', '-q', '-m', 'Saved');
		const branch = g(design, 'symbolic-ref', '--short', 'HEAD').trim();
		g(design, 'remote', 'add', 'origin', remote);
		g(design, 'push', '-q', '-u', 'origin', branch);
		return branch;
	};
	/** A GitHub whose site is deployed at once, and either already has the page or does not. */
	const site = (branch: string, onSite: boolean) => {
		let dispatched = false;
		return {
			api: async (path: string) => {
				if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) return { private: true, default_branch: branch };
				if (path.endsWith('/pages')) return { html_url: 'https://acme.github.io/design/', public: false };
				if (path.endsWith('/dispatches')) return void (dispatched = true);
				if (path.includes('/actions/workflows/')) return { workflow_runs: dispatched ? [{ id: 2, status: 'completed', conclusion: 'success', html_url: 'run/2' }] : [] };
				if (path.includes('/deployments?')) return [{ id: 6, sha: 'd'.repeat(40) }];
				if (path.includes('/deployments/6/statuses')) return [{ state: 'success' }];
				if (path.includes('/commits?')) return onSite ? [{ sha: 'c'.repeat(40) }] : [];
				throw new Error(`not faked: ${path}`);
			},
		};
	};
	const publishWith = (branch: string, onSite: boolean, more: string[] = []) => {
		const opened: string[] = [];
		const quick = { ...deps(design), github: site(branch, onSite), sleep: async () => undefined, fetchAnonymously: async () => ({ status: 404 }), open: (u: string) => void opened.push(u) };
		return main(['publish', '--project', 'demo', '--name', 'v1-i1', ...more], quick).then((code) => ({ code, opened }));
	};

	it('opens the link it printed the first time the page goes up, and only that', async () => {
		const branch = await saved();
		const { code, opened } = await publishWith(branch, false);
		expect(code).toBe(0);
		expect(opened).toEqual(['https://acme.github.io/design/demo/v1/i1/']);
		expect(out.at(-1)).toBe(opened[0]);
	});

	it('does not open it for a change to a page that is already on the site', async () => {
		const branch = await saved();
		expect((await publishWith(branch, true)).opened).toEqual([]);
	});

	it('does not open it when told not to', async () => {
		const branch = await saved();
		expect((await publishWith(branch, false, ['--no-open'])).opened).toEqual([]);
	});

	it('does not open anything when the deploy fails', async () => {
		const branch = await saved();
		const opened: string[] = [];
		const failing = { api: async (path: string) => (path.endsWith('/dispatches') ? Promise.reject(Object.assign(new Error('Not Found'), { status: 404 })) : site(branch, false).api(path)) };
		const code = await main(['publish', '--project', 'demo', '--name', 'v1-i1'], { ...deps(design), github: failing, sleep: async () => undefined, open: (u: string) => void opened.push(u) });
		expect(code).toBe(1);
		expect(opened).toEqual([]);
	});
});

describe('unpublish', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1-i1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1-i1');
		out = [];
	};

	it('refuses a name that is not one, before any path is made of it', async () => {
		expect(await main(['unpublish', '--project', '../x', '--name', 'v1-i1'], deps(design))).toBe(1);
		expect(await main(['unpublish', '--project', 'demo', '--name', '../../x'], deps(design))).toBe(1);
	});

	it('takes off only a page that is saved, and needs GitHub to be asked', async () => {
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1-i1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/no saved page[\s\S]*not on the site/);
		await saved();
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1-i1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/gh auth login/);
		expect(existsSync(join(design, 'projects', 'demo', 'prototypes', 'v1-i1.html'))).toBe(true);
	});

	it('removes the page and source, here and in the design repository, pushes, and keeps the record', async () => {
		await saved();
		// GitHub: a bare repository to push to, and an API whose site deploys at once.
		const remote = join(home, 'remote.git');
		g(home, 'init', '-q', '--bare', remote);
		g(design, 'add', '-A');
		g(design, 'commit', '-q', '-m', 'Saved');
		const branch = g(design, 'symbolic-ref', '--short', 'HEAD').trim();
		g(design, 'remote', 'add', 'origin', remote);
		g(design, 'push', '-q', '-u', 'origin', branch);
		let dispatched = false;
		github = {
			api: async (path: string) => {
				if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) return { private: true, default_branch: branch };
				if (path.endsWith('/pages')) return { html_url: 'https://acme.github.io/design/', public: false };
				if (path.endsWith('/dispatches')) return void (dispatched = true);
				if (path.includes('/runs')) return { workflow_runs: dispatched ? [{ id: 2, status: 'completed', conclusion: 'success', html_url: 'run/2' }] : [] };
				throw new Error(`not faked: ${path}`);
			},
		};
		const quick = { ...deps(design), sleep: async () => undefined, fetchAnonymously: async () => ({ status: 404 }) };
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1-i1'], quick)).toBe(0);
		for (const f of ['v1-i1.html', 'v1-i1.tsx']) {
			expect(existsSync(join(design, 'projects', 'demo', 'prototypes', f))).toBe(false);
			expect(existsSync(join(prototypes, 'demo', f))).toBe(false);
		}
		expect(iterations().map((i) => i.name)).toEqual(['v1-i1']);
		expect(g(remote, 'ls-tree', '-r', '--name-only', branch)).not.toContain('v1-i1.html');
		expect(out.join('\n')).toContain('https://acme.github.io/design/demo/v1/i1/');
	});
});

describe('the command', () => {
	it('is started by its own skill, never by the build skill every prototype task carries', () => {
		const skills = join(__dirname, '..', '..', 'skills');
		// The build skill is in the task of every agent the app starts too, which must never start another prototype.
		expect(readFileSync(join(skills, 'build-prototype.md'), 'utf8')).not.toMatch(/new-prototype|flkd\.mjs/);
		// The starting skill names the launcher as it sits beside a product repository.
		expect(readFileSync(join(skills, 'start-prototype.md'), 'utf8')).toContain('node ../flock-designer/workspace/bin/flkd.mjs new-prototype');
		expect(existsSync(join(__dirname, '..', 'bin', 'flkd.mjs'))).toBe(true);
	});

	it('refuses what it does not know, and says how it is used', async () => {
		expect(await run('make-it')).toBe(2);
		expect(await run('new-prototype', '--project', 'demo', '--colour', 'blue')).toBe(2);
		expect(err.join('\n')).toMatch(/Usage/);
	});

	it('runs outside a product repository only when told which one', async () => {
		const elsewhere = mkdtempSync(join(tmpdir(), 'fdw-cli-elsewhere-'));
		try {
			const argv = ['new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list'];
			expect(await main(argv, deps(elsewhere))).toBe(1);
			expect(err.join('\n')).toMatch(/not inside a product repository/);
			expect(await main([...argv, '--product', product], deps(elsewhere))).toBe(0);
			expect(iterations().map((i) => i.name)).toEqual(['v1-i1']);
		} finally {
			rmSync(elsewhere, { recursive: true, force: true });
		}
	});

	it('is built from the app source and run by its launcher, and what it prints is what the agent runs', () => {
		// A home of its own, so the app's prototype folder it finds is this test's, never this machine's.
		const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), APPDATA: join(home, 'AppData') };
		const sh = (command: string) => spawnSync('/bin/sh', ['-c', command], { cwd: product, env, encoding: 'utf8' });
		const launcher = join(__dirname, '..', 'bin', 'flkd.mjs');

		const usage = spawnSync(process.execPath, [launcher], { cwd: product, env, encoding: 'utf8' });
		expect(usage.status).toBe(2);
		expect(usage.stderr).toMatch(/Usage:[\s\S]*new-prototype[\s\S]*save-prototype/);

		const made = spawnSync(process.execPath, [launcher, 'new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list'], { cwd: product, env, encoding: 'utf8' });
		expect(made.stderr).toBe('');
		expect(made.status).toBe(0);
		const source = /Write `([^`]+)`/.exec(made.stdout)?.[1] as string;
		const build = /Check it builds.*with exactly: `([^`]+)`/.exec(made.stdout)?.[1] as string;
		const save = /Save it, with exactly: `([^`]+)`/.exec(made.stdout)?.[1] as string;
		expect(source.startsWith(home)).toBe(true);

		writeFileSync(source, "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		expect(sh(build).status).toBe(0);
		const saved = sh(save);
		expect(saved.status).toBe(0);
		expect(readFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1-i1.html'), 'utf8')).toContain('Real component');
	});
});
