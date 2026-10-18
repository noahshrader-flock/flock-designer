import type { Project } from '../../shared/contract';
import { mergeProjects, unionLocal } from '../../shared/projectList';
import { workKind } from '../../shared/work';
import { readBranchProjects } from './branchProjects';
import { readDescriptor } from './descriptor';
import { recordsRootFor } from './discovery';
import { branchTip, repositoryOf } from './git';
import { codebaseBranchFor } from './workRecords';
import { readFolderProjects } from './localProjects';

/**
 * The projects the Projects screen lists: GitHub's, and this checkout's (`root`, one the person opened; nothing is read
 * in a repository they have not), as one list. GitHub not answering is no failure while there is something here to
 * show.
 */
export const listProjects = async ({
	root,
	login,
	remote,
}: {
	root: string | null;
	/** Who is signed in, whose branches are theirs. */
	login: string | null;
	remote: () => Promise<Project[]>;
}): Promise<Project[]> => {
	let local: Project[] = [];
	// The checkout open: its repository on GitHub (for codebase work recorded before records named it, null when it has no
	// remote), and each project's codebase branch in it.
	let here: { root: string; repository: string | null; branchOf: (projectId: string) => string } | null = null;
	if (root !== null) {
		const recordsRoot = recordsRootFor(root);
		// Every project folder, not only those that record a piece of work: the folder is what an agent makes
		// first, and it is what vouches for a `feature/<id>` branch (see readBranchProjects).
		const folders = recordsRoot ? readFolderProjects(recordsRoot) : [];
		const descriptor = readDescriptor(root);
		// The branches are the evidence: work made without the app still shows.
		const branches = await readBranchProjects(root, descriptor, login, new Set(folders.map((p) => p.id))).catch(() => []);
		// A folder with nothing built yet is a notes folder, not work in progress.
		local = unionLocal(folders, branches).filter((p) => p.work.length > 0);
		here = { root, repository: await repositoryOf(root), branchOf: (projectId) => codebaseBranchFor(descriptor, projectId) };
	}
	let fromGitHub: Project[] = [];
	try {
		fromGitHub = await remote();
	} catch (err) {
		if (local.length === 0) throw err;
	}
	const merged = mergeProjects(fromGitHub, local);
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
					return {
						...it,
						...(ours && !it.repository && at.repository !== null ? { repository: at.repository } : {}),
						readyAt: it.readyAt !== null && it.readyAt === head ? it.readyAt : null,
					};
				}),
			),
		})),
	);
};
