import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branchesWithFile, ensureLocalBranch } from '../src/core/services/platform/git';
import { g, makeProduct } from './fixtures';

/**
 * What work starts from, in a fresh clone: most of its branches are only on GitHub, and only
 * some carry the DSNR setup.
 */

let root: string;
let clone: string;
const commit = (dir: string, file: string, message: string) => {
	writeFileSync(join(dir, file), message);
	g(dir, 'add', '.');
	g(dir, 'commit', '-q', '-m', message);
};

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-branches-'));
	const source = join(root, 'source');
	// develop has the setup here; a branch without it is made from before it.
	makeProduct(source);
	g(source, 'checkout', '-q', '--orphan', 'plain');
	g(source, 'rm', '-rq', '--cached', '.');
	rmSync(join(source, '.dsnr'), { recursive: true });
	commit(source, 'README.md', 'plain');
	g(source, 'checkout', '-q', 'develop');
	g(source, 'checkout', '-q', '-b', 'noah/work');
	commit(source, 'work.txt', 'work');
	g(source, 'checkout', '-q', 'develop');
	clone = join(root, 'clone');
	g(root, 'clone', '-q', source, clone);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the branches work can start from', () => {
	it('are told apart by whether they carry the setup file, asked of git once', async () => {
		expect((await branchesWithFile(clone, '.dsnr/workspace.json')).sort()).toEqual(['develop', 'noah/work']);
	});
});

describe('starting from a branch only on GitHub', () => {
	it('makes it local, tracking GitHub’s, and leaves the checked-out branch where it was', async () => {
		await ensureLocalBranch(clone, 'noah/work');
		expect(g(clone, 'branch', '--show-current').trim()).toBe('develop');
		expect(g(clone, 'rev-parse', '--abbrev-ref', 'noah/work@{u}').trim()).toBe('origin/noah/work');
		// Already local: nothing more.
		await ensureLocalBranch(clone, 'noah/work');
	});

	it('refuses a branch that is on neither, and anything that could be read as an option', async () => {
		await expect(ensureLocalBranch(clone, 'nowhere')).rejects.toThrow(/no branch called nowhere/);
		await expect(ensureLocalBranch(clone, '--orphan')).rejects.toThrow(/no branch called --orphan/);
	});
});
