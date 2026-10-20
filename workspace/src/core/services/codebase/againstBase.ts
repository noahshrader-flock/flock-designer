import type { BranchAgainstBase } from '../../../shared/contract';
import { freshTip } from '../platform/fetch';
import { branchTip, commitsAfter, defaultBranch, isSafeBranchName, mergeConflicts } from '../platform/git';

/**
 * `branch` against the latest of the product's default branch (`freshTip`'s commit), the branch engineering merges into: read
 * only, nothing merged, the checkout untouched. Null when that cannot be told here: no default branch is known, the work is
 * on it, or either branch cannot be read.
 */
export const againstBase = async (root: string, branch: string): Promise<BranchAgainstBase | null> => {
	const base = await defaultBranch(root);
	if (base === null || base === branch || !isSafeBranchName(base)) return null;
	const tip = await branchTip(root, branch);
	const latest = await freshTip(root, base).catch(() => null);
	if (tip === null || latest === null) return null;
	const behind = await commitsAfter(root, tip, latest.commit);
	return { branch, base, latest: latest.commit, behind, conflicts: behind > 0 ? await mergeConflicts(root, tip, latest.commit) : [] };
};
