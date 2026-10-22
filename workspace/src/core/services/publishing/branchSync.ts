import type { WorkspaceDescriptor } from '../products/descriptor';
import { codebaseBranches, prefixOf } from '../prototypes/branchPrototypes';
import type { Problem, SyncResult } from './designSync';
import { branchAuthors, branchTip, isSamePerson, localIdentity, pushBranch, git, isAncestor } from '../platform/git';
import { errorText } from '../../../shared/result';
import { HOST } from '../../../shared/vocabulary';

/**
 * Only a `feature/<prototype>` branch with a prototype folder, and with commits of the person's that are its own, not those of
 * the branch it was made from, as a team's tickets use the same names. Pushes are plain: a branch that has moved on GitHub is reported, never overwritten.
 */

const MAX_BRANCHES = 50;

export interface BranchSyncResult extends SyncResult {
	/** Whether or not each needed publishing. */
	mine: string[];
}

export interface BranchSyncInput {
	root: string;
	descriptor: WorkspaceDescriptor;
	/** Prototype folders in the design repository: what vouches for a `feature/` branch. */
	prototypes: ReadonlySet<string>;
	/** Where a prototype's branch was made, as its record says: commits before it are the branch it was made from's, not its own. */
	madeFrom?: (prototypeId: string) => string | null;
}

const problem = (what: string, why: string): Problem => ({ what, why });

export const syncBranches = async ({ root, descriptor, prototypes, madeFrom = () => null }: BranchSyncInput): Promise<BranchSyncResult> => {
	const problems: Problem[] = [];
	const published: string[] = [];

	const me = await localIdentity(root);

	const mine: string[] = [];
	for (const { prototypeId, branch } of await codebaseBranches(root, descriptor, prototypes, MAX_BRANCHES)) {
		const authors = await branchAuthors(root, branch, madeFrom(prototypeId)).catch(() => []);
		if (authors.some((a) => isSamePerson(me, a))) mine.push(branch);
	}
	if (mine.length === 0) return { published, problems, mine };

	let remote: Map<string, string>;
	try {
		const out = await git(root, ['ls-remote', '--heads', 'origin', `refs/heads/${prefixOf(descriptor.branchPattern.codebase)}*`]);
		remote = new Map(
			out
				.split('\n')
				.filter(Boolean)
				.map((l) => {
					const [sha = '', ref = ''] = l.split('\t');
					return [ref.replace(/^refs\/heads\//, ''), sha] as const;
				}),
		);
	} catch (err) {
		const why = errorText(err, { firstLine: true });
		return {
			published,
			mine,
			problems: [
				problem(
					'Work branches',
					`Could not reach ${HOST}, so ${mine.length === 1 ? 'a branch is' : `${mine.length} branches are`} saved here and will be published when it can: ${why}`,
				),
			],
		};
	}

	for (const branch of mine) {
		const here = await branchTip(root, branch);
		if (here === null) continue;
		const there = remote.get(branch);
		if (there === here) continue;
		if (there !== undefined) {
			// Only a fast-forward goes. If GitHub has commits this machine lacks (or has never seen), it is a conversation, not a push.
			const ahead = await isAncestor(root, there, here);
			if (!ahead) {
				problems.push(
					problem(
						branch,
						`It has changes on ${HOST} that this machine does not have, so it was not pushed. Bring them in (git pull --rebase on the branch), and it will publish.`,
					),
				);
				continue;
			}
		}
		try {
			await pushBranch(root, branch);
			published.push(branch);
		} catch (err) {
			const why = err instanceof Error ? err.message.split('\n').slice(0, 2).join(' ') : String(err);
			problems.push(problem(branch, `Could not publish it: ${why}`));
		}
	}
	return { published, problems, mine };
};
