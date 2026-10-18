import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { type AddressInfo, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../src/cli/dsnr';
import { findChrome } from '../src/main/services/chromeHeadless';
import { g, installDesignSystem, makeProduct, addStandards } from './fixtures';
import type { GitHubApi } from '../src/host/github';

import { type Answer, fakeGitHub, refusal } from './fakes/github';
import { DESIGN_REPO } from '../src/shared/config';

/**
 * `dsnr`, the command an agent runs from Claude Code in VS Code to make a prototype with no app running. Against a
 * temporary product checkout and design repository side by side, and the real bundler, as on a designer's machine.
 */

let home: string;
let product: string;
let design: string;
let prototypes: string;
let out: string[];
let err: string[];
let github: GitHubApi | null;
/** The design repository's address in GitHub's API, as the command names it. */
const REPO = `/repos/${DESIGN_REPO.owner}/${DESIGN_REPO.repo}`;

const esbuild = createRequire(__filename).resolve('esbuild');
const deps = (cwd: string) => ({
	cwd,
	out: (t: string) => out.push(t),
	err: (t: string) => err.push(t),
	prototypesRoot: prototypes,
	esbuild,
	self: ['dsnr'],
	github,
});
const run = (...argv: string[]) => main(argv, deps(product));
const recorded = () => JSON.parse(readFileSync(join(design, 'projects', 'demo', 'work.json'), 'utf8')) as { name: string }[];

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
	addStandards(design);
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

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
		expect(readFileSync(join(design, 'projects', 'demo', 'brief.md'), 'utf8')).toBe('# Demo\n\nA list of cameras\n');

		const task = out.join('\n');
		expect(task).toContain('# Build a prototype');
		expect(task).toContain(`Write \`${join(prototypes, 'demo', 'v1.tsx')}\``);
		expect(task).toContain(join(prototypes, 'build-prototype.mjs'));
		expect(task).toContain('A list of cameras');
		expect(task).toContain(`dsnr save-prototype --project demo --name v1 --product ${product}`);
		// It finishes by publishing, and with the link the command printed, or why there is none.
		expect(task).toContain('dsnr publish --project demo --name v1');
		expect(task).toMatch(/Never give a link the command did not print/);
	});

	it('carries Flock’s voice and tone in the task when the design repository has it written, and nothing when it has none (T9)', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		expect(out.join('\n')).not.toContain('## Voice and tone');
		mkdirSync(join(dirname(product), 'x', '.dsnr'), { recursive: true });
		writeFileSync(join(dirname(product), 'x', '.dsnr', 'voice-and-tone.md'), '# Voice and tone\n\n## Voice\n\nCalm and exact.\n');
		out = [];
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea')).toBe(0);
		const task = out.join('\n');
		expect(task).toContain('## Voice and tone');
		expect(task).toContain('### Voice\n\nCalm and exact.');
		expect(task.indexOf('## Voice and tone')).toBeLessThan(task.indexOf('## What the person asked for'));
	});

	it('makes the next version for a project that has one, keeping its brief', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		const brief = readFileSync(join(design, 'projects', 'demo', 'brief.md'), 'utf8');
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea: a map')).toBe(0);
		expect(recorded().map((i) => i.name)).toEqual(['v1', 'v2']);
		expect(readFileSync(join(design, 'projects', 'demo', 'brief.md'), 'utf8')).toBe(brief);
	});

	it('records the product it was made on as its repository, whatever the clone is called', async () => {
		// No remote: the folder's name is all there is, and no product is claimed.
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		expect((recorded()[0] as { basedOn?: { product?: string } }).basedOn?.product).toBeUndefined();
		// Its remote says which repository it is, so one clone or another, named anything, is the same product.
		g(product, 'remote', 'add', 'origin', 'git@github.com:flocksafety/flock-coke.git');
		expect(await run('new-prototype', '--project', 'demo', '--note', 'Another idea')).toBe(0);
		const other = join(home, 'coke');
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
		g(product, 'branch', 'noah/baseline');
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list', '--from', 'noah/baseline')).toBe(0);
		expect(recorded()[0]).toMatchObject({ basedOn: { branch: 'noah/baseline' } });
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
		writeFileSync(
			join(prototypes, 'demo', 'v1.tsx'),
			"/* A page made of the real thing. */\nimport { Hello } from 'x';\nexport default () => <Hello />;\n",
		);

		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		const saved = join(design, 'projects', 'demo', 'prototypes');
		expect(readFileSync(join(saved, 'v1.tsx'), 'utf8')).toContain("from 'x'");
		expect(readFileSync(join(saved, 'v1.html'), 'utf8')).toContain('Real component');
		expect(out.at(-1)).toMatch(/It is in DSNR/);
	});

	it('says what the build said when the source does not compile, and saves nothing', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1.tsx'), "import { Nope } from 'not-installed';\nexport default () => <Nope />;\n");
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(1);
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
	/** GitHub as its API answers: who the person is, and each version's review thread with its commenters. */
	const signedIn = (threads: Record<string, string[]>) => {
		const names = Object.keys(threads);
		github = fakeGitHub({
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
		out = [];
	};

	it('changes the version in place when only its maker has commented', async () => {
		signedIn({ v1: ['test-person'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Make the title bigger')).toBe(0);
		expect(out.join('\n')).toMatch(/The change is made in v1: change it/);
		expect(out.join('\n')).toContain('dsnr save-prototype --project demo --name v1 --product');
		writeFileSync(local('v1'), page('bigger'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
	});

	it('changes it in place when others have commented too, and has the person told', async () => {
		signedIn({ v1: ['test-person', 'pm'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Make the title bigger')).toBe(0);
		expect(out.join('\n')).toContain(
			'1 comment from others is on v1. The change is made in it, in place, so their pins may land on the wrong element',
		);
		// What they said is read first, from a file, and the person is told how much there is.
		const said = /2 open comments on v1, in (\S+?): read them first/.exec(out.join('\n'));
		expect(said).not.toBeNull();
		expect(readFileSync(said?.[1] as string, 'utf8')).toContain('feedback');
		expect(out.join('\n')).toContain('dsnr save-prototype --project demo --name v1 --product');
		writeFileSync(local('v1'), page('bigger'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
		expect(readFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8')).toContain('bigger');
	});

	it('makes a new version from it only when asked, recorded only when saved, with what it started from', async () => {
		// Others have commented: the new version is what was asked for, and nothing is said of their pins.
		signedIn({ v1: ['test-person', 'pm'] });
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Try it as cards', '--new-version')).toBe(0);
		expect(out.join('\n')).toMatch(/A new version was asked for: the change is made in v2, a new version from v1/);
		expect(out.join('\n')).not.toContain('from others');
		expect(out.join('\n')).toContain(`Write \`${local('v2')}\``);
		expect(out.join('\n')).toContain('dsnr publish --project demo --name v2');
		// The command it is given says which version the new one was started from, so saving it records that.
		expect(out.join('\n')).toContain('dsnr save-prototype --project demo --name v2 --from-version v1');
		expect(readFileSync(local('v2'), 'utf8')).toBe(page('first'));
		expect(recorded().map((i) => i.name)).toEqual(['v1']);

		writeFileSync(local('v2'), page('cards'));
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2', '--from-version', 'v1')).toBe(0);
		expect(recorded()).toMatchObject([{ name: 'v1' }, { name: 'v2', from: 'v1', contributors: [{ name: 'Test Person', login: 'test-person' }] }]);
		expect(readFileSync(join(design, 'projects', 'demo', 'prototypes', 'v2.html'), 'utf8')).toContain('cards');
		expect(readFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8')).toContain('first');
	});

	it('when the comments cannot be read, says so, and still changes it in place', async () => {
		await made();
		expect(await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Bigger')).toBe(0);
		expect(out.join('\n')).toMatch(
			/Who has commented on v1 could not be read\. The change is made in it, in place\.[\s\S]*gh, is missing or not signed in/,
		);
		expect(out.join('\n')).toContain('dsnr save-prototype --project demo --name v1 --product');
	});

	it('makes nothing when a new version was asked for and nothing was changed', async () => {
		signedIn({ v1: ['pm'] });
		await made();
		await run('change-prototype', '--project', 'demo', '--name', 'v1', '--note', 'Bigger', '--new-version');
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2', '--from-version', 'v1')).toBe(0);
		expect(out.at(-1)).toMatch(/nothing was made or saved/);
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
		expect(existsSync(local('v2'))).toBe(false);
	});

	it('refuses to save a name that is not the next version, or a new version that does not say what it was started from', async () => {
		await made();
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v4')).toBe(1);
		expect(err.join('\n')).toMatch(/not the next version/);
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2')).toBe(1);
		expect(err.join('\n')).toMatch(/v2 is a new version: say which it was started from, with --from-version/);
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v2', '--from-version', 'v9')).toBe(1);
		expect(err.join('\n')).toMatch(/demo has no v9 for v2 to have been started from/);
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
		writeFileSync(join(prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		out = [];
	};

	it('builds the site from the design repository beside the product, into the app folder by default', async () => {
		await saved();
		expect(await run('build-site')).toBe(0);
		expect(readFileSync(join(prototypes, '_site', 'demo', 'v1', 'page.html'), 'utf8')).toContain('Real component');
		expect(readFileSync(join(prototypes, '_site', 'index.html'), 'utf8')).toContain('Demo');
		expect(out.join('\n')).toMatch(/Built 1 page in 1 project[\s\S]*Comment counts are left out/);
	});

	it("counts each version's comments when GitHub can be asked, and builds from the design repository itself too", async () => {
		await saved();
		github = fakeGitHub({ [`${REPO}/issues?*`]: [{ number: 1, body: 'branch: `prototype/demo/v1`', comments: 2 }], '*': [] }).github;
		const site = join(home, 'elsewhere-site');
		expect(await main(['build-site', '--out', site], deps(design))).toBe(0);
		expect(readFileSync(join(site, 'demo', 'index.html'), 'utf8')).toContain('2 comments');
	});
});

describe('publish', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		out = [];
	};
	it('has no public-test option any more: a page says who can open it, and nothing else is asked', async () => {
		await saved();
		expect(await main(['publish', '--project', 'demo', '--name', 'v1', '--public-test', 'yes'], deps(design))).toBe(2);
		expect(err.join('\n')).toMatch(/Unknown option '--public-test'/);
		expect(await main(['build-site', '--out', join(home, 's'), '--gate'], deps(design))).toBe(2);
	});

	it('publishes only a page that has been saved', async () => {
		expect(await main(['publish', '--project', 'demo', '--name', 'v1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/no saved page[\s\S]*save-prototype/);
	});

	it('needs GitHub to be asked, and says how', async () => {
		await saved();
		expect(await main(['publish', '--project', 'demo', '--name', 'v1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/gh auth login/);
	});
});

describe('publish opens the page the first time', () => {
	const saved = async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
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
			...deps(design),
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
		const failing = site(branch, false, {
			[`POST ${REPO}/actions/workflows/*`]: () => {
				throw refusal(404);
			},
		});
		const code = await main(['publish', '--project', 'demo', '--name', 'v1'], {
			...deps(design),
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
		writeFileSync(join(prototypes, 'demo', 'v1.tsx'), "import { Hello } from 'x';\nexport default () => <Hello />;\n");
		await run('save-prototype', '--project', 'demo', '--name', 'v1');
		out = [];
	};

	it('refuses a name that is not one, before any path is made of it', async () => {
		expect(await main(['unpublish', '--project', '../x', '--name', 'v1'], deps(design))).toBe(1);
		expect(await main(['unpublish', '--project', 'demo', '--name', '../../x'], deps(design))).toBe(1);
	});

	it('takes off only a page that is saved, and needs GitHub to be asked', async () => {
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/no saved page[\s\S]*not on the site/);
		await saved();
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1'], deps(design))).toBe(1);
		expect(err.join('\n')).toMatch(/gh auth login/);
		expect(existsSync(join(design, 'projects', 'demo', 'prototypes', 'v1.html'))).toBe(true);
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
		github = fakeGitHub({
			[REPO]: { private: true, default_branch: branch },
			[`${REPO}/pages`]: { html_url: 'https://acme.github.io/design/', public: false },
			[`POST ${REPO}/actions/workflows/*`]: () => void (dispatched = true),
			[`${REPO}/actions/workflows/*`]: () => ({
				workflow_runs: dispatched ? [{ id: 2, status: 'completed', conclusion: 'success', html_url: 'run/2' }] : [],
			}),
		}).github;
		const quick = { ...deps(design), sleep: async () => undefined, fetchAnonymously: async () => ({ status: 404 }) };
		expect(await main(['unpublish', '--project', 'demo', '--name', 'v1'], quick)).toBe(0);
		for (const f of ['v1.html', 'v1.tsx']) {
			expect(existsSync(join(design, 'projects', 'demo', 'prototypes', f))).toBe(false);
			expect(existsSync(join(prototypes, 'demo', f))).toBe(false);
		}
		expect(recorded().map((i) => i.name)).toEqual(['v1']);
		expect(g(remote, 'ls-tree', '-r', '--name-only', branch)).not.toContain('v1.html');
		expect(out.join('\n')).toContain('https://acme.github.io/design/demo/v1/');
	});
});

describe('the command', () => {
	it('is started by its own skill, never by the build skill every prototype task carries', () => {
		const skills = join(__dirname, '..', '..', 'skills');
		// The build skill is in the task of every agent the app starts too, which must never start another prototype.
		expect(readFileSync(join(skills, 'build-prototype.md'), 'utf8')).not.toMatch(/new-prototype|dsnr\.mjs/);
		// The starting skill names the launcher as it sits beside a product repository.
		expect(readFileSync(join(skills, 'start-prototype.md'), 'utf8')).toContain('node ../flock-designer/workspace/bin/dsnr.mjs new-prototype');
		expect(existsSync(join(__dirname, '..', 'bin', 'dsnr.mjs'))).toBe(true);
	});

	it('refuses what it does not know, and says how it is used', async () => {
		expect(await run('make-it')).toBe(2);
		expect(await run('new-prototype', '--project', 'demo', '--color', 'blue')).toBe(2);
		expect(err.join('\n')).toMatch(/Usage/);
	});

	it('runs outside a product repository only when told which one', async () => {
		const elsewhere = mkdtempSync(join(tmpdir(), 'fdw-cli-elsewhere-'));
		try {
			const argv = ['new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list'];
			expect(await main(argv, deps(elsewhere))).toBe(1);
			expect(err.join('\n')).toMatch(/not inside a product repository/);
			expect(await main([...argv, '--product', product], deps(elsewhere))).toBe(0);
			expect(recorded().map((i) => i.name)).toEqual(['v1']);
		} finally {
			rmSync(elsewhere, { recursive: true, force: true });
		}
	});

	it('is built from the app source and run by its launcher, and what it prints is what the agent runs', () => {
		// A home of its own, so the app's prototype folder it finds is this test's, never this machine's.
		const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), APPDATA: join(home, 'AppData') };
		const sh = (command: string) => spawnSync('/bin/sh', ['-c', command], { cwd: product, env, encoding: 'utf8' });
		const launcher = join(__dirname, '..', 'bin', 'dsnr.mjs');

		const usage = spawnSync(process.execPath, [launcher], { cwd: product, env, encoding: 'utf8' });
		expect(usage.status).toBe(2);
		expect(usage.stderr).toMatch(/Usage:[\s\S]*new-prototype[\s\S]*save-prototype/);

		const made = spawnSync(process.execPath, [launcher, 'new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list'], {
			cwd: product,
			env,
			encoding: 'utf8',
		});
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
		expect(readFileSync(join(design, 'projects', 'demo', 'prototypes', 'v1.html'), 'utf8')).toContain('Real component');
	});
});

/**
 * `dsnr accessibility` (A2 of the accessibility plan): the one harness, in a real browser, on a product that is not Coke
 * and names nothing DSNR knows, a plain page with a known fault served by its own design-mode command, and on a
 * prototype's page. It needs the browser on this machine, as the app does.
 */
describe.skipIf(findChrome() === null)('accessibility', () => {
	/** A port nothing answers on now, for the plain product to serve on. */
	const freePort = () =>
		new Promise<number>((resolve) => {
			const s = createServer().listen(0, () => {
				const { port } = s.address() as AddressInfo;
				s.close(() => resolve(port));
			});
		});
	const PAGE = (title: string, body: string) =>
		`<!doctype html><html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;

	it('measures a plain product’s own app as its files say: started, each page it names, what did not open said, and stopped after', async () => {
		const shop = join(home, 'plain-shop');
		const port = await freePort();
		mkdirSync(shop);
		makeProduct(shop, [{ id: 'design-mode', label: 'Design mode', argv: ['node', 'serve.cjs', String(port)], servesPreviewOn: port }]);
		// A plain server and plain pages: one with an image with no text and faint text, one that throws, one that never answers.
		writeFileSync(
			join(shop, 'serve.cjs'),
			`require('node:http').createServer((req, res) => {
				if (req.url === '/gone') return req.socket.destroy();
				res.setHeader('content-type', 'text/html');
				if (req.url === '/broken') return res.end(${JSON.stringify(PAGE('Broken', '<script>throw new Error("the page broke")</script>'))});
				res.end(req.url.startsWith('/devices')
					? ${JSON.stringify(PAGE('Devices', '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><p style="color:#c8c8c8;background:#fff">Faint text</p>'))}
					: ${JSON.stringify(PAGE('Home', '<p>Welcome</p>'))});
			}).listen(Number(process.argv[2]));`,
		);
		writeFileSync(
			join(shop, '.dsnr', 'manifest.md'),
			[
				'# Plain Shop',
				'',
				'## Accessibility conformance target',
				'',
				'| | |',
				'|---|---|',
				'| **Target** | WCAG 2.1 Level AA |',
				'',
				'## Pages to check for accessibility',
				'',
				'| Page | Address |',
				'|---|---|',
				'| Home | `/` |',
				'| Devices | `/devices?tab=list` |',
				'| Broken | `/broken` |',
				'| Gone | `/gone` |',
				'',
				'## Assistive technology to test with',
				'',
				'- VoiceOver with Safari, on macOS',
			].join('\n'),
		);
		mkdirSync(join(design, 'projects', 'shop'), { recursive: true });
		writeFileSync(join(design, 'projects', 'shop', 'work.json'), '[]\n');

		expect(await main(['accessibility', '--project', 'shop'], deps(shop))).toBe(0);
		const said = out.join('\n');
		expect(said).toMatch(/^Measured Test Product's app in design mode: (?:No issues found|\d+ issues? to fix)\./);
		expect(said).toContain('axe-core 4.14.0 checked this against WCAG 2.1 Level AA, in Home, Devices.');
		expect(said).toMatch(/- \*\*image-alt\*\* \(WCAG 1\.1\.1\)[^\n]*1 element, in Devices\.\n {2}- `img` \(in Devices\): /);
		expect(said).toMatch(/- \*\*color-contrast\*\* \(WCAG 1\.4\.3\)[^\n]*in Devices/);
		expect(said).toContain('Broken (/broken) did not open, so it was not measured: the page broke');
		expect(said).toContain('Gone (/gone) did not open, so it was not measured: the page did not load in time.');
		// Said as it went, so a long run is never silent.
		expect(err.join('\n')).toMatch(/Starting Test Product's app \(node serve\.cjs \d+\)[\s\S]*Checking Home \(\/\)[\s\S]*Checking Gone \(\/gone\)/);

		const kept = JSON.parse(readFileSync(join(design, 'projects', 'shop', 'accessibility', 'app.json'), 'utf8')) as {
			pages: { name: string }[];
			notOpened: { name: string }[];
			result: { ran: { states: string[]; target: string }; violations: { rule: string }[] };
		};
		expect(kept.pages.map((p) => p.name)).toEqual(['Home', 'Devices', 'Broken', 'Gone']);
		expect(kept.notOpened.map((p) => p.name)).toEqual(['Broken', 'Gone']);
		expect(kept.result.ran.states).toEqual(['Home', 'Devices']);
		expect(kept.result.violations.map((v) => v.rule)).toEqual(expect.arrayContaining(['image-alt', 'color-contrast']));
		// Each page that opened, probed at full depth, its evidence in a folder of its own; the source not read, and why.
		expect(said).toMatch(/Probed at full depth \(30 of the 30 cells\), in Home \(\d+\.\d s\), Devices \(\d+\.\d s\)\./);
		expect(said).toMatch(
			/Not run:\n- \*\*key-shortcuts\*\* \(WCAG 2\.1\.4 Character Key Shortcuts\): this checkout's remote names no default branch/,
		);
		const evidence = join(design, 'projects', 'shop', 'accessibility', 'app');
		for (const file of ['home/tree.json', 'home/tab.json', 'devices/reflow-320.jpg', 'devices/cells.json', 'source.json'])
			expect(existsSync(join(evidence, file)), file).toBe(true);
		const probe = (kept as unknown as { probe: { depth: string; views: { state: string; evidence: string }[] } }).probe;
		expect(probe.depth).toBe('full');
		expect(probe.views.map((v) => [v.state, v.evidence])).toEqual([
			['Home', 'projects/shop/accessibility/app/home'],
			['Devices', 'projects/shop/accessibility/app/devices'],
		]);
		// Stopped after: nothing answers on its port.
		await expect(fetch(`http://localhost:${port}/`)).rejects.toThrow();

		// The ledger, and review.md's section written from it; a gate's check finds nothing to refuse.
		const ledger = JSON.parse(readFileSync(join(design, 'projects', 'shop', 'accessibility', 'app.ledger.json'), 'utf8')) as {
			rows: { sc: string; status: string }[];
		};
		expect(ledger.rows.find((r) => r.sc === '1.1.1')?.status).toBe('found');
		const review = readFileSync(join(design, 'projects', 'shop', 'review.md'), 'utf8');
		expect(review).toContain("## Accessibility: Test Product's app in design mode");
		expect(review).toContain('| 5 | Accessible names | 4.1.2 Name, Role, Value:');
		expect(said).toContain('This is the first run of this measure: there is no ledger to compare with.');
		// The manual list, in the work's HANDOFF.md, for whoever tests it by hand.
		const handoff = readFileSync(join(shop, 'HANDOFF.md'), 'utf8');
		expect(handoff).toContain('## Accessibility: what is left for a person');
		expect(handoff).toMatch(
			new RegExp(`- Run \`node serve\.cjs ${port}\` in the product's checkout\. It serves http://localhost:${port}/ on its own mock data`),
		);
		expect(handoff).toContain('- The pages measured: Home (`/`), Devices (`/devices?tab=list`), Broken (`/broken`), Gone (`/gone`).');
		expect(handoff).toContain('Cover at least what the product names: VoiceOver with Safari, on macOS.');
		expect(handoff).toContain('Add each to `flock-designer/projects/shop/accessibility/returned.md`');
		out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(0);
		expect(out.join('\n')).toMatch(/every status rests on its evidence, and review\.md and HANDOFF\.md say what the ledger says/);
		// Edited by hand, and the gate refuses it.
		writeFileSync(join(shop, 'HANDOFF.md'), handoff.replace('Cover at least', 'Maybe cover'));
		out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(1);
		expect(out.join('\n')).toMatch(/HANDOFF\.md does not carry the manual list its ledger writes/);
		writeFileSync(join(shop, 'HANDOFF.md'), handoff);
		// An evidence file gone, and the gate refuses what rested on it.
		rmSync(join(evidence, 'home', 'cells.json'));
		out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(1);
		expect(out.join('\n')).toMatch(/rests on projects\/shop\/accessibility\/app\/home\/cells\.json, which is not there/);
		// Measured again: compared with the last, the record made whole, and what the agent wrote in review.md kept.
		writeFileSync(join(design, 'projects', 'shop', 'review.md'), `# Review\n\n## Product parity\n\nFine.\n\n${review}`);
		// What testers send back (A9), in the file the first run started for them: one a machine missed, one it had found.
		const returned = join(design, 'projects', 'shop', 'accessibility', 'returned.md');
		expect(readFileSync(returned, 'utf8')).toContain('| Criterion | Page or state | Steps to reproduce |');
		writeFileSync(
			returned,
			`${readFileSync(returned, 'utf8')}| 2.4.7 | Home | Tab to the first link | A visible focus ring | serious | ring.png | yes |\n| 1.1.1 | Devices | Read the picture | Its text | minor | | yes |\n`,
		);
		// And the product fixes its picture, and lints with Biome, so a guard can be proposed in its stack.
		writeFileSync(join(shop, 'serve.cjs'), readFileSync(join(shop, 'serve.cjs'), 'utf8').replace('<img src=', '<img alt=\\"Camera 4\\" src='));
		writeFileSync(join(shop, 'package.json'), JSON.stringify({ name: 'plain-shop', devDependencies: { '@biomejs/biome': '1.9.4' } }));
		out = [];
		expect(await main(['accessibility', '--project', 'shop', '--light'], deps(shop))).toBe(0);
		const second = out.join('\n');
		expect(second).toMatch(/Since the last run \(\d{4}-\d\d-\d\d\): .*criteria changed in all\./);
		expect(second).toMatch(
			/Returned by testers: 2 findings\. 1 a machine measured and missed \(escapes, the goal's count, which should be none\), 1 newly logged in \.dsnr\/knowledge\/agent-gaps\.md; 1 a machine had found too/,
		);
		const gaps = readFileSync(join(shop, '.dsnr', 'knowledge', 'agent-gaps.md'), 'utf8');
		expect(gaps).toMatch(
			/\| \*\*Accessibility: WCAG 2\.4\.7 Focus Visible, found by a tester in Home and not by DSNR\*\*[^\n]*Tab to the first link/,
		);
		expect(second).toContain(
			"- WCAG 1.1.1, image-alt: add `a11y/useAltText` (Biome (its a11y rules)) to the product's lint, so it is caught as code is written.",
		);
		expect(readFileSync(join(design, 'projects', 'shop', 'accessibility', 'guards.md'), 'utf8')).toContain('a11y/useAltText');
		// Read again, between runs: nothing logged twice.
		out = [];
		expect(await main(['read-returned', '--project', 'shop'], deps(shop))).toBe(0);
		expect(out.join('\n')).not.toMatch(/newly logged/);
		expect(readFileSync(join(shop, '.dsnr', 'knowledge', 'agent-gaps.md'), 'utf8').match(/found by a tester/g)).toHaveLength(1);
		expect(readFileSync(join(design, 'projects', 'shop', 'review.md'), 'utf8')).toContain('## Product parity\n\nFine.');
		out = [];
		expect(await main(['check-accessibility', '--project', 'shop'], deps(shop))).toBe(0);
	}, 120_000);

	it('gives the agent its build’s own check, and puts what two rounds of it left on the page’s record when it is saved (A6)', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		const task = out.join('\n');
		const checkLine = /check its accessibility with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const build = /Check it builds.*with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		expect(checkLine).toMatch(/^node .*check-prototype\.mjs .*v1\.build-check\.json$/);
		// A button drawn as an icon alone, with no name: built, then checked as the agent checks it, three times.
		writeFileSync(
			join(prototypes, 'demo', 'v1.tsx'),
			"export default () => <main><h1>Cameras</h1><button><svg width='16' height='16'><path d='M2 2h12v12H2z' /></svg></button></main>;\n",
		);
		const sh = (command: string) => spawnSync('/bin/sh', ['-c', command], { cwd: product, encoding: 'utf8' });
		expect(sh(build).status).toBe(0);
		expect(sh(checkLine).status).toBe(1);
		expect(sh(checkLine).status).toBe(1);
		const last = sh(checkLine);
		expect(last.status).toBe(0);
		expect(last.stdout).toMatch(/left after 2 rounds/);
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		const ledger = JSON.parse(readFileSync(join(design, 'projects', 'demo', 'accessibility', 'v1.ledger.json'), 'utf8')) as {
			depth: string;
			rows: { sc: string; status: string; why?: string }[];
		};
		expect(ledger.depth).toBe('light, at build');
		expect(ledger.rows.find((r) => r.sc === '4.1.2')).toMatchObject({
			status: 'found',
			why: expect.stringMatching(/sent it back 2 times, and it was still there/),
		});
		expect(readFileSync(join(design, 'projects', 'demo', 'review.md'), 'utf8')).toMatch(
			/4\.1\.2 Name, Role, Value: found \(.*\), left because the build's own check sent it back 2 times/,
		);
		out = [];
		expect(await main(['check-accessibility', '--project', 'demo', '--name', 'v1'], deps(product))).toBe(0);
	}, 300_000);

	it('keeps nothing of a check on a page changed after it, and says a page with no ledger has not been measured', async () => {
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list')).toBe(0);
		const task = out.join('\n');
		const checkLine = /check its accessibility with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const build = /Check it builds.*with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const sh = (command: string) => spawnSync('/bin/sh', ['-c', command], { cwd: product, encoding: 'utf8' });
		const source = join(prototypes, 'demo', 'v1.tsx');
		writeFileSync(
			source,
			"export default () => <main><h1>Cameras</h1><button><svg width='16' height='16'><path d='M2 2h12v12H2z' /></svg></button></main>;\n",
		);
		expect(sh(build).status).toBe(0);
		expect(sh(checkLine).status).toBe(1);
		// Changed after its check: what the check found is not of this page, so none of it is kept.
		writeFileSync(source, 'export default () => <main><h1>Cameras</h1><button>Add camera</button></main>;\n');
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		expect(existsSync(join(design, 'projects', 'demo', 'accessibility', 'v1.ledger.json'))).toBe(false);
		out = [];
		expect(await main(['check-accessibility', '--project', 'demo', '--name', 'v1'], deps(product))).toBe(1);
		expect(out.at(-1)).toMatch(
			/v1\.ledger\.json is not there, or is not a ledger this DSNR writes: run dsnr accessibility --project demo --name v1 first\./,
		);
	}, 300_000);

	it('says so, and measures nothing, for a product with no workspace file or no design-mode command', async () => {
		const bare = join(home, 'bare');
		mkdirSync(bare);
		g(bare, 'init', '-q');
		expect(await main(['accessibility', '--project', 'demo'], deps(bare))).toBe(1);
		expect(err.at(-1)).toBe(`dsnr: ${realpathSync(bare)} has no .dsnr/workspace.json, so DSNR cannot open it, and nothing was measured.`);
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		expect(await run('accessibility', '--project', 'demo')).toBe(1);
		expect(err.at(-1)).toBe(
			`dsnr: Test Product's .dsnr/workspace.json declares no "design-mode" command that serves its app on a port, so DSNR cannot open it, and nothing was measured.`,
		);
		expect(existsSync(join(design, 'projects', 'demo', 'accessibility'))).toBe(false);
	});

	it('measures a prototype’s page in a real browser, and keeps it as the app keeps its check', async () => {
		await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', 'A list');
		writeFileSync(join(prototypes, 'demo', 'v1.tsx'), "export default () => <main><h1>Cameras</h1><img src='camera.png' /></main>;\n");
		expect(await run('save-prototype', '--project', 'demo', '--name', 'v1')).toBe(0);
		out = [];
		expect(await run('accessibility', '--project', 'demo', '--name', 'v1')).toBe(0);
		const said = out.join('\n');
		expect(said).toMatch(/^Measured demo v1's page: (?:No issues found|\d+ issues? to fix)\./);
		expect(said).toMatch(/- \*\*image-alt\*\*[^\n]*\n {2}- `img`: /);
		const kept = JSON.parse(readFileSync(join(design, 'projects', 'demo', 'accessibility', 'v1.json'), 'utf8')) as { result: unknown };
		// The same result the app keeps beside the page, so the app shows what was measured here.
		expect((JSON.parse(readFileSync(join(prototypes, 'demo', 'v1.accessibility.json'), 'utf8')) as { result: unknown }).result).toEqual(kept.result);
		// Probed in its one state, its source read for what the page cannot show.
		expect(existsSync(join(design, 'projects', 'demo', 'accessibility', 'v1', 'default', 'tab.json'))).toBe(true);
		expect(JSON.parse(readFileSync(join(design, 'projects', 'demo', 'accessibility', 'v1', 'source.json'), 'utf8'))).toEqual(
			expect.arrayContaining([{ cell: 'dragging', sc: '2.5.7', status: 'none', findings: [] }]),
		);
		// The light subset, as a build runs it: the tree and the Tab walk alone, and a run leaves none of the last one's evidence.
		out = [];
		expect(await run('accessibility', '--project', 'demo', '--name', 'v1', '--light')).toBe(0);
		expect(out.join('\n')).toMatch(/Probed at light depth \(8 of the 30 cells\)/);
		expect(existsSync(join(design, 'projects', 'demo', 'accessibility', 'v1', 'default', 'reflow-320.jpg'))).toBe(false);
		// And as the agent runs it, through its launcher's bundle, which starts the browser too.
		const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), APPDATA: join(home, 'AppData') };
		const launcher = join(__dirname, '..', 'bin', 'dsnr.mjs');
		const ran = spawnSync(process.execPath, [launcher, 'accessibility', '--project', 'demo', '--name', 'v1'], {
			cwd: product,
			env,
			encoding: 'utf8',
		});
		expect(ran.stdout).toMatch(/^Measured demo v1's page: (?:No issues found|\d+ issues? to fix)\./);
		expect(ran.status).toBe(0);
	}, 120_000);
});

/**
 * The agent fixing what its build's own check found (A6), with the real agent: run only where it is asked for
 * (`DSNR_REAL_AGENT=1`), since it runs Claude Code on the person's account and costs a little. A prototype with a fault
 * planted in it is changed for something else; the agent builds, runs the check it is given, and fixes the fault in its
 * own source, so the check finds nothing at the end: fixed, not reported.
 */
describe.skipIf(process.env.DSNR_REAL_AGENT !== '1' || findChrome() === null)('the agent, with its build’s own check', () => {
	it('fixes a fault the check finds while it does what it was asked', async () => {
		const { runToEnd } = await import('../src/main/services/agent');
		const request = 'The prototype already exists. Change its heading to say "Camera list".';
		expect(await run('new-prototype', '--project', 'demo', '--title', 'Demo', '--note', request)).toBe(0);
		const task = out.join('\n');
		const checkLine = /check its accessibility with exactly: `([^`]+)`/.exec(task)?.[1] as string;
		const source = join(prototypes, 'demo', 'v1.tsx');
		// The planted fault: a button drawn as an icon alone, with no name.
		writeFileSync(
			source,
			"export default () => <main><h1>Cameras</h1><button onClick={() => undefined}><svg width='16' height='16'><path d='M2 2h12v12H2z' /></svg></button></main>;\n",
		);
		// As DSNR starts a prototype's run: in its folder, reading what its task says it may read, and nothing else.
		const { prototypeReadable } = await import('../src/main/services/prototype');
		const { prototypeWork } = await import('../src/main/services/prototypeWork');
		const { designStore } = await import('../src/main/services/designStore');
		const store = designStore({ clone: () => design, files: null, onWrite: () => undefined });
		const work = prototypeWork({
			prototypesRoot: prototypes,
			productRoot: () => product,
			store: store.records,
			readDesignFile: store.readFile,
			esbuild: () => esbuild,
		});
		const ended = await runToEnd(join(prototypes, 'demo'), task, { bare: true, readOnly: prototypeReadable(await work.sources('demo', 'v1')) });
		const fixed = readFileSync(source, 'utf8');
		console.log(`The agent's last words: ${ended.said}\nIts source:\n${fixed}`);
		expect(ended.ok, ended.said).toBe(true);
		expect(fixed).toContain('Camera list');
		// The check sent it back at least once, and finds nothing now: the agent fixed it, in its own source.
		const record = JSON.parse(readFileSync(join(prototypes, 'demo', 'v1.build-checked.json'), 'utf8')) as { rounds: number; left: boolean };
		expect(record.rounds).toBeGreaterThanOrEqual(1);
		expect(record.left).toBe(false);
		const after = spawnSync('/bin/sh', ['-c', checkLine], { cwd: product, encoding: 'utf8' });
		expect(after.status, after.stdout).toBe(0);
		expect(after.stdout).toMatch(/^Accessibility: none found of what this check measures/);
	}, 600_000);
});
