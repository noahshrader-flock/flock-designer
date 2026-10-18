import type { Person, Project, ProjectWork } from '../../shared/contract';
import type { WorkspaceDescriptor } from './descriptor';
import { mergePeople } from '../../shared/people';
import { workOrder } from '../../shared/projectList';
import { branchCommit, branchStartedAt, listBranches } from './git';
import { peopleOn } from './workRecords';

/**
 * Codebase work found in the product repository's own branches.
 *
 * A branch named the way the repository says codebase work is named *is* that work, whether or not anyone wrote a record
 * for it. So work started by an agent in a terminal, or by hand, appears in the list without a step of its own, and the
 * branch, not a file that can be forgotten, is the source of truth. Records add what a branch cannot say (a preview
 * address, a note).
 */

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `feature/<project-id>` as a regular expression, built from the repository's own pattern. */
export const patternToRegex = (pattern: string): RegExp =>
	new RegExp(`^${escape(pattern).replace(escape('<project-id>'), '([a-z0-9]+(?:-[a-z0-9]+)*)')}$`);

/** What to ask git for: everything under the fixed start of the pattern. */
export const prefixOf = (pattern: string): string => pattern.slice(0, pattern.indexOf('<'));

export interface BranchWork {
	projectId: string;
	name: 'codebase';
	branch: string;
}

/** Reads a branch name as a project's codebase work, or null if it is not. */
export const classify = (descriptor: WorkspaceDescriptor, branch: string): BranchWork | null => {
	const code = patternToRegex(descriptor.branchPattern.codebase).exec(branch);
	return code?.[1] ? { projectId: code[1], name: 'codebase', branch } : null;
};

/**
 * Reads the repository's branches as codebase work.
 *
 * `known` is the set of project ids the design repository already has a record for. `feature/<project-id>` is how the
 * whole product team names ticket branches, so `feature/dda-1221` would otherwise arrive as a design project: a branch
 * counts only when a project already vouches for it.
 */
export const readBranchProjects = async (
	productRoot: string,
	descriptor: WorkspaceDescriptor,
	signedInLogin: string | null,
	known: ReadonlySet<string> = new Set(),
): Promise<Project[]> => {
	const prefix = prefixOf(descriptor.branchPattern.codebase);
	const branches = prefix ? await listBranches(productRoot, prefix) : [];

	const work = (
		await Promise.all(
			branches.slice(0, 200).map(async (branch) => {
				const it = classify(descriptor, branch);
				if (!it) return null;
				if (!known.has(it.projectId)) return null;
				// The same rule the records use, so one person is one person in both.
				const people: Person[] = await peopleOn(productRoot, branch, signedInLogin).catch(() => []);
				const iteration: ProjectWork = {
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
					repository: null,
					pullRequest: null,
					cover: null,
					// Found as a branch, with no record to say which product it was made on.
					product: null,
					readyAt: null,
				};
				return { id: it.projectId, iteration };
			}),
		)
	).filter((x): x is { id: string; iteration: ProjectWork } => x !== null);

	const byProject = new Map<string, ProjectWork[]>();
	for (const { id, iteration } of work) byProject.set(id, [...(byProject.get(id) ?? []), iteration]);
	return [...byProject].map(([id, its]) => ({
		id,
		title: id,
		// Found as branches: no brief read, so in no folder until one is.
		folder: null,
		records: [],
		work: its.sort(workOrder),
		people: mergePeople(...its.map((i) => i.contributors)),
	}));
};
