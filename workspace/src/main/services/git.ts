import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
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

const git = async (root: string, args: string[]): Promise<string> => {
	try {
		const { stdout } = await run('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024 });
		return stdout.trim();
	} catch (err) {
		const detail = (err as { stderr?: string; message: string }).stderr?.trim() || (err as Error).message;
		throw new GitProblem(detail);
	}
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

export const checkoutBranch = async (root: string, branch: string): Promise<void> => {
	await requireCleanTree(root, 'switching iteration');
	if (!(await branchExists(root, branch))) {
		throw new GitProblem(`Branch ${branch} does not exist.`);
	}
	await git(root, ['checkout', branch]);
};
