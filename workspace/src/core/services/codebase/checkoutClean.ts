import { existsSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { git } from '../platform/git';
import { holdsItsDesignSystem } from '../products/productDesignSystem';
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
 * Why the clone at `root` has unfinished work, with what to do, or null: a changed tracked file, a new one (it would be swept
 * into the agent's commit), a merge, rebase, cherry-pick, revert or bisect in progress, or a detached HEAD. `where` names the
 * clone as the words say it ("the design system’s checkout").
 */
export const unfinishedWork = async (root: string, where: string): Promise<string | null> => {
	const why = await unfinishedWhy(root, where);
	return why === null ? null : why + (await sharedCheckoutNote(root));
};

const unfinishedWhy = async (root: string, where: string): Promise<string | null> => {
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

/**
 * Said after a refusal about the checkout at `dir` when its repository is a product holding its own design system, whose
 * component changes and codebase work share that one checkout, so the person sees why it is not as they left it; else ''.
 */
export const sharedCheckoutNote = async (dir: string): Promise<string> => {
	const top = await git(dir, ['rev-parse', '--show-toplevel']).catch(() => null);
	if (top === null || !(await holdsItsDesignSystem(top))) return '';
	return ` ${basename(top)} holds its own design system, so its component changes and its codebase work share this one checkout.`;
};
