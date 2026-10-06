import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Checkout } from '../../shared/contract';

const run = promisify(execFile);

/**
 * Git, through argv only.
 *
 * Every call goes through `execFile` with an argument array, so no shell parses
 * anything -- a branch name containing `;` or backticks is a bad branch name,
 * not a command. Nothing here rewrites or discards history: the destructive
 * verbs are simply absent, which is a stronger guarantee than guarding them.
 */

export class GitProblem extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GitProblem';
	}
}

/** One queue per repository: git takes a lock on the index, so two commands at once can collide. */
const queues = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isLockContention = (detail: string): boolean => /index\.lock|Unable to create .*\.lock|another git process/i.test(detail);

const attempt = async (root: string, args: string[], timeoutMs?: number): Promise<string> => {
	// `--no-optional-locks`: a read-only command (status, log, rev-parse) would otherwise
	// refresh the index in the background and take the same lock a checkout needs. Git
	// documents this flag for exactly the case of a tool polling a repository.
	const { stdout } = await run('git', ['--no-optional-locks', '-C', root, ...args], {
		maxBuffer: 16 * 1024 * 1024,
		...(timeoutMs ? { timeout: timeoutMs } : {}),
		// Never wait for someone to type a password into a window that has no terminal.
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
	});
	return stdout.trim();
};

/**
 * Runs git, one command at a time per repository, retrying briefly if something outside
 * this app (an editor, a terminal) holds the lock for a moment.
 *
 * A lock that stays is not removed here: a lock file is how git says "someone is writing
 * to this", and deleting one under a live process corrupts the index. The error says what
 * to check instead.
 */
const git = (root: string, args: string[], timeoutMs?: number): Promise<string> => {
	const run1 = async (): Promise<string> => {
		let lastDetail = '';
		for (let i = 0; i < 4; i++) {
			try {
				return await attempt(root, args, timeoutMs);
			} catch (err) {
				lastDetail = (err as { stderr?: string; message: string }).stderr?.trim() || (err as Error).message;
				if (!isLockContention(lastDetail)) throw new GitProblem(lastDetail);
				if (i < 3) await sleep(250 * (i + 1));
			}
		}
		throw new GitProblem(
			`${lastDetail}\n\nGit says another process is using this repository. If nothing else is running git in it, the lock is left over and .git/index.lock can be deleted.`,
		);
	};
	const key = resolve(root);
	const result = (queues.get(key) ?? Promise.resolve()).then(run1, run1);
	// The next command waits for this one whether it worked or not.
	queues.set(key, result.catch(() => undefined));
	return result;
};

export const isRepository = (root: string): boolean => existsSync(join(root, '.git'));

export const readCheckout = async (root: string): Promise<Checkout> => {
	if (!isRepository(root)) {
		throw new GitProblem(`${root} is not a git repository`);
	}
	const branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
	const status = await git(root, ['status', '--porcelain']);
	return {
		root,
		name: basename(root),
		branch: branch === 'HEAD' ? null : branch,
		clean: status === '',
	};
};

export const headCommit = async (root: string): Promise<string> => git(root, ['rev-parse', 'HEAD']);

export const branchExists = async (root: string, branch: string): Promise<boolean> => {
	try {
		await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
		return true;
	} catch {
		return false;
	}
};

export const listBranches = async (root: string, prefix: string): Promise<string[]> => {
	const out = await git(root, ['for-each-ref', '--format=%(refname:short)', `refs/heads/${prefix}`]);
	return out === '' ? [] : out.split('\n');
};

/**
 * Refuses to move HEAD while the tree is dirty.
 *
 * A designer who has edited something and not committed it should be told, not
 * have the edits carried onto another branch or quietly stashed. This is the
 * only guard that stands between "create iteration 2" and losing iteration 1's
 * uncommitted work.
 */
const requireCleanTree = async (root: string, action: string): Promise<void> => {
	const { clean } = await readCheckout(root);
	if (!clean) {
		throw new GitProblem(
			`There are uncommitted changes in ${basename(root)}. Commit or put them aside before ${action}.`,
		);
	}
};

export const createBranch = async (root: string, branch: string, from: string): Promise<void> => {
	await requireCleanTree(root, 'creating a new iteration');
	if (await branchExists(root, branch)) {
		throw new GitProblem(`Branch ${branch} already exists.`);
	}
	await git(root, ['checkout', '-b', branch, from]);
};

/** `[bot]` accounts and automation are not people working on a design. */
const isPerson = (name: string): boolean => name !== '' && !/\[bot\]$/i.test(name);

/**
 * The branch the repository treats as its trunk, to measure an iteration against.
 * Prefers the remote's own default, then the usual names; null if none exists,
 * in which case nobody is credited rather than everybody.
 */
const trunk = async (root: string): Promise<string | null> => {
	try {
		return (await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])) || null;
	} catch {
		for (const name of ['develop', 'main', 'master']) {
			if (await branchExists(root, name)) return name;
		}
		return null;
	}
};

/**
 * Who has committed on a branch, beyond what is already on the trunk, in the
 * order they first appear. Names only: a shared repository is no place for
 * anyone's email address.
 */
export interface Author {
	name: string;
	email: string;
}

export const branchAuthors = async (root: string, branch: string): Promise<Author[]> => {
	const base = await trunk(root);
	if (base === null || base === branch) return [];
	const out = await git(root, ['log', '--reverse', '--format=%aN%x09%aE', `${base}..${branch}`]);
	const seen = new Map<string, Author>();
	for (const line of out.split('\n')) {
		const [name = '', email = ''] = line.split('\t').map((x) => x.trim());
		if (isPerson(name) && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, email });
	}
	return [...seen.values()];
};

/** Who this machine commits as. Empty strings when git has no identity set. */
export const localIdentity = async (root: string): Promise<Author> => {
	const read = async (key: string) => {
		try {
			return await git(root, ['config', key]);
		} catch {
			return '';
		}
	};
	return { name: await read('user.name'), email: await read('user.email') };
};

/** The commit a branch is at, without switching to it. */
export const branchCommit = async (root: string, branch: string): Promise<string> =>
	git(root, ['rev-parse', '--verify', `refs/heads/${branch}`]);

export const checkoutBranch = async (root: string, branch: string): Promise<void> => {
	await requireCleanTree(root, 'switching iteration');
	if (!(await branchExists(root, branch))) {
		throw new GitProblem(`Branch ${branch} does not exist.`);
	}
	await git(root, ['checkout', branch]);
};

/**
 * Sends a branch to `origin` and says whether anything actually went.
 *
 * `--porcelain` is git's own format for scripts: a line starting with `=` means the remote
 * already had exactly this, which is how sharing again with nothing new is told apart from
 * sharing new work. Plain push only ever *adds* to the branch: it is refused, not forced,
 * if the remote has commits this machine lacks.
 */
export const pushBranch = async (root: string, branch: string): Promise<{ pushed: boolean }> => {
	if (!(await branchExists(root, branch))) {
		throw new GitProblem(`Branch ${branch} does not exist on this machine, so there is nothing to share.`);
	}
	let out: string;
	try {
		out = await git(root, ['push', '--porcelain', '--set-upstream', 'origin', `refs/heads/${branch}:refs/heads/${branch}`], 120_000);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		if (/rejected|non-fast-forward|fetch first/i.test(detail)) {
			throw new GitProblem(
				`${branch} has changes on the remote that this machine does not have, so it was not pushed. Pull them first, then share again.\n\n${detail}`,
			);
		}
		throw new GitProblem(`Could not push ${branch} to origin.\n\n${detail}`);
	}
	const lines = out.split('\n').filter((l) => l.includes('refs/heads/'));
	return { pushed: !lines.every((l) => l.startsWith('=')) };
};
