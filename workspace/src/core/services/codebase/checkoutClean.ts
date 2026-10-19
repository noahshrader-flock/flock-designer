/**
 * Whether the design system's clone can be handed to Claude Code for Process changes: Claude Code
 * works in the person's own checkout, on a branch DSNR names, so it is started only on a checkout with no unfinished work of
 * theirs to mix with its edits. Said in words, with what to do, when it cannot be.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { git } from '../platform/git';

/** What git leaves in its folder while an operation is unfinished, and what the person is in the middle of. */
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
 * and no new file (a new file would be swept into Claude Code's commit), no merge, rebase, cherry-pick, revert or bisect in
 * progress, and on a branch, not a detached HEAD.
 */
export const unfinishedWork = async (root: string): Promise<string | null> => {
	// What the person is in the middle of first: it says more than the files it leaves changed.
	for (const [name, what] of IN_PROGRESS) {
		const path = await git(root, ['rev-parse', '--git-path', name]);
		if (existsSync(isAbsolute(path) ? path : join(root, path)))
			return `The design system’s checkout is in the middle of ${what}. Finish it or abort it first.`;
	}
	// New files counted whatever the clone's own setting says (`status.showUntrackedFiles`).
	const status = await git(root, ['status', '--porcelain', '--untracked-files=normal']);
	if (status !== '') {
		const files = status.split('\n').length;
		return `In the design system’s checkout, ${files === 1 ? '1 file is' : `${files} files are`} changed or new and not committed. Commit or stash them first, so Claude Code’s changes are not mixed with yours.`;
	}
	try {
		await git(root, ['symbolic-ref', '--quiet', 'HEAD']);
	} catch {
		return 'The design system’s checkout is not on a branch (a detached HEAD). Switch to a branch first.';
	}
	return null;
};
