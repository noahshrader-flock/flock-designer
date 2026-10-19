import type { Person, Project, ProjectWork } from '../../../shared/contract';
import type { WorkspaceDescriptor } from './descriptor';
import { mergePeople } from '../../../shared/people';
import { branchTip, branchStartedAt, listBranches } from '../platform/git';
import { peopleOn } from './workRecords';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const patternToRegex = (pattern: string): RegExp =>
	new RegExp(`^${escape(pattern).replace(escape('<project-id>'), '([a-z0-9]+(?:-[a-z0-9]+)*)')}$`);

export const prefixOf = (pattern: string): string => pattern.slice(0, pattern.indexOf('<'));

export interface BranchWork {
	projectId: string;
	name: 'codebase';
	branch: string;
}

export const classify = (descriptor: WorkspaceDescriptor, branch: string): BranchWork | null => {
	const code = patternToRegex(descriptor.branchPattern.codebase).exec(branch);
	return code?.[1] ? { projectId: code[1], name: 'codebase', branch } : null;
};

/**
 * Only branches of a project the design repository has (`known`), since `feature/<project-id>` is also how the whole
 * product team names ticket branches.
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

/** A branch counts only when `known` vouches for it, so with the default empty set none does. */
export const readBranchProjects = async (
	productRoot: string,
	descriptor: WorkspaceDescriptor,
	signedInLogin: string | null,
	known: ReadonlySet<string> = new Set(),
): Promise<Project[]> => {
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
				route: null,
				commit: await branchTip(productRoot, branch),
				contributors: people,
				createdAt: await branchStartedAt(productRoot, branch).catch(() => null),
				repository: null,
				pullRequest: null,
				cover: null,
				product: null,
				readyAt: null,
			};
			return { id: projectId, title: projectId, folder: null, records: [], work: [work], people: mergePeople(people) };
		}),
	);
};
