import type { Person, Project, ProjectWork } from '../../../shared/contract';
import type { WorkspaceDescriptor } from './descriptor';
import { mergePeople } from '../../../shared/people';
import { branchTip, branchStartedAt, listBranches } from '../platform/git';
import { peopleOn } from './workRecords';

/**
 * Codebase work found in the product repository's branches. A branch named by the repository's pattern *is* that work,
 * record or not, so work started in a terminal or by hand still appears. Records add what a branch cannot say (a
 * preview address, a note).
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
 * This checkout's codebase work branches, the first `most` of them: only those of a project the design repository has
 * (`known`), since `feature/<project-id>` is also how the whole product team names ticket branches.
 */
export const codebaseBranches = async (
	root: string,
	descriptor: WorkspaceDescriptor,
	known: ReadonlySet<string>,
	most: number,
): Promise<BranchWork[]> => {
	const prefix = prefixOf(descriptor.branchPattern.codebase);
	const branches = prefix ? await listBranches(root, prefix) : [];
	return branches.slice(0, most).flatMap((branch) => {
		const work = classify(descriptor, branch);
		return work && known.has(work.projectId) ? [work] : [];
	});
};

/**
 * Reads the repository's branches as codebase work. `known` is the project ids the design repository has: a branch
 * counts only when one vouches for it, or a ticket branch such as `feature/dda-1221` would arrive as a design project.
 */
export const readBranchProjects = async (
	productRoot: string,
	descriptor: WorkspaceDescriptor,
	signedInLogin: string | null,
	known: ReadonlySet<string> = new Set(),
): Promise<Project[]> => {
	// One branch a project: `feature/<project-id>` names each one's codebase work.
	const found = await codebaseBranches(productRoot, descriptor, known, 200);
	return Promise.all(
		found.map(async ({ projectId, name, branch }): Promise<Project> => {
			// The same rule the records use, so one person is one person in both.
			const people: Person[] = await peopleOn(productRoot, branch, signedInLogin).catch(() => []);
			const work: ProjectWork = {
				name,
				branch,
				issueNumber: null,
				openComments: 0,
				previewUrl: null,
				// Found as a branch, with no record to say where its work is.
				route: null,
				commit: await branchTip(productRoot, branch),
				contributors: people,
				createdAt: await branchStartedAt(productRoot, branch).catch(() => null),
				repository: null,
				pullRequest: null,
				cover: null,
				// Found as a branch, with no record to say which product it was made on.
				product: null,
				readyAt: null,
			};
			// Found as a branch: no brief read, so titled by its id, and in no folder until one is.
			return { id: projectId, title: projectId, folder: null, records: [], work: [work], people: mergePeople(people) };
		}),
	);
};
