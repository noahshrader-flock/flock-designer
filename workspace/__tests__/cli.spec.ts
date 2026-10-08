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

const esbuild = createRequire(__filename).resolve('esbuild');
const deps = (cwd: string) => ({ cwd, out: (t: string) => out.push(t), err: (t: string) => err.push(t), prototypesRoot: prototypes, esbuild, self: ['flkd'] });
const run = (...argv: string[]) => main(argv, deps(product));
const iterations = () => JSON.parse(readFileSync(join(design, 'projects', 'demo', 'iterations.json'), 'utf8')) as { name: string }[];

beforeEach(() => {
	home = realpathSync(mkdtempSync(join(tmpdir(), 'fdw-cli-')));
	product = join(home, 'flock-coke');
	design = join(home, 'flock-designer');
	prototypes = join(home, 'app', 'prototypes');
	out = [];
	err = [];

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
