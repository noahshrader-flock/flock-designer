import type { Person, Prototype, PrototypeWork } from '../../../shared/contract';
import { PROTOTYPE_ID_SLOT, type WorkspaceDescriptor } from '../products/descriptor';
import { mergePeople } from '../../../shared/people';
import { branchTip, branchStartedAt, hasOwnCommits, listBranches } from '../platform/git';
import { peopleOn } from './workRecords';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const patternToRegex = (pattern: string): RegExp =>
	new RegExp(`^${escape(pattern).replace(escape(PROTOTYPE_ID_SLOT), '([a-z0-9]+(?:-[a-z0-9]+)*)')}$`);

export const prefixOf = (pattern: string): string => pattern.slice(0, pattern.indexOf('<'));

export interface BranchWork {
	prototypeId: string;
	name: 'codebase';
	branch: string;
}

export const classify = (descriptor: WorkspaceDescriptor, branch: string): BranchWork | null => {
	const code = patternToRegex(descriptor.branchPattern.codebase).exec(branch);
	return code?.[1] ? { prototypeId: code[1], name: 'codebase', branch } : null;
};

/**
 * Only branches of a prototype the design repository has (`known`), since `feature/<prototype-id>` is also how the whole
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
		return work && known.has(work.prototypeId) ? [work] : [];
	});
};

/**
 * A branch counts only when `known` vouches for it, so with the default empty set none does. `madeFrom` is where a
 * prototype's branch was made, as its record says, so the branch it was made from is not taken for its own.
 */
export const readBranchPrototypes = async (
	productRoot: string,
	descriptor: WorkspaceDescriptor,
	signedInLogin: string | null,
	known: ReadonlySet<string> = new Set(),
	madeFrom: (prototypeId: string) => string | null = () => null,
): Promise<Prototype[]> => {
	const found = await codebaseBranches(productRoot, descriptor, known, 200);
	return Promise.all(
		found.map(async ({ prototypeId, name, branch }): Promise<Prototype> => {
			const from = madeFrom(prototypeId);
			// The same rule the records use, so one person is one person in both.
			const people: Person[] = await peopleOn(productRoot, branch, signedInLogin, from).catch(() => []);
			const work: PrototypeWork = {
				name,
				branch,
				issueNumber: null,
				openComments: 0,
				previewUrl: null,
				route: null,
				commit: await branchTip(productRoot, branch),
				contributors: people,
				createdAt: await branchStartedAt(productRoot, branch, from).catch(() => null),
				repository: null,
				pullRequest: null,
				cover: null,
				product: null,
				readyAt: null,
				begun: await hasOwnCommits(productRoot, branch, from).catch(() => null),
			};
			return { id: prototypeId, title: prototypeId, folder: null, records: [], work: [work], people: mergePeople(people) };
		}),
	);
};
