import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli/dsnr';
import { REPO, deps, recorded, run, setUpCliWorld, versions, world } from './cliWorld';
import { type Answer, fakeGitHub, refusal } from './fakes/github';
import { g, installDesignSystem, makeProduct, designSystemBeside, writeFiles } from './fixtures';

setUpCliWorld();

describe('new-prototype', () => {
	it('starts v1 for a new project, with its brief, recorded only once it is saved, and prints the task', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list of cameras')).toBe(0);

		expect(existsSync(join(world.design, 'projects', 'demo', 'work.json'))).toBe(false);
		expect(world.out.join('\n')).toContain('Started demo v1: it is recorded when it is saved.');
		expect(versions()).toMatchObject([
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
		designSystemBeside(world.product, { '.dsnr/voice-and-tone.md': '# Voice and tone\n\n## Voice\n\nCalm and exact.\n' });
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
		expect(versions().map((i) => i.name)).toEqual(['v1', 'v2']);
		expect(readFileSync(join(world.design, 'projects', 'demo', 'brief.md'), 'utf8')).toBe(brief);
	});

	it('keeps the product it was made on as its repository, whatever the clone is called', async () => {
		// No remote: the folder's name is all there is, and no product is claimed.
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		expect((versions()[0] as { basedOn?: { product?: string } }).basedOn?.product).toBeUndefined();
		// Its remote says which repository it is, so one clone or another, named anything, is the same product.
		g(world.product, 'remote', 'add', 'origin', 'git@github.com:flocksafety/flock-coke.git');
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea')).toBe(0);
		const other = join(world.home, 'coke');
		mkdirSync(other);
		makeProduct(other);
		installDesignSystem(other);
		g(other, 'remote', 'add', 'origin', 'https://github.com/flocksafety/flock-coke.git');
		expect(await main(['new-prototype', '--project', 'demo', '--note', 'A third'], deps(other))).toBe(0);
		expect(versions().map((i) => (i as { basedOn?: unknown }).basedOn)).toMatchObject([
			{ repository: 'flock-coke' },
			{ repository: 'flock-coke', product: 'flocksafety/flock-coke' },
			{ repository: 'coke', product: 'flocksafety/flock-coke' },
		]);
	});

	it('is modeled on the branch named, when there is one', async () => {
		g(world.product, 'branch', 'noah/baseline');
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list', '--from', 'noah/baseline')).toBe(0);
		expect(versions()[0]).toMatchObject({ basedOn: { branch: 'noah/baseline' } });
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

	it('records a version started here as it was started, once it is saved, and clears its start', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		const started = versions();
		writeFileSync(local('v1'), page('first'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(recorded()).toEqual(started);
		expect(versions()).toEqual(started);
		expect(existsSync(join(world.prototypes, 'demo', 'v1.pending.json'))).toBe(false);
	});

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
		// Another idea is started as v2 first, in another run, so the change cannot take its name.
		await run('new-prototype', '--project', 'demo', '--note', 'Another idea');
		expect(versions().map((i) => i.name)).toEqual(['v1', 'v2']);
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
		expect(versions().map((i) => i.name)).toEqual(['v1', 'v2', 'v3']);
	});
});

describe('check-setup', () => {
	it('says what to fix, and fails, then what the product does not have and what it lets DSNR run once there is nothing to fix', async () => {
		expect(await run('check-setup')).toBe(1);
		const said = world.out.join('\n');
		expect(said).toMatch(/^To fix in .*flock-coke:\n {2}There is no \.dsnr\/README\.md, which every agent reads before building\./);
		expect(said).toContain('The commands it lets DSNR run:');
		for (const file of ['README.md', 'manifest.md', 'standards/non-negotiables.md']) writeFiles(join(world.product, '.dsnr'), { [file]: '# Here\n' });
		expect(await run('agent-files')).toBe(0);
		world.out = [];
		expect(await run('check-setup')).toBe(0);
		expect(world.out.join('\n')).toMatch(/is set up as DSNR reads it\.\n\nWhat it does not have, which DSNR would use:\n {2}No install command/);
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

	it('points the viewer at the design repository the product names, and at its own origin when built from it', async () => {
		await saved();
		const viewer = join(world.home, 'viewer');
		mkdirSync(viewer);
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		const file = join(world.product, '.dsnr', 'workspace.json');
		writeFileSync(file, JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as object), designRepository: 'acme/flock-designer' }));
		const repoIn = (cwd: string, out: string) =>
			main(['build-site', '--out', out], { ...deps(cwd), buildViewer: async () => viewer }).then(() =>
				/"owner":"(\w+)","repo":"([\w-]+)"/
					.exec(readFileSync(join(out, 'demo', 'v1', 'index.html'), 'utf8'))
					?.slice(1)
					.join('/'),
			);
		expect(await repoIn(world.product, join(world.home, 'from-product'))).toBe('acme/flock-designer');
		g(world.design, 'remote', 'add', 'origin', 'git@github.com:cheq/cheq-designer.git');
		expect(await repoIn(world.design, join(world.home, 'from-design'))).toBe('cheq/cheq-designer');
	});

	it('says the edition of WCAG to the design repository the product names, and to none when it cannot tell which', async () => {
		const file = join(world.product, '.dsnr', 'workspace.json');
		writeFileSync(file, JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as object), designRepository: 'acme/flock-designer' }));
		world.github = fakeGitHub({
			'GET /repos/acme/flock-designer/issues?*': [],
			'POST /repos/acme/flock-designer/issues': { html_url: 'https://github.com/acme/flock-designer/issues/1' },
		}).github;
		const wcag = (cwd: string) => main(['wcag-edition'], { ...deps(cwd), fetchText: async () => '' });
		expect(await wcag(world.product)).toBe(0);
		expect(world.out.at(-1)).toBe('Opened https://github.com/acme/flock-designer/issues/1');
		// A repository with no workspace file is no design repository's product: its own origin is never taken for one.
		g(world.product, 'init', '-q');
		g(world.product, 'remote', 'add', 'origin', 'git@github.com:flock-safety/flock-coke.git');
		rmSync(file);
		expect(await wcag(world.product)).toBe(1);
		expect(world.err.at(-1)).toMatch(/has no \.dsnr\/workspace\.json/);
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
			expect(versions().map((i) => i.name)).toEqual(['v1']);
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

describe('agent-files', () => {
	it('writes what every agent needs into the product, commits nothing, and says what it wrote and what it left', async () => {
		writeFileSync(join(world.product, 'CLAUDE.md'), '# Our own rules\n');
		const head = g(world.product, 'rev-parse', 'HEAD').trim();
		expect(await run('agent-files')).toBe(0);
		const said = world.out.join('\n');
		expect(said).toContain('Written in');
		expect(said).toContain('.agents/skills/dsnr/SKILL.md');
		expect(said).toMatch(/Left as it is: CLAUDE\.md, since it has instructions of its own/);
		expect(said).toContain('Nothing was committed.');
		expect(g(world.product, 'rev-parse', 'HEAD').trim()).toBe(head);
		expect(readFileSync(join(world.product, '.claude/agents/dsnr.md'), 'utf8')).toContain('../flock-designer/agents/dsnr.md');
		world.out.length = 0;
		expect(await run('agent-files')).toBe(0);
		expect(world.out.join('\n')).toMatch(/^Nothing to write in .*: every agent file is as DSNR writes it\./);
	});

	it('with --check, writes nothing, says what has drifted from what DSNR writes, and fails until it is written', async () => {
		expect(await run('agent-files', '--check')).toBe(1);
		expect(world.out.join('\n')).toMatch(/^Not as DSNR writes them in [\s\S]*AGENTS\.md[\s\S]*Run dsnr agent-files in it to write them\.$/);
		expect(existsSync(join(world.product, '.agents'))).toBe(false);
		await run('agent-files');
		world.out.length = 0;
		expect(await run('agent-files', '--check')).toBe(0);
		writeFileSync(join(world.product, '.claude/agents/dsnr.md'), 'Read ../flock-designer/agents/dsnr.md, by hand.\n');
		expect(await run('agent-files', '--check')).toBe(1);
	});
});

describe('a saved source changed since this machine saved it', () => {
	const local = (name: string) => join(world.prototypes, 'demo', `${name}.tsx`);
	const saved = () => join(world.design, 'projects', 'demo', 'prototypes', 'v1.tsx');
	const page = (text: string) => `import { Hello } from 'x';\nexport default () => <><Hello /><p>${text}</p></>;\n`;
	const made = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(local('v1'), page('first'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		world.out = [];
		world.err = [];
	};

	it('is refused, not replaced: nothing is saved, and the message says what happened and how to go on', async () => {
		await made();
		const savedPage = readFileSync(join(world.design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8');
		const builtPage = readFileSync(join(world.prototypes, 'demo', 'v1.html'), 'utf8');
		// What an agent that found the saved copy first does, or a collaborator whose save came in with a pull.
		writeFileSync(saved(), page('theirs'));
		writeFileSync(local('v1'), page('mine'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(1);
		const said = world.err.join('\n');
		expect(said).toContain('projects/demo/prototypes/v1.tsx');
		expect(said).toContain('has been changed since this machine saved it');
		expect(said).toContain(local('v1'));
		expect(said).toContain('--replace');
		expect(readFileSync(saved(), 'utf8')).toBe(page('theirs'));
		expect(readFileSync(join(world.design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8')).toBe(savedPage);
		// Refused before it was built: nothing is spent on a page that is not to be saved.
		expect(readFileSync(join(world.prototypes, 'demo', 'v1.html'), 'utf8')).toBe(builtPage);
	});

	it('is replaced when that is said to be meant, and saved again without it after', async () => {
		await made();
		writeFileSync(saved(), page('theirs'));
		writeFileSync(local('v1'), page('mine'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1', '--replace')).toBe(0);
		expect(readFileSync(saved(), 'utf8')).toBe(page('mine'));
		writeFileSync(local('v1'), page('mine, again'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(readFileSync(saved(), 'utf8')).toBe(page('mine, again'));
	});

	it('is no obstacle to saving what is changed here, again and again', async () => {
		await made();
		for (const text of ['second', 'third']) {
			writeFileSync(local('v1'), page(text));
			expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		}
		expect(readFileSync(saved(), 'utf8')).toBe(page('third'));
	});

	it('is no conflict when the saved copy was changed to what the working copy now is', async () => {
		await made();
		writeFileSync(saved(), page('both'));
		writeFileSync(local('v1'), page('both'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
	});

	it('is not guarded for a version saved before this was kept, which nothing can say the saved copy should be', async () => {
		await made();
		rmSync(join(world.prototypes, 'demo', 'v1.saved'));
		writeFileSync(saved(), page('theirs'));
		writeFileSync(local('v1'), page('mine'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		// And kept from this save on.
		writeFileSync(saved(), page('theirs again'));
		writeFileSync(local('v1'), page('mine again'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(1);
	});

	it('is measured against the saved copy a working copy was made from, when it is made here from another machine’s', async () => {
		await made();
		rmSync(local('v1'));
		rmSync(join(world.prototypes, 'demo', 'v1.saved'));
		// A change in place starts from the saved source, writing it here when this machine has none.
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Bigger');
		expect(readFileSync(local('v1'), 'utf8')).toBe(page('first'));
		writeFileSync(saved(), page('theirs'));
		writeFileSync(local('v1'), page('mine'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(1);
	});
});

describe('processing the comments on a prototype, as its entry skill says', () => {
	const local = (name: string) => join(world.prototypes, 'demo', `${name}.tsx`);
	const skill = readFileSync(join(__dirname, '../../skills/start-prototype.md'), 'utf8');

	it('is a command the skill gives that runs, and prints the task with the source, the build and the save', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(local('v1'), `import { Hello } from 'x';\nexport default () => <Hello />;\n`);
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		world.out = [];

		// The command as the skill writes it, with its placeholders filled in: what it says is what runs.
		const line = skill.split('\n').find((l) => l.includes('change-prototype') && l.includes('Address the open comments'));
		expect(line).toBeDefined();
		const args = [
			...(line as string)
				.replace('<id>', 'demo')
				.replace('<v1>', 'v1')
				.matchAll(/"([^"]*)"|(\S+)/g),
		].map((m) => m[1] ?? (m[2] as string));
		expect(args.slice(0, 2)).toEqual(['node', '../flock-designer/workspace/bin/dsnr.mjs']);
		expect(await run(...args.slice(2))).toBe(0);

		const task = world.out.join('\n');
		expect(task).toContain(`Write \`${local('v1')}\``);
		expect(task).toContain('dsnr save-prototype --project demo --name v1 --product');
		expect(task).toContain('Address the open comments');
	});

	it('says to edit the working copy only, and that the product’s own scripts are not for a prototype', () => {
		expect(skill).toMatch(/Edit only the file the task names/);
		expect(skill).toContain('scripts/smoke-prototype.mjs');
	});
});

describe('what was asked, kept with the version it was asked for', () => {
	const asked = (name: string) => join(world.design, 'projects', 'demo', `requests-${name}.md`);
	const local = (name: string) => join(world.prototypes, 'demo', `${name}.tsx`);
	const page = (text: string) => `import { Hello } from 'x';\nexport default () => <><Hello /><p>${text}</p></>;\n`;

	it('keeps each request in its version’s file, in order, whole and as it was said, with who asked', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list of cameras\n\n- with a filter');
		writeFileSync(local('v1'), page('first'));
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Make the title bigger');
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Make it blue', '--new-version');

		const v1 = readFileSync(asked('v1'), 'utf8');
		expect(v1).toMatch(/^# Requests: demo v1\n/);
		expect(v1).toMatch(/> A list of cameras\n>\n> - with a filter\n\n## .* · Test Person\n\n> Make the title bigger\n$/);
		expect(readFileSync(asked('v2'), 'utf8')).toContain('> Make it blue\n');
		expect(readFileSync(asked('v2'), 'utf8')).not.toContain('Make the title bigger');
	});

	it('keeps a request run again once', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(local('v1'), page('first'));
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Bigger');
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Bigger');
		expect(readFileSync(asked('v1'), 'utf8').match(/> Bigger/g)).toHaveLength(1);
	});

	it('takes secrets, emails and phone numbers out of everything it saves: the request, the brief and the version’s note', async () => {
		const said = 'A page for jo@flocksafety.com, call 404-555-0123. Use ghp_abcdefghijklmnopqrstuvwxyz0123456789 to read it.';
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', said);
		writeFileSync(local('v1'), page('first'));
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		const kept = [asked('v1'), join(world.design, 'projects', 'demo', 'brief.md'), join(world.design, 'projects', 'demo', 'work.json')].map((f) =>
			readFileSync(f, 'utf8'),
		);
		for (const text of kept) expect(text).not.toMatch(/jo@flocksafety|404-555-0123|ghp_/);
		expect(kept[0]).toContain('[removed: an email address]');
		expect(kept[0]).toContain('Taken out: a GitHub token, an email address, a phone number.');
		// The agent is still given what was asked, whole: it cannot build from a request with holes in it.
		expect(world.out.join('\n')).toContain('jo@flocksafety.com');
	});
});
