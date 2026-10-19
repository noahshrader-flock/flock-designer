import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli/dsnr';
import { REPO, deps, recorded, run, setUpCliWorld, world } from './cliWorld';
import { type Answer, fakeGitHub, refusal } from './fakes/github';
import { g, installDesignSystem, makeProduct } from './fixtures';

setUpCliWorld();

describe('new-prototype', () => {
	it('records v1 for a new project, with its brief, and prints the task', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list of cameras')).toBe(0);

		expect(recorded()).toMatchObject([
			{
				name: 'v1',
				branch: 'prototype/demo/v1',
				basedOn: { repository: 'flock-coke', branch: 'develop' },
				contributors: [{ name: 'Test Person', login: 'test-person' }],
			},
		]);
		expect(readFileSync(join(world.design, 'projects', 'demo', 'brief.md'), 'utf8')).toBe('# Demo\n\nA list of cameras\n');

		const task = world.out.join('\n');
		expect(task).toContain('# Build a prototype');
		expect(task).toContain(`Write \`${join(world.prototypes, 'demo', 'v1.tsx')}\``);
		expect(task).toContain(join(world.prototypes, 'build-prototype.mjs'));
		expect(task).toContain('A list of cameras');
		expect(task).toContain(`dsnr save-prototype --project demo --name v1 --product ${world.product}`);
		expect(task).toContain('dsnr publish --project demo --name v1');
		expect(task).toMatch(/Never give a link the command did not print/);
	});

	it('carries the design system’s voice and tone in the task when the design repository has it written, and nothing when it has none (T9)', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		expect(world.out.join('\n')).not.toContain('## Voice and tone');
		mkdirSync(join(dirname(world.product), 'x', '.dsnr'), { recursive: true });
		writeFileSync(join(dirname(world.product), 'x', '.dsnr', 'voice-and-tone.md'), '# Voice and tone\n\n## Voice\n\nCalm and exact.\n');
		world.out = [];
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea')).toBe(0);
		const task = world.out.join('\n');
		expect(task).toContain('## Voice and tone');
		expect(task).toContain('### Voice\n\nCalm and exact.');
		expect(task.indexOf('## Voice and tone')).toBeLessThan(task.indexOf('## What the person asked for'));
	});

	it('makes the next version for a project that has one, keeping its brief', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		const brief = readFileSync(join(world.design, 'projects', 'demo', 'brief.md'), 'utf8');
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea: a map')).toBe(0);
		expect(recorded().map((i) => i.name)).toEqual(['v1', 'v2']);
		expect(readFileSync(join(world.design, 'projects', 'demo', 'brief.md'), 'utf8')).toBe(brief);
	});

	it('records the product it was made on as its repository, whatever the clone is called', async () => {
		// No remote: the folder's name is all there is, and no product is claimed.
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		expect((recorded()[0] as { basedOn?: { product?: string } }).basedOn?.product).toBeUndefined();
		// Its remote says which repository it is, so one clone or another, named anything, is the same product.
		g(world.product, 'remote', 'add', 'origin', 'git@github.com:flocksafety/flock-coke.git');
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea')).toBe(0);
		const other = join(world.home, 'coke');
		mkdirSync(other);
		makeProduct(other);
		installDesignSystem(other);
		g(other, 'remote', 'add', 'origin', 'https://github.com/flocksafety/flock-coke.git');
		expect(await main(['new-prototype', '--project', 'demo', '--note', 'A third'], deps(other))).toBe(0);
		expect(recorded().map((i) => (i as { basedOn?: unknown }).basedOn)).toMatchObject([
			{ repository: 'flock-coke' },
			{ repository: 'flock-coke', product: 'flocksafety/flock-coke' },
			{ repository: 'coke', product: 'flocksafety/flock-coke' },
		]);
	});

	it('is modeled on the branch named, when there is one', async () => {
		g(world.product, 'branch', 'noah/baseline');
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list', '--from', 'noah/baseline')).toBe(0);
		expect(recorded()[0]).toMatchObject({ basedOn: { branch: 'noah/baseline' } });
		expect(await run('new-prototype', '--project', 'demo', '--note', 'A list', '--from', 'nope')).toBe(1);
		expect(world.err.join('\n')).toMatch(/no branch called nope/);
	});

	it('records nothing when it cannot be built here, and says what to install', async () => {
		rmSync(join(world.product, 'node_modules'), { recursive: true, force: true });
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(1);
		expect(world.err.join('\n')).toMatch(/npm ci/);
		expect(existsSync(join(world.design, 'projects', 'demo'))).toBe(false);
	});

	it('asks for a title for a new project, and for what to make', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--note', 'A list')).toBe(2);
		expect(world.err.join('\n')).toMatch(/--title/);
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo')).toBe(2);
		expect(existsSync(join(world.design, 'projects', 'demo'))).toBe(false);
	});
});

describe('save-prototype', () => {
	it('builds the page from its source and saves both to the design repository', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(
			join(world.prototypes, 'demo', 'v1.tsx'),
			"/* A page made of the real thing. */\nimport { Hello } from 'x';\nexport default () => <Hello />;\n",
		);

		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		const saved = join(world.design, 'projects', 'demo', 'prototypes');
		expect(readFileSync(join(saved, 'v1.tsx'), 'utf8')).toContain("from 'x'");
		expect(readFileSync(join(saved, 'v1.html'), 'utf8')).toContain('Real component');
		expect(world.out.at(-1)).toMatch(/It is in DSNR/);
	});

	it('says what the build said when the source does not compile, and saves nothing', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(world.prototypes, 'demo', 'v1.tsx'), "import { Nope } from 'not-installed';\nexport default () => <Nope />;\n");
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(1);
		expect(world.err.join('\n')).toMatch(/did not build[\s\S]*not-installed/);
		expect(existsSync(join(world.design, 'projects', 'demo', 'prototypes'))).toBe(false);
	});

	it('refuses a name that is not a prototype', async () => {
		expect(await run('save-prototype', '--project', 'demo', '--name', '../../etc')).toBe(1);
	});
});

describe('change-prototype', () => {
	const local = (name: string) => join(world.prototypes, 'demo', `${name}.tsx`);
	const page = (text: string) => `import { Hello } from 'x';\nexport default () => <><Hello /><p>${text}</p></>;\n`;
	const signedIn = (threads: Record<string, string[]>) => {
		const names = Object.keys(threads);
		world.github = fakeGitHub({
			'/user': { login: 'test-person' },
			[`${REPO}/issues?*`]: names.map((name, i) => ({ number: i + 1, body: `branch: \`prototype/demo/${name}\``, comments: 1 })),
			[`${REPO}/issues/*`]: ({ path }) =>
				(threads[names[Number(/\/issues\/(\d+)\/comments/.exec(path)?.[1]) - 1] as string] ?? []).map((login, i) => ({
					id: i + 1,
					body: 'x',
					user: { login },
					created_at: '2026-10-08T00:00:00Z',
				})),
		}).github;
	};
	const made = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(local('v1'), page('first'));
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		world.out = [];
	};

	it('changes the version in place when only its maker has commented', async () => {
		signedIn({ v1: ['test-person'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Make the title bigger')).toBe(0);
		expect(world.out.join('\n')).toMatch(/The change is made in v1: change it/);
		expect(world.out.join('\n')).toContain('dsnr save-prototype --project demo --name v1 --product');
		writeFileSync(local('v1'), page('bigger'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
	});

	it('changes it in place when others have commented too, and has the person told', async () => {
		signedIn({ v1: ['test-person', 'pm'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Make the title bigger')).toBe(0);
		expect(world.out.join('\n')).toContain(
			'1 comment from others is on v1. The change is made in it, in place, so their pins may land on the wrong element',
		);
		const said = /2 open comments on v1, in (\S+?): read them first/.exec(world.out.join('\n'));
		expect(said).not.toBeNull();
		expect(readFileSync(said?.[1] as string, 'utf8')).toContain('feedback');
		expect(world.out.join('\n')).toContain('dsnr save-prototype --project demo --name v1 --product');
		writeFileSync(local('v1'), page('bigger'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
		expect(readFileSync(join(world.design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8')).toContain('bigger');
	});

	it('makes a new version from it only when asked, recorded only when saved, with what it started from', async () => {
		// Others have commented: the new version is what was asked for, and nothing is said of their pins.
		signedIn({ v1: ['test-person', 'pm'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Try it as cards', '--new-version')).toBe(0);
		expect(world.out.join('\n')).toMatch(/A new version was asked for: the change is made in v2, a new version from v1/);
		expect(world.out.join('\n')).not.toContain('from others');
		expect(world.out.join('\n')).toContain(`Write \`${local('v2')}\``);
		expect(world.out.join('\n')).toContain('dsnr publish --project demo --name v2');
		expect(world.out.join('\n')).toContain('dsnr save-prototype --project demo --name v2 --from-version v1');
		expect(readFileSync(local('v2'), 'utf8')).toBe(page('first'));
		expect(recorded().map((i) => i.name)).toEqual(['v1']);

		writeFileSync(local('v2'), page('cards'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2', '--from-version', 'v1')).toBe(0);
		expect(recorded()).toMatchObject([{ name: 'v1' }, { name: 'v2', from: 'v1', contributors: [{ name: 'Test Person', login: 'test-person' }] }]);
		expect(readFileSync(join(world.design, 'projects', 'demo', 'prototypes', 'v2.html'), 'utf8')).toContain('cards');
		expect(readFileSync(join(world.design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8')).toContain('first');
	});

	it('when the comments cannot be read, says so, and still changes it in place', async () => {
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Bigger')).toBe(0);
		expect(world.out.join('\n')).toMatch(
			/Who has commented on v1 could not be read\. The change is made in it, in place\.[\s\S]*gh, is missing or not signed in/,
		);
		expect(world.out.join('\n')).toContain('dsnr save-prototype --project demo --name v1 --product');
	});

	it('never saves a new version over one made meanwhile under the same name', async () => {
		signedIn({ v1: ['test-person'] });
		await made();
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Try cards', '--new-version');
		writeFileSync(local('v2'), page('cards'));
		// Someone else's new idea is recorded as v2 first, on another machine or in another run.
		await run('new-prototype', '--project', 'demo', '--note', 'Another idea');
		expect(recorded().map((i) => i.name)).toEqual(['v1', 'v2']);
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2', '--from-version', 'v1')).toBe(1);
		expect(world.err.join('\n')).toMatch(/demo v2 was made meanwhile, so this new version is not saved over it/);
		expect(existsSync(join(world.design, 'projects', 'demo', 'prototypes', 'v2.html'))).toBe(false);
	});

	it('makes nothing when a new version was asked for and nothing was changed', async () => {
		signedIn({ v1: ['pm'] });
		await made();
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Bigger', '--new-version');
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2', '--from-version', 'v1')).toBe(0);
		expect(world.out.at(-1)).toMatch(/nothing was made or saved/);
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
		expect(existsSync(local('v2'))).toBe(false);
	});

	it('refuses to save a name that is not the next version, or a new version that does not say what it was started from', async () => {
		await made();
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v4')).toBe(1);
		expect(world.err.join('\n')).toMatch(/not the next version/);
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2')).toBe(1);
		expect(world.err.join('\n')).toMatch(/v2 is a new version: say which it was started from, with --from-version/);
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2', '--from-version', 'v9')).toBe(1);
		expect(world.err.join('\n')).toMatch(/demo has no v9 for v2 to have been started from/);
	});

	it('numbers each new idea one past the highest: v1, v2, v3', async () => {
		await made();
		await run('new-prototype', '--project', 'demo', '--note', 'Another idea');
		await run('new-prototype', '--project', 'demo', '--note', 'A third');
		expect(recorded().map((i) => i.name)).toEqual(['v1', 'v2', 'v3']);
	});
});

describe('build-site', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(world.prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		world.out = [];
	};

	it('builds the site from the design repository beside the product, into the app folder by default', async () => {
		await saved();
		expect(await run('build-site')).toBe(0);
		expect(readFileSync(join(world.prototypes, '_site', 'demo', 'v1', 'page.html'), 'utf8')).toContain('Real component');
		expect(readFileSync(join(world.prototypes, '_site', 'index.html'), 'utf8')).toContain('Demo');
		expect(world.out.join('\n')).toMatch(/^Built 1 page in 1 project at /);
	});

	it('builds from the design repository itself too', async () => {
		await saved();
		const site = join(world.home, 'elsewhere-site');
		expect(await main(['build-site', '--out', site], deps(world.design))).toBe(0);
		expect(readFileSync(join(site, 'index.html'), 'utf8')).toContain('href="demo/v1/"');
	});
});

describe('publish', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(world.prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		world.out = [];
	};
	it('has no public-test option any more: a page says who can open it, and nothing else is asked', async () => {
		await saved();
		expect(await main(['publish', '--project', 'demo', '--name', 'v1', '--public-test', 'yes'], deps(world.design))).toBe(2);
		expect(world.err.join('\n')).toMatch(/Unknown option '--public-test'/);
		expect(await main(['build-site', '--out', join(world.home, 's'), '--gate'], deps(world.design))).toBe(2);
	});

	it('publishes only a page that has been saved', async () => {
		expect(await main(['publish', '--project', 'demo', '--name', 'v1'], deps(world.design))).toBe(1);
		expect(world.err.join('\n')).toMatch(/no saved page[\s\S]*save-prototype/);
	});

	it('needs GitHub to be asked, and says how', async () => {
		await saved();
		expect(await main(['publish', '--project', 'demo', '--name', 'v1'], deps(world.design))).toBe(1);
		expect(world.err.join('\n')).toMatch(/gh auth login/);
	});
});

describe('publish opens the page the first time', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(world.prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		world.out = [];
		const remote = join(world.home, 'remote.git');
		g(world.home, 'init', '-q', '--bare', remote);
		g(world.design, 'add', '-A');
		g(world.design, 'commit', '-q', '-m', 'Saved');
		const branch = g(world.design, 'symbolic-ref', '--short', 'HEAD').trim();
		g(world.design, 'remote', 'add', 'origin', remote);
		g(world.design, 'push', '-q', '-u', 'origin', branch);
		return branch;
	};
	const site = (branch: string, onSite: boolean, more: Record<string, Answer> = {}) => {
		let dispatched = false;
		return fakeGitHub({
			[REPO]: { private: true, default_branch: branch },
			[`${REPO}/pages`]: { html_url: 'https://acme.github.io/design/', public: false },
			[`POST ${REPO}/actions/workflows/*`]: () => void (dispatched = true),
			[`${REPO}/actions/workflows/*`]: () => ({
				workflow_runs: dispatched ? [{ id: 2, status: 'completed', conclusion: 'success', html_url: 'run/2' }] : [],
			}),
			[`${REPO}/deployments?*`]: [{ id: 6, sha: 'd'.repeat(40) }],
			[`${REPO}/deployments/6/statuses*`]: [{ state: 'success' }],
			[`${REPO}/commits?*`]: onSite ? [{ sha: 'c'.repeat(40) }] : [],
			...more,
		}).github;
	};
	const publishWith = (branch: string, onSite: boolean, more: string[] = []) => {
		const opened: string[] = [];
		const quick = {
			...deps(world.design),
			github: site(branch, onSite),
			sleep: async () => undefined,
			fetchAnonymously: async () => ({ status: 404 }),
			open: (u: string) => void opened.push(u),
		};
		return main(['publish', '--project', 'demo', '--name', 'v1', ...more], quick).then((code) => ({ code, opened }));
	};

	it('opens the link it printed the first time the page goes up, and only that', async () => {
		const branch = await saved();
		const { code, opened } = await publishWith(branch, false);
		expect(code).toBe(0);
		expect(opened).toEqual(['https://acme.github.io/design/demo/v1/']);
		expect(world.out.at(-1)).toBe(opened[0]);
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
		const failing = site(branch, false, {
			[`POST ${REPO}/actions/workflows/*`]: () => {
				throw refusal(404);
			},
		});
		const code = await main(['publish', '--project', 'demo', '--name', 'v1'], {
			...deps(world.design),
			github: failing,
			sleep: async () => undefined,
			open: (u: string) => void opened.push(u),
		});
		expect(code).toBe(1);
		expect(opened).toEqual([]);
	});
});

describe('unpublish', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(world.prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		world.out = [];
	};

	it('refuses a name that is not one, before any path is made of it', async () => {
		expect(await main(['unpublish', '--project', '../x', '--name', 'v1'], deps(world.design))).toBe(1);
		expect(await main(['unpublish', '--project', 'demo', '--name', '../../x'], deps(world.design))).toBe(1);
	});

	it('takes off only a page that is saved, and needs GitHub to be asked', async () => {
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1'], deps(world.design))).toBe(1);
		expect(world.err.join('\n')).toMatch(/no saved page[\s\S]*not on the site/);
		await saved();
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1'], deps(world.design))).toBe(1);
		expect(world.err.join('\n')).toMatch(/gh auth login/);
		expect(existsSync(join(world.design, 'projects', 'demo', 'prototypes', 'v1.html'))).toBe(true);
	});

	it('removes the page and source, here and in the design repository, pushes, and keeps the record', async () => {
		await saved();
		const remote = join(world.home, 'remote.git');
		g(world.home, 'init', '-q', '--bare', remote);
		g(world.design, 'add', '-A');
		g(world.design, 'commit', '-q', '-m', 'Saved');
		const branch = g(world.design, 'symbolic-ref', '--short', 'HEAD').trim();
		g(world.design, 'remote', 'add', 'origin', remote);
		g(world.design, 'push', '-q', '-u', 'origin', branch);
		let dispatched = false;
		world.github = fakeGitHub({
			[REPO]: { private: true, default_branch: branch },
			[`${REPO}/pages`]: { html_url: 'https://acme.github.io/design/', public: false },
			[`POST ${REPO}/actions/workflows/*`]: () => void (dispatched = true),
			[`${REPO}/actions/workflows/*`]: () => ({
				workflow_runs: dispatched ? [{ id: 2, status: 'completed', conclusion: 'success', html_url: 'run/2' }] : [],
			}),
		}).github;
		const quick = { ...deps(world.design), sleep: async () => undefined, fetchAnonymously: async () => ({ status: 404 }) };
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1'], quick)).toBe(0);
		for (const f of ['v1.html', 'v1.tsx']) {
			expect(existsSync(join(world.design, 'projects', 'demo', 'prototypes', f))).toBe(false);
			expect(existsSync(join(world.prototypes, 'demo', f))).toBe(false);
		}
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
		expect(g(remote, 'ls-tree', '-r', '--name-only', branch)).not.toContain('v1.html');
		expect(world.out.join('\n')).toContain('https://acme.github.io/design/demo/v1/');
	});
});

describe('the command', () => {
	it('is started by its own skill, never by the build skill every prototype task carries', () => {
		const skills = join(__dirname, '..', '..', 'skills');
		// The build skill is in the task of every agent the app starts too, which must never start another prototype.
		expect(readFileSync(join(skills, 'build-prototype.md'), 'utf8')).not.toMatch(/new-prototype|dsnr\.mjs/);
		expect(readFileSync(join(skills, 'start-prototype.md'), 'utf8')).toContain('node ../flock-designer/workspace/bin/dsnr.mjs new-prototype');
		expect(existsSync(join(__dirname, '..', 'bin', 'dsnr.mjs'))).toBe(true);
	});

	it('refuses what it does not know, and says how it is used', async () => {
		expect(await run('make-it')).toBe(2);
		expect(await run('new-prototype', '--project', 'demo', '--color', 'blue')).toBe(2);
		expect(world.err.join('\n')).toMatch(/Usage/);
	});

	it('runs outside a product repository only when told which one', async () => {
		const elsewhere = mkdtempSync(join(tmpdir(), 'fdw-cli-elsewhere-'));
		try {
			const argv = ['new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list'];
			expect(await main(argv, deps(elsewhere))).toBe(1);
			expect(world.err.join('\n')).toMatch(/not inside a product repository/);
			expect(await main([...argv, '--product', world.product], deps(elsewhere))).toBe(0);
			expect(recorded().map((i) => i.name)).toEqual(['v1']);
		} finally {
			rmSync(elsewhere, { recursive: true, force: true });
		}
	});

	it('is built from the app source and run by its launcher, and what it prints is what the agent runs', () => {
		// A home of its own, so the app's prototype folder it finds is this test's, never this machine's.
		const env = { ...process.env, HOME: world.home, XDG_CONFIG_HOME: join(world.home, '.config'), APPDATA: join(world.home, 'AppData') };
		const sh = (command: string) => spawnSync('/bin/sh', ['-c', command], { cwd: world.product, env, encoding: 'utf8' });
		const launcher = join(__dirname, '..', 'bin', 'dsnr.mjs');

		const usage = spawnSync(process.execPath, [launcher], { cwd: world.product, env, encoding: 'utf8' });
		expect(usage.status).toBe(2);
		expect(usage.stderr).toMatch(/Usage:[\s\S]*new-prototype[\s\S]*save-prototype/);

		const made = spawnSync(process.execPath, [launcher, 'new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list'], {
			cwd: world.product,
			env,
			encoding: 'utf8',
		});
		expect(made.stderr).toBe('');
		expect(made.status).toBe(0);
		const source = /Write `([^`]+)`/.exec(made.stdout)?.[1] as string;
		const build = /Check it builds.*with exactly: `([^`]+)`/.exec(made.stdout)?.[1] as string;
		const save = /Save it, with exactly: `([^`]+)`/.exec(made.stdout)?.[1] as string;
		expect(source.startsWith(world.home)).toBe(true);

		writeFileSync(source, "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		expect(sh(build).status).toBe(0);
		const saved = sh(save);
		expect(saved.status).toBe(0);
		expect(readFileSync(join(world.design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8')).toContain('Real component');
	});
});
