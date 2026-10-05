import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	GitProblem,
	branchAuthors,
	branchExists,
	checkoutBranch,
	createBranch,
	isRepository,
	listBranches,
	readCheckout,
} from '../src/main/services/git';

let root: string;
const g = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-git-'));
	g('init', '-q', '-b', 'develop');
	g('config', 'user.email', 'test@example.test');
	g('config', 'user.name', 'Test');
	writeFileSync(join(root, 'README.md'), '# repo\n');
	g('add', '.');
	g('commit', '-q', '-m', 'first');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('readCheckout', () => {
	it('reports the branch and a clean tree', async () => {
		const c = await readCheckout(root);
		expect(c.branch).toBe('develop');
		expect(c.clean).toBe(true);
	});

	it('reports a dirty tree', async () => {
		writeFileSync(join(root, 'README.md'), 'changed\n');
		expect((await readCheckout(root)).clean).toBe(false);
	});

	it('refuses a directory that is not a repository', async () => {
		const plain = mkdtempSync(join(tmpdir(), 'fdw-plain-'));
		await expect(readCheckout(plain)).rejects.toThrow(GitProblem);
		expect(isRepository(plain)).toBe(false);
		rmSync(plain, { recursive: true, force: true });
	});
});

describe('createBranch', () => {
	it('creates and switches to the branch', async () => {
		await createBranch(root, 'fd/demo/i1', 'develop');
		expect((await readCheckout(root)).branch).toBe('fd/demo/i1');
	});

	it('refuses while the tree is dirty, rather than carrying the edits over', async () => {
		writeFileSync(join(root, 'README.md'), 'work in progress\n');
		await expect(createBranch(root, 'fd/demo/i1', 'develop')).rejects.toThrow(/uncommitted changes/);
		// and the edit is still there, on the branch it was made on
		expect((await readCheckout(root)).branch).toBe('develop');
	});

	it('refuses to reuse an existing branch name', async () => {
		await createBranch(root, 'fd/demo/i1', 'develop');
		g('checkout', '-q', 'develop');
		await expect(createBranch(root, 'fd/demo/i1', 'develop')).rejects.toThrow(/already exists/);
	});

	it('treats a branch name with shell metacharacters as a name, not a command', async () => {
		// If anything here reached a shell, this would run `touch`. argv means it cannot.
		const nasty = 'fd/demo/i1; touch pwned';
		await expect(createBranch(root, nasty, 'develop')).rejects.toThrow(GitProblem);
		expect(isRepository(join(root, 'pwned'))).toBe(false);
	});
});

describe('checkoutBranch', () => {
	it('switches to an existing branch', async () => {
		await createBranch(root, 'fd/demo/i1', 'develop');
		await checkoutBranch(root, 'develop');
		expect((await readCheckout(root)).branch).toBe('develop');
	});

	it('refuses a branch that does not exist', async () => {
		await expect(checkoutBranch(root, 'fd/nope/i9')).rejects.toThrow(/does not exist/);
	});

	it('refuses while the tree is dirty', async () => {
		await createBranch(root, 'fd/demo/i1', 'develop');
		writeFileSync(join(root, 'README.md'), 'wip\n');
		await expect(checkoutBranch(root, 'develop')).rejects.toThrow(/uncommitted changes/);
	});
});

describe('listing', () => {
	it('lists only branches under the prefix', async () => {
		await createBranch(root, 'fd/demo/i1', 'develop');
		g('checkout', '-q', 'develop');
		await createBranch(root, 'fd/demo/i2', 'develop');
		g('checkout', '-q', 'develop');
		await createBranch(root, 'feature/other', 'develop');
		expect(await listBranches(root, 'fd/demo')).toEqual(['fd/demo/i1', 'fd/demo/i2']);
	});

	it('knows whether a branch exists', async () => {
		expect(await branchExists(root, 'develop')).toBe(true);
		expect(await branchExists(root, 'nope')).toBe(false);
	});
});

describe('branchAuthors', () => {
	const commitAs = (name: string, file: string) => {
		writeFileSync(join(root, file), `${name}\n`);
		g('add', '.');
		g('-c', `user.name=${name}`, '-c', 'user.email=x@example.test', 'commit', '-q', '-m', `by ${name}`);
	};

	it('lists everyone who committed on the branch, once each, and not the trunk\'s authors', async () => {
		g('checkout', '-q', '-b', 'fd/p/i1');
		commitAs('Ada Lovelace', 'a.txt');
		commitAs('Grace Hopper', 'b.txt');
		commitAs('Ada Lovelace', 'c.txt');
		expect(await branchAuthors(root, 'fd/p/i1')).toEqual(['Ada Lovelace', 'Grace Hopper']);
	});

	it('leaves out automation', async () => {
		g('checkout', '-q', '-b', 'fd/p/i1');
		commitAs('dependabot[bot]', 'a.txt');
		commitAs('Grace Hopper', 'b.txt');
		expect(await branchAuthors(root, 'fd/p/i1')).toEqual(['Grace Hopper']);
	});

	it('credits nobody on the trunk itself, rather than everybody', async () => {
		expect(await branchAuthors(root, 'develop')).toEqual([]);
	});
});
