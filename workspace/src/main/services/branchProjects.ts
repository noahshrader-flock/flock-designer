import type { Person, Project, ProjectIteration, WorkspaceDescriptor } from '../../shared/contract';
import { mergePeople } from '../../shared/people';
import { newestFirst } from '../../shared/projects';
import { branchCommit, branchStartedAt, listBranches } from './git';
import { peopleOn } from './iterations';

/**
 * Work found in the product repository's own branches.
 *
 * A branch named the way the repository says work branches are named *is* an
 * iteration, whether or not anyone wrote a record for it. So work started by an
 * agent in a terminal, or by hand, appears in the list without a step of its
 * own, and the branch -- not a file that can be forgotten -- is the source of
 * truth. Records add what a branch cannot say (a preview address, a note).
 */

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `fd/<project-id>/i<n>` as a regular expression, built from the repository's own pattern. */
export const patternToRegex = (pattern: string): RegExp =>
	new RegExp(`^${escape(pattern).replace(escape('<project-id>'), '([a-z0-9]+(?:-[a-z0-9]+)*)').replace(escape('<n>'), '(\\d+)')}$`);

/** What to ask git for: everything under the fixed start of each pattern. */
const prefixOf = (pattern: string): string => pattern.slice(0, pattern.indexOf('<'));

export interface BranchIteration {
	projectId: string;
	name: string;
	branch: string;
}

/** Reads a branch name as an iteration, or null if it is not one. */
export const classify = (descriptor: WorkspaceDescriptor, branch: string): BranchIteration | null => {
	const proto = patternToRegex(descriptor.branchPattern.prototype).exec(branch);
	if (proto?.[1]) return { projectId: proto[1], name: `i${proto[2] ?? '1'}`, branch };
	const code = patternToRegex(descriptor.branchPattern.codebase).exec(branch);
	if (code?.[1]) return { projectId: code[1], name: 'codebase', branch };
	return null;
};

/**
 * Reads the repository's branches as work.
 *
 * `known` is the set of project ids the design repository already has a record
 * for. A prototype branch is self-evidently ours -- its pattern carries a
 * project id and a number no other work uses. A codebase branch is not:
 * `feature/<project-id>` is how the whole product team names ticket branches,
 * so `feature/dda-1221` would otherwise arrive as a design project. A codebase
 * branch therefore counts only when a project already vouches for it.
 */
export const readBranchProjects = async (
	productRoot: string,
	descriptor: WorkspaceDescriptor,
	signedInLogin: string | null,
	known: ReadonlySet<string> = new Set(),
): Promise<Project[]> => {
	const prefixes = [...new Set([descriptor.branchPattern.prototype, descriptor.branchPattern.codebase].map(prefixOf).filter(Boolean))];
	const branches = (await Promise.all(prefixes.map((p) => listBranches(productRoot, p)))).flat();

	const iterations = (
		await Promise.all(
			branches.slice(0, 200).map(async (branch) => {
				const it = classify(descriptor, branch);
				if (!it) return null;
				if (it.name === 'codebase' && !known.has(it.projectId)) return null;
				// The same rule the records use, so one person is one person in both.
				const people: Person[] = await peopleOn(productRoot, branch, signedInLogin).catch(() => []);
				const iteration: ProjectIteration = {
					name: it.name,
					branch,
					issueNumber: null,
					openComments: 0,
					previewUrl: null,
					// Found as a branch, with no record to say where its work is.
					route: null,
					commit: await branchCommit(productRoot, branch).catch(() => null),
					contributors: people,
					createdAt: await branchStartedAt(productRoot, branch).catch(() => null),
				};
				return { id: it.projectId, iteration };
			}),
		)
	).filter((x): x is { id: string; iteration: ProjectIteration } => x !== null);

	const byProject = new Map<string, ProjectIteration[]>();
	for (const { id, iteration } of iterations) byProject.set(id, [...(byProject.get(id) ?? []), iteration]);
	return [...byProject].map(([id, its]) => ({
		id,
		title: id,
		records: [],
		iterations: its.sort(newestFirst),
		people: mergePeople(...its.map((i) => i.contributors)),
	}));
};
