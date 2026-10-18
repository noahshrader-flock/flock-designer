/**
 * A hand-over branch read from git (Process changes, PROCESS_CHANGES_PLAN Phase 1), against the commit of the base it was
 * handed over on (`base`) and the base as GitHub has it now (`origin/<baseBranch>`): what Claude Code says it did is never read,
 * only what is on the branch. The diff is from where the branch left the base, so a base fetched since adds nothing of its own.
 */
import type { BranchReview } from '../../../shared/contract';
import { LARGE, classifyPath } from '../../../shared/processChanges';
import { branchTip, git, isAncestor } from '../platform/git';

export const reviewBranch = async (root: string, branch: string, base: string, baseBranch: string): Promise<BranchReview> => {
	const tip = await branchTip(root, branch);
	if (tip === null) return { state: 'missing' };
	// Where it left the base: the newest commit it shares with the base as GitHub has it now, else with the one recorded.
	const upstream = await git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseBranch}`]).catch(() => '');
	const fork = await git(root, ['merge-base', tip, upstream || base]).catch(() => '');
	if (fork === '' || !(await isAncestor(root, base, fork))) return { state: 'off-base' };
	const commits = Number(await git(root, ['rev-list', '--count', `${fork}..${tip}`]));
	if (commits === 0) return { state: 'empty' };
	// Each path as it is, NUL-ended (`-z`): git quotes an unusual one otherwise, which would hide a story from the rules.
	const numstat = await git(root, ['diff', '--numstat', '--no-renames', '-z', fork, tip]);
	const files = numstat
		.split('\0')
		.filter((record) => record !== '')
		.map((record) => {
			const [added = '', removed = '', ...path] = record.split('\t');
			const file = path.join('\t');
			// A binary file says '-' for its lines: counted as none, and still classified.
			return { path: file, added: Number(added) || 0, removed: Number(removed) || 0, out: classifyPath(file) };
		});
	const lines = files.reduce((n, f) => n + f.added + f.removed, 0);
	return { state: 'ready', tip, commits, files, lines, large: files.length > LARGE.files || lines > LARGE.lines };
};
