import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { git } from '../platform/git';
import { capitalize } from '../../../shared/titleCase';

const IN_PROGRESS: [string, string][] = [
	['MERGE_HEAD', 'a merge'],
	['rebase-merge', 'a rebase'],
	['rebase-apply', 'a rebase'],
	['CHERRY_PICK_HEAD', 'a cherry-pick'],
	['REVERT_HEAD', 'a revert'],
	['BISECT_LOG', 'a bisect'],
];

/**
 * Why the clone at `root` has unfinished work, in words, with what to do; or null when it has none: no change to a tracked file
 * and no new file (a new file would be swept into the agent's commit), no merge, rebase, cherry-pick, revert or bisect in
 * progress, and on a branch, not a detached HEAD. `where` names the clone as the words say it ("the design system’s
 * checkout").
 */
export const unfinishedWork = async (root: string, where: string): Promise<string | null> => {
	// What the person is in the middle of first: it says more than the files it leaves changed.
	for (const [name, what] of IN_PROGRESS) {
		const path = await git(root, ['rev-parse', '--git-path', name]);
		if (existsSync(isAbsolute(path) ? path : join(root, path)))
			return `${capitalize(where)} is in the middle of ${what}. Finish it or abort it first.`;
	}
	// New files counted whatever the clone's own setting says (`status.showUntrackedFiles`).
	const status = await git(root, ['status', '--porcelain', '--untracked-files=normal']);
	if (status !== '') {
		const files = status.split('\n').length;
		return `In ${where}, ${files === 1 ? '1 file is' : `${files} files are`} changed or new and not committed. Commit or stash them first, so the agent’s changes are not mixed with yours.`;
	}
	try {
		await git(root, ['symbolic-ref', '--quiet', 'HEAD']);
	} catch {
		return `${capitalize(where)} is not on a branch (a detached HEAD). Switch to a branch first.`;
	}
	return null;
};
