import type { WorkspaceDescriptor } from './descriptor';
import { classify } from './branchProjects';
import type { Problem, SyncResult } from './designSync';
import { branchAuthors, branchCommit, isSamePerson, listBranches, localIdentity, pushBranch, git } from './git';

/**
 * Publishing the person's own work branches, so the design repository never points at a branch that
 * only exists on one machine.
 *
 * It is deliberately narrow. A branch is published only if it is named the way the repository names
 * work (`fd/<project>/iN`, `feature/<project>`), is the person's own (they have commits on it), and,
 * for a `feature/` branch, has a project folder in the design repository, because `feature/<name>` is
 * also how a whole team names its tickets and a teammate's branch is not this person's to publish.
 * Pushes are plain: a branch that has moved on GitHub is reported, never overwritten.
 */

const MAX_BRANCHES = 50;

/** What a run found: which branches it published, which it could not, and every branch that is this person's to publish. */
export interface BranchSyncResult extends SyncResult {
	/** Every branch it considered the person's own work, whether or not it needed publishing. */
	mine: string[];
}

export interface BranchSyncInput {
	root: string;
	descriptor: WorkspaceDescriptor;
	/** Project folders in the design repository: what vouches for a `feature/` branch. */
	projects: ReadonlySet<string>;
}

const prefixOf = (pattern: string): string => pattern.slice(0, pattern.indexOf('<'));

const problem = (what: string, why: string): Problem => ({ what, why });

export const syncBranches = async ({ root, descriptor, projects }: BranchSyncInput): Promise<BranchSyncResult> => {
	const problems: Problem[] = [];
	const published: string[] = [];

	const me = await localIdentity(root);
	const prefixes = [...new Set([descriptor.branchPattern.prototype, descriptor.branchPattern.codebase].map(prefixOf).filter(Boolean))];
	const local = (await Promise.all(prefixes.map((p) => listBranches(root, p)))).flat();

	// Which of them are this person's to publish.
	const mine: string[] = [];
	for (const branch of local.slice(0, MAX_BRANCHES)) {
		const work = classify(descriptor, branch);
		if (!work) continue;
		if (work.name === 'codebase' && !projects.has(work.projectId)) continue;
		const authors = await branchAuthors(root, branch).catch(() => []);
		if (authors.some((a) => isSamePerson(me, a))) mine.push(branch);
	}
	if (mine.length === 0) return { published, problems, mine };

	// What GitHub has of them, in one round trip.
	let remote: Map<string, string>;
	try {
		const out = await git(root, ['ls-remote', '--heads', 'origin', ...prefixes.map((p) => `refs/heads/${p}*`)], { timeoutMs: 60_000 });
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
		const why = err instanceof Error ? err.message.split('\n')[0] : String(err);
		return {
			published,
			mine,
			problems: [
				problem(
					'Work branches',
					`Could not reach GitHub, so ${mine.length === 1 ? 'a branch is' : `${mine.length} branches are`} saved here and will be published when it can: ${why}`,
				),
			],
		};
	}

	for (const branch of mine) {
		const here = await branchCommit(root, branch).catch(() => null);
		if (here === null) continue;
		const there = remote.get(branch);
		if (there === here) continue; // already published, exactly
		if (there !== undefined) {
			// Only a fast-forward goes. If GitHub has commits this machine lacks (or has never seen), it is a conversation, not a push.
			const ahead = await git(root, ['merge-base', '--is-ancestor', there, here]).then(
				() => true,
				() => false,
			);
			if (!ahead) {
				problems.push(
					problem(
						branch,
						'It has changes on GitHub that this machine does not have, so it was not pushed. Bring them in (git pull --rebase on the branch), and it will publish.',
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
