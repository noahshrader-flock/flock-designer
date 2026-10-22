import type { Prototype } from '../../../shared/contract';
import { mergePrototypes, unionLocal } from '../../../shared/prototypeList';
import { workKind } from '../../../shared/work';
import { readBranchPrototypes } from './branchPrototypes';
import { readDescriptor } from '../products/descriptor';
import { branchTip, hasOwnCommits, repositoryOf } from '../platform/git';
import { codebaseBranchFor, codebaseMadeFrom } from './workRecords';
import { readFolderPrototypes, withStartedHere } from './localPrototypes';

/**
 * `root` must be one the person opened. GitHub not answering is no failure while there is something local to show.
 */
export const listPrototypes = async ({
	root,
	login,
	remote,
	recordsRootOf,
	prototypesRoot,
}: {
	root: string | null;
	login: string | null;
	remote: () => Promise<Prototype[]>;
	/** The product's design repository's records, as `recordsRootFor` finds them. */
	recordsRootOf: (productRoot: string) => string | null;
	/** Where this machine keeps what it builds, and its starts not saved yet. */
	prototypesRoot: string;
}): Promise<Prototype[]> => {
	let local: Prototype[] = [];
	// `repository` fills in codebase work recorded before records named it; null when the checkout has no remote.
	let here: {
		root: string;
		repository: string | null;
		branchOf: (prototypeId: string) => string;
		madeFrom: (prototypeId: string) => string | null;
	} | null = null;
	if (root !== null) {
		const recordsRoot = recordsRootOf(root);
		// Every prototype folder, not only those that record a piece of work: the folder is what an agent makes
		// first, and it is what vouches for a `feature/<id>` branch (see readBranchPrototypes).
		const folders = withStartedHere(recordsRoot ? readFolderPrototypes(recordsRoot) : [], prototypesRoot);
		const descriptor = readDescriptor(root);
		// The branches are the evidence: work made without the app still shows.
		const madeFrom = (prototypeId: string) => (recordsRoot ? codebaseMadeFrom(recordsRoot, prototypeId) : null);
		const branches = await readBranchPrototypes(root, descriptor, login, new Set(folders.map((p) => p.id)), madeFrom).catch(() => []);
		// A folder with nothing built yet is a notes folder, not work in progress.
		local = unionLocal(folders, branches).filter((p) => p.work.length > 0);
		here = { root, repository: await repositoryOf(root), branchOf: (prototypeId) => codebaseBranchFor(descriptor, prototypeId), madeFrom };
	}
	let fromGitHub: Prototype[] = [];
	try {
		fromGitHub = await remote();
	} catch (err) {
		if (local.length === 0) throw err;
	}
	const merged = mergePrototypes(fromGitHub, local);
	const at = here;
	// Work on this checkout's codebase branch is in this checkout's repository; and ready for engineering only while its
	// branch is still at the commit a handoff found it ready at, here. Anywhere else that cannot be known, so it is not said.
	return Promise.all(
		merged.map(async (p) => ({
			...p,
			work: await Promise.all(
				p.work.map(async (it) => {
					if (workKind(it) !== 'codebase') return it;
					const ours = at !== null && it.branch === at.branchOf(p.id);
					const head = ours && it.readyAt ? await branchTip(at.root, it.branch) : null;
					const begun = ours ? await hasOwnCommits(at.root, it.branch, at.madeFrom(p.id)).catch(() => null) : null;
					return {
						...it,
						begun: begun ?? it.begun,
						...(ours && !it.repository && at.repository !== null ? { repository: at.repository } : {}),
						readyAt: it.readyAt !== null && it.readyAt === head ? it.readyAt : null,
					};
				}),
			),
		})),
	);
};
