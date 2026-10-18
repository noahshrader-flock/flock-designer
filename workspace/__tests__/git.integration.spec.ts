import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	branchAuthors,
	defaultBranch,
	branchExists,
	checkoutBranch,
	createBranch,
	isRepository,
	listBranches,
	branchStartedAt,
	isSafeBranchName,
	readCheckout,
	changedSince,
	git,
	hasFileAt,
	originUrl,
} from '../src/core/services/git';
import { recordDefault } from './fixtures';

let root: string;
const g = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-git-'));
	g('init', '-q', '-b', 'develop');
	recordDefault(root);
	writeFileSync(join(root, 'README.md'), '# repo\n');
	g('add', '.');
	g('commit', '-q', '-m', 'first');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('what a repository says', () => {
	it('gives origin as git resolves it, rewritten by insteadOf', async () => {
		expect(await originUrl(root)).toBeNull();
		g('remote', 'add', 'origin', 'gh:flocksafety/flock-coke');
		g('config', 'url.git@github.com:.insteadOf', 'gh:');
		expect(await originUrl(root)).toBe('git@github.com:flocksafety/flock-coke');
	});

	it('says whether a file is on a branch, and whether a commit since changed it', async () => {
		const first = g('rev-parse', 'HEAD').trim();
		expect(await hasFileAt(root, 'refs/heads/develop', 'README.md')).toBe(true);
		expect(await hasFileAt(root, 'refs/heads/develop', 'HANDOFF.md')).toBe(false);
		expect(await changedSince(root, first, 'HANDOFF.md')).toBe(false);
		writeFileSync(join(root, 'HANDOFF.md'), 'done');
		g('add', '.');
		g('commit', '-q', '-m', 'handoff');
		expect(await changedSince(root, first, 'HANDOFF.md')).toBe(true);
		expect(await changedSince(root, first, 'README.md')).toBe(false);
	});
});

describe('how git is run', () => {
	/** What git's own environment holds for `name`, as a command it runs sees it. */
	const seen = (name: string) => git(root, ['-c', `alias.seen=!printenv ${name}`, 'seen']);

	it('never asks for a password or lets ssh ask one, since there is no terminal to answer', async () => {
		expect(await seen('GIT_TERMINAL_PROMPT')).toBe('0');
		const own = process.env.GIT_SSH_COMMAND;
		delete process.env.GIT_SSH_COMMAND;
		try {
			expect(await seen('GIT_SSH_COMMAND')).toBe('ssh -o BatchMode=yes');
		} finally {
			if (own !== undefined) process.env.GIT_SSH_COMMAND = own;
		}
	});

	it('keeps a person’s own ssh command', async () => {
		const own = process.env.GIT_SSH_COMMAND;
		process.env.GIT_SSH_COMMAND = 'ssh -i ~/.ssh/mine';
		try {
			expect(await seen('GIT_SSH_COMMAND')).toBe('ssh -i ~/.ssh/mine');
		} finally {
			if (own === undefined) delete process.env.GIT_SSH_COMMAND;
			else process.env.GIT_SSH_COMMAND = own;
		}
	});

	it('stops a command that runs past its time, and says so', async () => {
		await expect(git(root, ['-c', 'alias.hang=!sleep 30', 'hang'], { timeoutMs: 300 })).rejects.toThrow(/did not finish within 0\.3 s/);
	});
});

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
		await expect(readCheckout(plain)).rejects.toThrow(/is not a git repository/);
		expect(isRepository(plain)).toBe(false);
		rmSync(plain, { recursive: true, force: true });
	});
});

describe('createBranch', () => {
	it('creates and switches to the branch', async () => {
		await createBranch(root, 'prototype/demo/v1', 'develop');
		expect((await readCheckout(root)).branch).toBe('prototype/demo/v1');
	});

	it('refuses while the tree is dirty, rather than carrying the edits over', async () => {
		writeFileSync(join(root, 'README.md'), 'work in progress\n');
		await expect(createBranch(root, 'prototype/demo/v1', 'develop')).rejects.toThrow(/uncommitted changes/);
		// and the edit is still there, on the branch it was made on
		expect((await readCheckout(root)).branch).toBe('develop');
	});

	it('refuses to reuse an existing branch name', async () => {
		await createBranch(root, 'prototype/demo/v1', 'develop');
		g('checkout', '-q', 'develop');
		await expect(createBranch(root, 'prototype/demo/v1', 'develop')).rejects.toThrow(/already exists/);
	});

	it('treats a branch name with shell metacharacters as a name, not a command', async () => {
		// If anything here reached a shell, this would run `touch`. argv means it cannot.
		const nasty = 'prototype/demo/v1; touch pwned';
		await expect(createBranch(root, nasty, 'develop')).rejects.toThrow();
		expect(isRepository(join(root, 'pwned'))).toBe(false);
	});
});

describe('checkoutBranch', () => {
	it('switches to an existing branch', async () => {
		await createBranch(root, 'prototype/demo/v1', 'develop');
		await checkoutBranch(root, 'develop');
		expect((await readCheckout(root)).branch).toBe('develop');
	});

	it('refuses a branch that does not exist', async () => {
		await expect(checkoutBranch(root, 'prototype/nope/v9')).rejects.toThrow(/does not exist/);
	});

	it('refuses while the tree is dirty', async () => {
		await createBranch(root, 'prototype/demo/v1', 'develop');
		writeFileSync(join(root, 'README.md'), 'wip\n');
		await expect(checkoutBranch(root, 'develop')).rejects.toThrow(/uncommitted changes/);
	});
});

describe('listing', () => {
	it('lists only branches under the prefix', async () => {
		await createBranch(root, 'feature/demo/one', 'develop');
		g('checkout', '-q', 'develop');
		await createBranch(root, 'feature/demo/two', 'develop');
		g('checkout', '-q', 'develop');
		await createBranch(root, 'feature/other', 'develop');
		expect(await listBranches(root, 'feature/demo')).toEqual(['feature/demo/one', 'feature/demo/two']);
	});

	it('knows whether a branch exists', async () => {
		expect(await branchExists(root, 'develop')).toBe(true);
		expect(await branchExists(root, 'nope')).toBe(false);
	});
});

describe('the default branch', () => {
	it('is what git recorded when the repository was cloned, and never guessed from a branch’s name', async () => {
		expect(await defaultBranch(root)).toBe('develop');
		const bare = mkdtempSync(join(tmpdir(), 'fdw-git-unknown-'));
		try {
			execFileSync('git', ['-C', bare, 'init', '-q', '-b', 'develop']);
			execFileSync('git', ['-C', bare, 'commit', '-q', '--allow-empty', '-m', 'first']);
			// A develop, a main, and no record and no remote to say which is the default: none is.
			execFileSync('git', ['-C', bare, 'branch', 'main']);
			expect(await defaultBranch(bare)).toBeNull();
		} finally {
			rmSync(bare, { recursive: true, force: true });
		}
	});
});

describe('branchAuthors', () => {
	const commitAs = (name: string, file: string) => {
		writeFileSync(join(root, file), `${name}\n`);
		g('add', '.');
		g('-c', `user.name=${name}`, '-c', 'user.email=x@example.test', 'commit', '-q', '-m', `by ${name}`);
	};

	it("lists everyone who committed on the branch, once each, and not the trunk's authors", async () => {
		g('checkout', '-q', '-b', 'prototype/p/v1');
		commitAs('Ada Lovelace', 'a.txt');
		commitAs('Grace Hopper', 'b.txt');
		commitAs('Ada Lovelace', 'c.txt');
		expect((await branchAuthors(root, 'prototype/p/v1')).map((a) => a.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
	});

	it('leaves out automation', async () => {
		g('checkout', '-q', '-b', 'prototype/p/v1');
		commitAs('dependabot[bot]', 'a.txt');
		commitAs('Grace Hopper', 'b.txt');
		expect((await branchAuthors(root, 'prototype/p/v1')).map((a) => a.name)).toEqual(['Grace Hopper']);
	});

	it('credits nobody on the trunk itself, rather than everybody', async () => {
		expect(await branchAuthors(root, 'develop')).toEqual([]);
	});
});

describe('two commands at once in one repository', () => {
	// The bug this guards: opening a version ran its branch switch twice at the same
	// moment (React runs effects twice in development), and one `git checkout` hit the
	// other's index.lock and failed, with "Another git process seems to be running".
	it('do not collide: every one of them succeeds', async () => {
		// Real checkouts are prototype, so a collision needs a repository big enough that holding
		// the lock takes a moment, and enough commands at once that two are bound to overlap.
		mkdirSync(join(root, 'src'), { recursive: true });
		for (let i = 0; i < 400; i++) writeFileSync(join(root, 'src', `f${i}.txt`), `${i}\n`.repeat(50));
		g('add', '.');
		g('commit', '-q', '-m', 'many files');
		g('checkout', '-q', '-b', 'a');
		writeFileSync(join(root, 'src', 'f0.txt'), 'different\n');
		g('commit', '-q', '-am', 'a differs');
		g('checkout', '-q', 'develop');
		g('branch', 'b');

		const jobs = Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? readCheckout(root) : checkoutBranch(root, i % 2 ? 'a' : 'b')));
		const results = await Promise.allSettled(jobs);
		expect(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
	}, 60_000);

	it('run in the order they were asked for', async () => {
		g('branch', 'a');
		g('branch', 'b');
		await Promise.all([checkoutBranch(root, 'a'), checkoutBranch(root, 'b')]);
		expect((await readCheckout(root)).branch).toBe('b');
	});

	it('do not let a failure stop the commands queued behind it', async () => {
		g('branch', 'a');
		await expect(checkoutBranch(root, 'no-such-branch')).rejects.toThrow(/Branch no-such-branch does not exist/);
		await checkoutBranch(root, 'a');
		expect((await readCheckout(root)).branch).toBe('a');
	});
});

describe('a lock held by something outside the app', () => {
	const lock = () => join(root, '.git', 'index.lock');

	it("is waited out when it clears by itself, as an editor's brief lock does", async () => {
		g('branch', 'a');
		writeFileSync(lock(), '');
		setTimeout(() => existsSync(lock()) && unlinkSync(lock()), 400);
		await checkoutBranch(root, 'a');
		expect((await readCheckout(root)).branch).toBe('a');
	}, 10_000);

	it('is never deleted for the person, and the error says what to check', async () => {
		g('branch', 'a');
		writeFileSync(lock(), '');
		const err = await checkoutBranch(root, 'a').catch((e: Error) => e);
		expect((err as Error).message).toMatch(/index\.lock/);
		expect((err as Error).message).toMatch(/nothing else is running git/i);
		// Deleting a lock under a live process corrupts the index, so it must still be there.
		expect(existsSync(lock())).toBe(true);
		unlinkSync(lock());
	}, 15_000);

	it('does not hold up a read: status takes no lock, so it works while one is held', async () => {
		writeFileSync(lock(), '');
		expect((await readCheckout(root)).branch).toBe('develop');
		unlinkSync(lock());
	});
});

describe('branchStartedAt', () => {
	const commitOn = (iso: string, file: string) => {
		writeFileSync(join(root, file), file);
		g('add', '.');
		execFileSync('git', ['-C', root, 'commit', '-q', '-m', file], { env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso } });
	};

	it('is the date of the first commit the branch has beyond the trunk', async () => {
		g('checkout', '-q', '-b', 'feature/new-view');
		commitOn('2026-10-01T09:00:00+00:00', 'one.txt');
		commitOn('2026-10-04T09:00:00+00:00', 'two.txt');
		commitOn('2026-10-06T09:00:00+00:00', 'three.txt');
		expect(new Date((await branchStartedAt(root, 'feature/new-view')) as string).toISOString()).toBe('2026-10-01T09:00:00.000Z');
	});

	it('does not count commits the trunk already had', async () => {
		commitOn('2026-09-01T09:00:00+00:00', 'trunk.txt');
		g('checkout', '-q', '-b', 'feature/later');
		commitOn('2026-10-03T09:00:00+00:00', 'mine.txt');
		expect(new Date((await branchStartedAt(root, 'feature/later')) as string).toISOString()).toBe('2026-10-03T09:00:00.000Z');
	});

	it('falls back to the newest commit for a branch with nothing of its own yet, and to null for no branch', async () => {
		g('checkout', '-q', '-b', 'feature/just-cut');
		expect(await branchStartedAt(root, 'feature/just-cut')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(await branchStartedAt(root, 'feature/nope')).toBeNull();
	});
});

describe('a branch name from data', () => {
	it('is safe to give git only when it cannot be read as an option or a range', () => {
		for (const name of ['develop', 'feature/alpha', 'noah/flock-designer', 'v1.2', 'a_b-c']) expect(isSafeBranchName(name)).toBe(true);
		for (const name of ['-x', '--output=/tmp/x', '', 'a..b', '/abs', ' develop', 'a b', 'x:y', 'a~1', 'a^', '.hidden'])
			expect(isSafeBranchName(name)).toBe(false);
	});

	it('is never read by git as an option when a branch’s start is asked for', async () => {
		const written = join(root, 'written-by-git');
		expect(await branchStartedAt(root, `--output=${written}`)).toBeNull();
		expect(existsSync(written)).toBe(false);
	});
});
