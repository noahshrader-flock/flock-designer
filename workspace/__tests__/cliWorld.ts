import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { main } from '../src/cli/dsnr';
import type { GitHubApi } from '../src/codeHost/github';
import { pendingOf } from '../src/core/services/prototypes/pendingPrototypes';
import { DESIGN_REPO } from '../src/shared/config';
import { addStandards, g, installDesignSystem, makeProduct } from './fixtures';

/** The CLI's tests' world, made afresh for each test: a product, a design repository and what the CLI said. */
export const world = {
	home: '',
	product: '',
	design: '',
	prototypes: '',
	out: [] as string[],
	err: [] as string[],
	github: null as GitHubApi | null,
};

export const REPO = `/repos/${DESIGN_REPO.owner}/${DESIGN_REPO.repo}`;
export const esbuild = createRequire(__filename).resolve('esbuild');

export const deps = (cwd: string) => ({
	cwd,
	out: (t: string) => world.out.push(t),
	err: (t: string) => world.err.push(t),
	prototypesRoot: world.prototypes,
	esbuild,
	self: ['dsnr'],
	github: world.github,
});
export const run = (...argv: string[]) => main(argv, deps(world.product));
export const recorded = () => JSON.parse(readFileSync(join(world.design, 'prototypes', 'demo', 'work.json'), 'utf8')) as { name: string }[];
/** As DSNR reads a project's versions: those recorded, then those started here, recorded once saved. */
export const versions = () => [
	...(existsSync(join(world.design, 'prototypes', 'demo', 'work.json')) ? recorded() : []),
	...pendingOf(world.prototypes, 'demo'),
];

/** Called once at the top of a test file. */
export const setUpCliWorld = () => {
	beforeEach(() => {
		const home = realpathSync(mkdtempSync(join(tmpdir(), 'fdw-cli-')));
		Object.assign(world, {
			home,
			product: join(home, 'flock-coke'),
			design: join(home, 'flock-designer'),
			prototypes: join(home, 'app', 'prototypes'),
			out: [],
			err: [],
			github: null,
		});
		mkdirSync(world.product);
		makeProduct(world.product);
		installDesignSystem(world.product);
		// Who is making the prototype is read from the design repository's git identity, the record being written there.
		mkdirSync(join(world.design, 'skills'), { recursive: true });
		g(world.design, 'init', '-q');
		g(world.design, 'config', 'user.name', 'Test Person');
		g(world.design, 'config', 'user.email', '123+test-person@users.noreply.github.com');
		writeFileSync(join(world.design, 'skills', 'build-prototype.md'), '# Build a prototype\n');
		addStandards(world.design);
	});
	afterEach(() => rmSync(world.home, { recursive: true, force: true }));
};
