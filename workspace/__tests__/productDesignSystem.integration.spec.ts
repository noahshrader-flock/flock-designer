import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findContext } from '../src/core/services/projects/findContext';
import {
	SourceAnswers,
	chooseDesignSystem,
	chosenDesignSystem,
	holdsItsDesignSystem,
	packageFolderNamed,
	packageRepository,
	productDesignSystem,
	usableDesignSystem,
} from '../src/core/services/projects/productDesignSystem';
import { g, makeDesignSystem, makeProductFiles } from './fixtures';

let base: string;
let coke: string;
let ui: string;
let answers: SourceAnswers;

/** The product names `designSystem` (@acme/ui), so the design system is looked for in it by that name, then beside it, as `ui`. */
const product = (designSystem: { package: string; folder?: string } = { package: '@acme/ui' }) => {
	mkdirSync(coke, { recursive: true });
	makeProductFiles(coke);
	const file = join(coke, '.dsnr', 'workspace.json');
	writeFileSync(file, JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as object), designSystem }));
};
/** A package in the product at `folder` (`''`, the product's own), with a story, so it reads as a design system. */
const packageIn = (folder: string, name: string) => makeDesignSystem(join(coke, folder), name);
const install = (pkg: Record<string, unknown>) => {
	mkdirSync(join(coke, 'node_modules', '@acme', 'ui'), { recursive: true });
	writeFileSync(join(coke, 'node_modules', '@acme', 'ui', 'package.json'), JSON.stringify({ name: '@acme/ui', version: '1.2.3', ...pkg }));
};
/** A clone of `origin`, with a release tag when given. */
const library = ({
	name = '@acme/ui',
	origin = 'git@github.com:acme/ui.git',
	tag = 'v1.2.3',
}: { name?: string; origin?: string | null; tag?: string | null } = {}) => {
	makeDesignSystem(ui, name);
	g(ui, 'init', '-q', '-b', 'main');
	g(ui, 'add', '.');
	g(ui, 'commit', '-q', '-m', 'library');
	if (origin) g(ui, 'remote', 'add', 'origin', origin);
	if (tag) g(ui, 'tag', tag);
};

beforeEach(() => {
	base = mkdtempSync(join(tmpdir(), 'fdw-source-'));
	coke = join(base, 'coke');
	ui = join(base, 'ui');
	answers = new SourceAnswers(join(base, 'answers.json'));
	product();
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('the product’s design system, proven to be its package’s source', () => {
	it('is used when its name, its origin and a release tag for the installed version all say so', async () => {
		library();
		install({ repository: { type: 'git', url: 'git+https://github.com/acme/ui.git' } });
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: ui, how: 'beside' });
		expect((await findContext({ folders: [coke], answers })).designSystem).toEqual({ root: ui, how: 'beside' });
	});

	it('is judged by the origin the clone names, not where a git insteadOf rule sends its fetches', async () => {
		library();
		g(ui, 'config', `url.${join(base, 'mirror.git')}.insteadOf`, 'git@github.com:acme/ui.git');
		install({ repository: 'github:acme/ui' });
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: ui, how: 'beside' });
	});

	it('is refused, in words, when it is another package, and nothing beside the product is shown in its place', async () => {
		library({ name: '@other/ui' });
		install({ repository: 'github:acme/ui' });
		expect(await productDesignSystem(coke, answers)).toEqual({
			state: 'refused',
			root: ui,
			why: "../ui is not @acme/ui's source: its package is @other/ui.",
		});
		const found = await findContext({ folders: [coke], answers });
		expect(found.designSystem).toBeNull();
		expect(found.missing[0]).toBe("../ui is not @acme/ui's source: its package is @other/ui.");
		expect(await usableDesignSystem(coke, answers)).toBeNull();
	});

	it('is refused when it is a fork: the same name, another repository', async () => {
		library({ origin: 'git@github.com:someone/ui.git' });
		install({ repository: 'github:acme/ui' });
		expect(await productDesignSystem(coke, answers)).toEqual({
			state: 'refused',
			root: ui,
			why: "../ui is not @acme/ui's source: it is a clone of someone/ui, and the installed @acme/ui comes from acme/ui.",
		});
	});

	it('asks when it cannot be confirmed, keeps the answer either way, and asks again once the installed version changes', async () => {
		library({ tag: null });
		install({ repository: 'acme/ui' });
		const asked = await productDesignSystem(coke, answers);
		expect(asked).toMatchObject({ state: 'ask', root: ui, name: '@acme/ui', why: '../ui has no release tag for 1.2.3, the version installed' });
		const key = asked.state === 'ask' ? asked.key : '';
		answers.set(key, 'use');
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: ui, how: 'beside' });
		answers.set(key, 'refuse');
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'refused', root: ui, why: "You chose not to use ../ui as @acme/ui's source." });
		install({ repository: 'acme/ui', version: '1.3.0' });
		expect(await productDesignSystem(coke, answers)).toMatchObject({
			state: 'ask',
			why: '../ui has no release tag for 1.3.0, the version installed',
		});
	});

	it('asks, saying why, when the installed package names no repository or the clone has no origin', async () => {
		library();
		install({});
		expect(await productDesignSystem(coke, answers)).toMatchObject({ state: 'ask', why: 'the installed @acme/ui names no repository' });
	});

	it('is used as named when nothing is installed: there is nothing yet to be the source of', async () => {
		library({ tag: null, origin: null });
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: ui, how: 'beside' });
	});

	it('is none when nothing is beside the product', async () => {
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'none' });
	});

	it('reads a package’s repository in each form npm takes, and no other host', () => {
		for (const field of [
			'acme/ui',
			'github:acme/ui',
			'git+https://github.com/acme/ui.git',
			'git+ssh://git@github.com/acme/ui.git',
			'https://github.com/acme/ui',
			{ url: 'git@github.com:acme/ui.git' },
		])
			expect(packageRepository(field), JSON.stringify(field)).toBe('acme/ui');
		for (const field of ['gitlab:acme/ui', 'https://gitlab.com/acme/ui.git', 42, null, {}])
			expect(packageRepository(field), JSON.stringify(field)).toBeNull();
	});
});

describe('a design system in the product’s own repository, found by the package it names', () => {
	it('is the monorepo’s package of that name, over a clone beside it, and asks nothing', async () => {
		packageIn('packages/charts', '@acme/charts');
		packageIn('packages/ui', '@acme/ui');
		// What would be asked of a clone beside it (no release tag) is not asked: the product's own code is its source.
		library({ tag: null });
		install({ repository: 'github:acme/ui' });
		const named = join(coke, 'packages', 'ui');
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: named, how: 'repository' });
		expect((await findContext({ folders: [coke], answers })).designSystem).toEqual({ root: named, how: 'repository' });
		expect(await holdsItsDesignSystem(coke)).toBe(true);
	});

	it('is the product itself when its own package has the name, as a product that is its own design system', async () => {
		packageIn('', '@acme/ui');
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: coke, how: 'repository' });
		expect(await holdsItsDesignSystem(coke)).toBe(true);
	});

	it('is not a package of another name, stories of the product’s own or the installed copy: the clone beside it stays', async () => {
		packageIn('', 'coke');
		packageIn('packages/charts', '@acme/charts');
		library();
		install({ repository: 'github:acme/ui' });
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: ui, how: 'beside' });
		expect(await holdsItsDesignSystem(coke)).toBe(false);
	});

	it('is the package found, never another inside it: a product named as its design system with none of its own is none', async () => {
		writeFileSync(join(coke, 'package.json'), JSON.stringify({ name: '@acme/ui' }));
		packageIn('packages/charts', '@acme/charts');
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'none' });
	});

	it('is where the workspace file’s folder says, over a package found by the name', async () => {
		product({ package: '@acme/ui', folder: 'libs/ui' });
		packageIn('packages/ui', '@acme/ui');
		packageIn('libs/ui', '@acme/ui');
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: join(coke, 'libs', 'ui'), how: 'repository' });
	});

	it('is looked for by name alone, the shallowest first, four folders down at most, never in hidden or generated folders', () => {
		packageIn('a/b/c/d/ui', '@acme/ui');
		packageIn('.cache/ui', '@acme/ui');
		packageIn('dist/ui', '@acme/ui');
		expect(packageFolderNamed(coke, '@acme/ui')).toBeNull();
		packageIn('a/b/c/ui', '@acme/ui');
		expect(packageFolderNamed(coke, '@acme/ui')).toBe('a/b/c/ui');
		packageIn('z/ui', '@acme/ui');
		expect(packageFolderNamed(coke, '@acme/ui')).toBe('z/ui');
	});
});

describe('a design system the person chose for the product', () => {
	/** Choices are kept in the product clone's own git config, so the product is a clone here. */
	beforeEach(() => g(coke, 'init', '-q'));
	/** A design system in a folder of its own. */
	const elsewhere = (name: string) => makeDesignSystem(join(base, name), '@acme/ui');

	it('outranks the one the product names, is read as a design system and nothing more, and is undone back to it', async () => {
		library();
		install({ repository: 'github:acme/ui' });
		// A fork: refused beside the product, used when chosen, as the person said which.
		const fork = elsewhere('fork');
		g(fork, 'init', '-q');
		g(fork, 'remote', 'add', 'origin', 'git@github.com:someone/ui.git');
		await chooseDesignSystem(coke, fork);
		expect(await chosenDesignSystem(coke)).toBe(fork);
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: fork, how: 'chosen' });
		expect(await usableDesignSystem(coke, answers)).toBe(fork);
		await chooseDesignSystem(coke, null);
		expect(await productDesignSystem(coke, answers)).toEqual({ state: 'usable', root: ui, how: 'beside' });
		// Undoing what was never chosen is no failure.
		await chooseDesignSystem(coke, null);
	});

	it('refuses a folder that holds none, keeping what was chosen before', async () => {
		const first = elsewhere('first');
		await chooseDesignSystem(coke, first);
		mkdirSync(join(base, 'empty'));
		await expect(chooseDesignSystem(coke, join(base, 'empty'))).rejects.toThrow(`${join(base, 'empty')} holds no design system`);
		expect(await chosenDesignSystem(coke)).toBe(first);
	});

	it('says so when it is gone or holds none any more, and is never replaced by the product’s in silence', async () => {
		library();
		const chosen = elsewhere('chosen');
		await chooseDesignSystem(coke, chosen);
		rmSync(join(chosen, 'src'), { recursive: true });
		expect(await productDesignSystem(coke, answers)).toEqual({
			state: 'refused',
			root: chosen,
			why: `${chosen}, the design system chosen for coke, holds no design system any more. Choose another, or use the product's.`,
		});
		rmSync(chosen, { recursive: true });
		expect(await productDesignSystem(coke, answers)).toMatchObject({
			state: 'refused',
			why: expect.stringMatching(/is not on this computer any more/),
		});
	});

	it('is kept for each product on its own', async () => {
		const other = join(base, 'other');
		mkdirSync(other);
		makeProductFiles(other);
		g(other, 'init', '-q');
		await chooseDesignSystem(coke, elsewhere('for-coke'));
		expect(await chosenDesignSystem(other)).toBeNull();
	});

	it('is in the product’s repository, sharing its checkout, only when the folder chosen is in it', async () => {
		packageIn('packages/ui', '@acme/ui');
		expect(await holdsItsDesignSystem(coke)).toBe(true);
		await chooseDesignSystem(coke, elsewhere('outside'));
		expect(await holdsItsDesignSystem(coke)).toBe(false);
		await chooseDesignSystem(coke, join(coke, 'packages', 'ui'));
		expect(await holdsItsDesignSystem(coke)).toBe(true);
	});
});
