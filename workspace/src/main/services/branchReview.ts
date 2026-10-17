/**
 * A hand-over branch read from git (Process changes, PROCESS_CHANGES_PLAN Phase 1), against the commit of the base it was
 * handed over on (`base`) and the base as GitHub has it now (`origin/<baseBranch>`): what Claude Code says it did is never read,
 * only what is on the branch. The diff is from where the branch left the base, so a base fetched since adds nothing of its own.
 */
import type { BranchReview } from '../../shared/contract';
import { LARGE, classifyPath } from '../../shared/processChanges';
import { branchExists, git } from './git';

const ancestor = async (root: string, older: string, newer: string): Promise<boolean> => {
	try {
		await git(root, ['merge-base', '--is-ancestor', older, newer]);
		return true;
	} catch {
		return false;
	}
};

export const reviewBranch = async (root: string, branch: string, base: string, baseBranch: string): Promise<BranchReview> => {
	if (!(await branchExists(root, branch))) return { state: 'missing' };
	const tip = await git(root, ['rev-parse', `refs/heads/${branch}`]);
	// Where it left the base: the newest commit it shares with the base as GitHub has it now, else with the one recorded.
	const upstream = await git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseBranch}`]).catch(() => '');
	const fork = await git(root, ['merge-base', tip, upstream || base]).catch(() => '');
	if (fork === '' || !(await ancestor(root, base, fork))) return { state: 'off-base' };
	const commits = Number(await git(root, ['rev-list', '--count', `${fork}..${tip}`]));
	if (commits === 0) return { state: 'empty' };
	const numstat = await git(root, ['diff', '--numstat', '--no-renames', fork, tip]);
	const files =
		numstat === ''
			? []
			: numstat.split('\n').map((line) => {
					const [added, removed, ...path] = line.split('\t');
					const file = path.join('\t');
					// A binary file says '-' for its lines: counted as none, and still classified.
					return { path: file, added: Number(added) || 0, removed: Number(removed) || 0, out: classifyPath(file) };
				});
	const lines = files.reduce((n, f) => n + f.added + f.removed, 0);
	return { state: 'ready', commits, files, lines, large: files.length > LARGE.files || lines > LARGE.lines };
};
