import { parseRemote } from '../../../shared/repoRef';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { Checkout } from '../../../shared/contract';
import { NotInstalled, ProcessFailed, runFile } from './process';
import { errorText } from '../../../shared/result';
import { isBot } from '../../../shared/people';
import { OBJECT_ID_PATTERN, isObjectId } from '../../../shared/sha';

/**
 * Git, through argv only, so a branch name with `;` or backticks is a bad name, not a command. These helpers never rewrite
 * history or discard a person's work: the one forced checkout is in DSNR's own worktree (`readTreeAt`), and a branch is
 * only switched on a clean tree.
 */

/** One queue per repository: git takes a lock on the index, so two commands at once can collide. */
const queues = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Kept on the error, so a caller tells "not there" from "could not look" (`saidNo`), and never forgets what it could not
 * check.
 */
export type GitFailure = 'failed' | 'timeout' | 'locked' | 'notInstalled';
export class GitError extends Error {
	constructor(
		message: string,
		readonly kind: GitFailure,
		readonly exitCode: number | null,
		/** What it wrote before it failed: a command that answers by its exit code (`merge-tree`) says the rest here. */
		readonly stdout = '',
	) {
		super(message);
		this.name = 'GitError';
	}
}
const gitError = (err: unknown, message: string): GitError =>
	err instanceof NotInstalled
		? new GitError(message, 'notInstalled', null)
		: err instanceof ProcessFailed
			? new GitError(message, err.timedOut ? 'timeout' : 'failed', err.code, err.stdout)
			: new GitError(message, 'failed', null);
/** Git ran and answered no, as a command that asks a question does by exiting 1 (`rev-parse --verify --quiet`, `--is-ancestor`). */
const saidNo = (err: unknown): boolean => err instanceof GitError && err.kind === 'failed' && err.exitCode === 1;

const isLockContention = (detail: string): boolean => /index\.lock|Unable to create .*\.lock|another git process/i.test(detail);

export interface GitOptions {
	/** `runFile`'s limit when not given: a hung command would hold up every other one on its repository. */
	timeoutMs?: number;
	env?: Record<string, string>;
	input?: string;
	/**
	 * Trimmed unless false. Read a file's contents with `trim: false`: a file read trimmed and written back would lose its
	 * last newline.
	 */
	trim?: boolean;
	/**
	 * False only for a command that takes no lock another waits on and must not wait behind them: a fetch of one
	 * remote-tracking ref, which never touches the index, HEAD or the working tree.
	 */
	queued?: boolean;
}

const attempt = async (root: string, args: string[], { timeoutMs, env, input }: GitOptions): Promise<string> => {
	// `--no-optional-locks`: a read-only command (status, log, rev-parse) would otherwise
	// refresh the index in the background and take the same lock a checkout needs. Git
	// documents this flag for exactly the case of a tool polling a repository.
	const { stdout } = await runFile('git', ['--no-optional-locks', '-C', root, ...args], {
		timeoutMs,
		// Never wait for someone to type a password into a window that has no terminal, nor for ssh to ask one (an app
		// opened from the Dock has no terminal for it). A person's own ssh command is theirs, and kept.
		env: { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes', ...env },
		input,
	});
	return stdout;
};

/**
 * Runs git one command at a time per repository, retrying briefly while something else (an editor, a terminal) holds the
 * lock. A lock that stays is never removed: deleting one under a live process corrupts the index.
 */
const queued = (root: string, args: string[], options: GitOptions): Promise<string> => {
	const run1 = async (): Promise<string> => {
		let lastDetail = '';
		for (let i = 0; i < 4; i++) {
			try {
				return await attempt(root, args, options);
			} catch (err) {
				lastDetail = errorText(err);
				if (!isLockContention(lastDetail)) throw gitError(err, lastDetail);
				if (i < 3) await sleep(250 * (i + 1));
			}
		}
		throw new GitError(
			`${lastDetail}\n\nGit says another process is using this repository. If nothing else is running git in it, the lock is left over and .git/index.lock can be deleted.`,
			'locked',
			null,
		);
	};
	const key = resolve(root);
	const result = (queues.get(key) ?? Promise.resolve()).then(run1, run1);
	// The next command waits for this one whether it worked or not.
	queues.set(
		key,
		result.catch(() => undefined),
	);
	return result;
};

export const git = (root: string, args: string[], options: GitOptions = {}): Promise<string> =>
	(options.queued === false
		? attempt(root, args, options).catch((err: unknown) => Promise.reject(gitError(err, errorText(err))))
		: queued(root, args, options)
	).then((out) => (options.trim === false ? out : out.trim()));

export const isRepository = (root: string): boolean => existsSync(join(root, '.git'));

export const readCheckout = async (root: string): Promise<Checkout> => {
	if (!isRepository(root)) {
		throw new Error(`${root} is not a git repository`);
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

/** Whether `branch` is in the repository: false only when git says it is not, an error for anything that stopped it looking. */
export const branchExists = async (root: string, branch: string): Promise<boolean> => (await branchTip(root, branch)) !== null;

export const listBranches = async (root: string, prefix: string): Promise<string[]> => {
	const out = await git(root, ['for-each-ref', '--format=%(refname:short)', `refs/heads/${prefix}`]);
	return out === '' ? [] : out.split('\n');
};

/**
 * A git worktree on a detached HEAD at `commit` (a full object id), made once and moved each time: nothing in the person's
 * working tree, index or current branch changes.
 */
export const readTreeAt = async (root: string, dir: string, commit: string): Promise<void> => {
	if (!isObjectId(commit)) throw new Error(`${commit} is not a commit DSNR can read.`);
	if (existsSync(dir) && !existsSync(join(dir, '.git'))) {
		// Left half-made by an earlier attempt: it is the app's own copy, so it is cleared and made again.
		rmSync(dir, { recursive: true, force: true });
	}
	if (existsSync(join(dir, '.git'))) {
		// Its own copy, never edited, so anything left in it is discarded.
		await git(dir, ['checkout', '--detach', '--force', commit]);
	} else {
		await git(root, ['worktree', 'prune']);
		await git(root, ['worktree', 'add', '--detach', '--force', dir, commit]);
	}
};

/** Past this, the most recently committed to are enough. */
const MAX_BASES = 300;

/**
 * Ones only on `origin` too, since a fresh clone has few locally. The ref is the local branch when there is one, since
 * that is what work starts from.
 */
const baseRefs = async (root: string): Promise<{ name: string; ref: string }[]> => {
	const out = await git(root, ['for-each-ref', '--sort=-committerdate', '--format=%(refname)', 'refs/heads/', 'refs/remotes/origin/']);
	const refs = out === '' ? [] : out.split('\n');
	const local = new Set(refs.filter((r) => r.startsWith('refs/heads/')).map((r) => r.slice('refs/heads/'.length)));
	const seen = new Set<string>();
	const bases: { name: string; ref: string }[] = [];
	for (const ref of refs) {
		const name = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref.slice('refs/remotes/origin/'.length);
		if (name === 'HEAD' || seen.has(name)) continue;
		seen.add(name);
		bases.push({ name, ref: local.has(name) ? `refs/heads/${name}` : ref });
		if (bases.length === MAX_BASES) break;
	}
	return bases;
};

/** Asked of git once however many branches there are. */
export const branchesWithFile = async (root: string, file: string): Promise<string[]> => {
	const bases = await baseRefs(root);
	if (bases.length === 0) return [];
	const lines = (await git(root, ['cat-file', '--batch-check'], { input: `${bases.map((b) => `${b.ref}:${file}`).join('\n')}\n` })).split('\n');
	// Found: `<object> blob <size>`. Not there: `<what was asked> missing`.
	const found = new RegExp(`^${OBJECT_ID_PATTERN} blob `);
	return bases.filter((_, i) => found.test(lines[i] ?? '')).map((b) => b.name);
};

/**
 * Whether a branch name that came from data (a record, the shared design repository) is safe to give git where it would
 * start an argument: never an option (`-…`) or a range (`a..b`), nor anything git refuses in a branch name. The one
 * rule, for every caller; a name that fails it is treated as a branch that does not exist.
 */
export const isSafeBranchName = (name: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) && !name.includes('..');

/**
 * A commit of `base`'s tree with `files` changed (each a blob, or null to remove it), whose parent is `parent`: made in a
 * temporary index, so neither a working copy nor the repository's own index is touched. A file keeps the mode it has in
 * `base`. Null when the tree is the parent's, so nothing would change.
 */
export const commitOnto = async (
	root: string,
	base: string,
	parent: string,
	files: Map<string, string | null>,
	message: string,
): Promise<string | null> => {
	const env = { GIT_INDEX_FILE: join(tmpdir(), `dsnr-index-${randomBytes(6).toString('hex')}`) };
	try {
		await git(root, ['read-tree', base], { env });
		for (const [path, blob] of files) {
			if (blob === null) {
				await git(root, ['update-index', '--force-remove', '--', path], { env });
				continue;
			}
			const mode = (await git(root, ['ls-tree', base, '--', path])).split(/\s/)[0] || '100644';
			await git(root, ['update-index', '--add', '--cacheinfo', `${mode},${blob},${path}`], { env });
		}
		const tree = await git(root, ['write-tree'], { env });
		if (tree === (await git(root, ['rev-parse', `${parent}^{tree}`]))) return null;
		return await git(root, ['commit-tree', tree, '-p', parent], { input: message });
	} finally {
		rmSync(env.GIT_INDEX_FILE, { force: true });
	}
};

/**
 * A branch to start from, made local when it is only on GitHub: a local branch tracking `origin/<branch>`, with no
 * checkout, so the person's current branch never moves. Throws when it is on neither.
 */
export const ensureLocalBranch = async (root: string, branch: string): Promise<void> => {
	if (await branchExists(root, branch)) return;
	// Only ever the name of a branch git has, so it cannot be read as an option.
	const remote = `refs/remotes/origin/${branch}`;
	const onGitHub =
		!branch.startsWith('-') &&
		(await git(root, ['rev-parse', '--verify', '--quiet', remote]).then(
			() => true,
			() => false,
		));
	if (!onGitHub) throw new Error(`There is no branch called ${branch} in ${basename(root)}.`);
	await git(root, ['branch', '--track', branch, remote]);
};

/**
 * Refuses to move HEAD while the tree is dirty: uncommitted edits are told about, never carried onto another branch or
 * quietly stashed. The only guard between switching branches and losing that work.
 */
const requireCleanTree = async (root: string, action: string): Promise<void> => {
	const { clean } = await readCheckout(root);
	if (!clean) {
		throw new Error(`There are uncommitted changes in ${basename(root)}. Commit or put them aside before ${action}.`);
	}
};

export const createBranch = async (root: string, branch: string, from: string): Promise<void> => {
	await requireCleanTree(root, 'starting a new branch');
	if (await branchExists(root, branch)) {
		throw new Error(`Branch ${branch} already exists.`);
	}
	await git(root, ['checkout', '-b', branch, from]);
};

const isPerson = (name: string): boolean => name !== '' && !isBot(name);

/** How long asking the remote for its default branch may take: a clone's own record is asked first, and almost always says. */
const REMOTE_TIMEOUT_MS = 30_000;
const defaults = new Map<string, Promise<string | null>>();

/**
 * The one answer every part of DSNR asks; null if neither `origin/HEAD` nor the remote says. Never guessed from a branch's
 * name: a clone with a `develop` whose default is `main` is `main`'s.
 */
export const defaultBranch = (root: string): Promise<string | null> => {
	const key = resolve(root);
	const known = defaults.get(key);
	if (known) return known;
	const asked = (async (): Promise<string | null> => {
		const ref = await git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).catch(() => '');
		if (ref.startsWith('refs/remotes/origin/')) return ref.slice('refs/remotes/origin/'.length);
		const out = await git(root, ['ls-remote', '--symref', 'origin', 'HEAD'], { timeoutMs: REMOTE_TIMEOUT_MS }).catch(() => '');
		return /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(out)?.[1] ?? null;
	})();
	defaults.set(key, asked);
	return asked;
};

/** Null when there is no default, in which case nobody is credited rather than everybody. */
const trunk = async (root: string): Promise<string | null> => {
	const name = await defaultBranch(root);
	if (name === null) return null;
	for (const ref of [`origin/${name}`, name])
		if (
			await git(root, ['rev-parse', '--verify', '--quiet', ref]).then(
				() => true,
				() => false,
			)
		)
			return ref;
	return null;
};

export interface Author {
	name: string;
	email: string;
}

/**
 * The email is only for telling who is who (`isSamePerson`); what is kept or shown of a person is their name, since a
 * shared repository is no place for anyone's email address.
 */
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

export const isSamePerson = (me: Author, other: Author): boolean =>
	(me.email !== '' && other.email.toLowerCase() === me.email.toLowerCase()) || (me.name !== '' && other.name.toLowerCase() === me.name.toLowerCase());

/** Empty strings when git has no identity set. */
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

/**
 * As git resolves it (its `insteadOf` rules, a worktree's shared config). For one repository; a scan of many reads
 * `.git/config` itself (`originOf`), sparing a process per folder.
 */
export const originUrl = async (root: string): Promise<string | null> => (await git(root, ['remote', 'get-url', 'origin']).catch(() => '')) || null;

/** `owner/repo`, the same on every machine. */
export const repositoryOf = async (root: string): Promise<string | null> => {
	const origin = await originUrl(root);
	return origin === null ? null : parseRemote(origin);
};

/** `ref`: a commit, or a branch's full ref. */
export const hasFileAt = (root: string, ref: string, path: string): Promise<boolean> =>
	git(root, ['cat-file', '-e', `${ref}:${path}`]).then(
		() => true,
		() => false,
	);

/** Null when git says it is not there; an error for anything that stopped it looking. */
export const fileAt = async (root: string, ref: string, path: string): Promise<{ text: string; sha: string } | null> => {
	const sha = await git(root, ['rev-parse', '--verify', '--quiet', `${ref}:${path}`]).catch((err: unknown) =>
		saidNo(err) ? null : Promise.reject(err),
	);
	if (!sha) return null;
	return { text: await git(root, ['cat-file', 'blob', sha], { trim: false }), sha };
};

export const changedSince = async (root: string, commit: string, path: string): Promise<boolean> =>
	(await git(root, ['diff', '--name-only', commit, 'HEAD', '--', path])) !== '';

/** The commit a full ref (`refs/…`) points at. Null when git says there is no such ref; an error for anything that stopped it looking. */
export const refTip = (root: string, ref: string): Promise<string | null> =>
	git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).catch((err: unknown) => (saidNo(err) ? null : Promise.reject(err)));

export const branchTip = (root: string, branch: string): Promise<string | null> => refTip(root, `refs/heads/${branch}`);

/** The branch as this clone last saw it on `origin`: a push moves it. Null when it has none there. */
export const remoteTip = (root: string, branch: string): Promise<string | null> => refTip(root, `refs/remotes/origin/${branch}`);

export const changedFiles = async (root: string, commit: string): Promise<string[]> =>
	(await git(root, ['diff', '--name-only', commit, 'HEAD'])).split('\n').filter((f) => f !== '');

/** One GitHub has may not be fetched yet. False only when git says it has not. */
export const hasCommit = (root: string, commit: string): Promise<boolean> =>
	git(root, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]).then(
		() => true,
		(err: unknown) => (saidNo(err) ? false : Promise.reject(err)),
	);

/**
 * Whether `older` is `newer` or one of its ancestors: false when git says it is not, or when this clone has no such commit
 * (it is then in no history the clone has); an error for anything that stopped git looking.
 */
export const isAncestor = async (root: string, older: string, newer: string): Promise<boolean> =>
	(await hasCommit(root, older)) &&
	git(root, ['merge-base', '--is-ancestor', older, newer]).then(
		() => true,
		(err: unknown) => (saidNo(err) ? false : Promise.reject(err)),
	);

/**
 * The files merging `theirs` into `ours` would leave in conflict, without merging: git writes only objects, never a ref,
 * the index or a file. Empty when it merges cleanly.
 */
export const mergeConflicts = async (root: string, ours: string, theirs: string): Promise<string[]> => {
	try {
		await git(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', ours, theirs]);
		return [];
	} catch (err) {
		// It says a conflict by exiting 1, with the tree on its first line and each conflicted file after it.
		if (!(err instanceof GitError && err.kind === 'failed' && err.exitCode === 1)) throw err;
		return [...new Set(err.stdout.trim().split('\n').slice(1).filter(Boolean))];
	}
};

/** How many commits `newer` has that `older` does not: 0 when it has none, as when they are the same. */
export const commitsAfter = async (root: string, older: string, newer: string): Promise<number> =>
	Number(await git(root, ['rev-list', '--count', `${older}..${newer}`]));

export const checkoutBranch = async (root: string, branch: string): Promise<void> => {
	await requireCleanTree(root, 'switching branches');
	if (!(await branchExists(root, branch))) {
		throw new Error(`Branch ${branch} does not exist.`);
	}
	await git(root, ['checkout', branch]);
};

/**
 * Sends a branch to `origin` and says whether anything went: a `--porcelain` line starting with `=` means the remote
 * already had it. Never forced, so it is refused when the remote has commits this machine lacks.
 */
export const pushBranch = async (root: string, branch: string): Promise<{ pushed: boolean }> => {
	if (!(await branchExists(root, branch))) {
		throw new Error(`Branch ${branch} does not exist on this machine, so there is nothing to share.`);
	}
	let out: string;
	try {
		out = await git(root, ['push', '--porcelain', '--set-upstream', 'origin', `refs/heads/${branch}:refs/heads/${branch}`], { timeoutMs: 120_000 });
	} catch (err) {
		const detail = errorText(err);
		if (/rejected|non-fast-forward|fetch first/i.test(detail)) {
			throw new Error(
				`${branch} has changes on the remote that this machine does not have, so it was not pushed. Pull them first, then try again.\n\n${detail}`,
			);
		}
		throw new Error(`Could not push ${branch} to origin.\n\n${detail}`);
	}
	const lines = out.split('\n').filter((l) => l.includes('refs/heads/'));
	return { pushed: !lines.every((l) => l.startsWith('=')) };
};

/**
 * The date of its first commit beyond the trunk, so work with no record still has an honest start. If the trunk is not
 * known, or the branch has nothing of its own, the newest commit stands in. Null if git cannot say.
 */
export const branchStartedAt = async (root: string, branch: string): Promise<string | null> => {
	const base = await trunk(root);
	const own = base !== null && base !== branch ? await git(root, ['log', '--format=%aI', `${base}..${branch}`]).catch(() => '') : '';
	const dates = own.split('\n').filter(Boolean);
	const oldest = dates[dates.length - 1];
	if (oldest) return oldest;
	if (!isSafeBranchName(branch)) return null;
	return (await git(root, ['log', '-1', '--format=%aI', branch]).catch(() => '')) || null;
};

/** Null when `ours` and `theirs` change the same lines, which is not guessed at. */
export const mergeTexts = async (base: string, ours: string, theirs: string): Promise<string | null> => {
	const dir = join(tmpdir(), `dsnr-merge-${randomBytes(6).toString('hex')}`);
	const [o, b, t] = ['ours', 'base', 'theirs'].map((n) => join(dir, n)) as [string, string, string];
	mkdirSync(dir, { recursive: true });
	try {
		writeFileSync(o, ours);
		writeFileSync(b, base);
		writeFileSync(t, theirs);
		// It exits with how many conflicts it found: none is 0.
		return (await runFile('git', ['merge-file', '-p', '--quiet', o, b, t], { timeoutMs: 10_000 })).stdout;
	} catch {
		return null;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

export const exportCommit = async (root: string, commit: string, dir: string): Promise<void> => {
	mkdirSync(dir, { recursive: true });
	const tar = `${dir}.tar`;
	try {
		await git(root, ['archive', '--format=tar', '-o', tar, commit]);
		await runFile('tar', ['-xf', tar, '-C', dir], { timeoutMs: 120_000 });
	} finally {
		rmSync(tar, { force: true });
	}
};
