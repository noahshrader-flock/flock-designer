import type { Project } from '../../shared/contract';
import { mergeProjects, unionLocal } from '../../shared/projectList';
import { workKind } from '../../shared/work';
import { readBranchProjects } from './branchProjects';
import { readDescriptor } from './descriptor';
import { recordsRootFor } from './discovery';
import { originUrl } from './git';
import { codebaseBranchFor } from './iterations';
import { readFolderProjects } from './localProjects';
import { parseRemote } from '../../shared/repoRef';

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
	// The checkout's repository on GitHub, for codebase work recorded before records named it.
	let here: { repository: string; branchOf: (projectId: string) => string } | null = null;
	if (root !== null) {
		const recordsRoot = recordsRootFor(root);
		// Every project folder, not only those that record an iteration: the folder is what an agent makes
		// first, and it is what vouches for a `feature/<id>` branch (see readBranchProjects).
		const folders = recordsRoot ? readFolderProjects(recordsRoot) : [];
		const descriptor = readDescriptor(root);
		// The branches are the evidence: work made without the app still shows.
		const branches = await readBranchProjects(root, descriptor, login, new Set(folders.map((p) => p.id))).catch(() => []);
		// A folder with nothing built yet is a notes folder, not work in progress.
		local = unionLocal(folders, branches).filter((p) => p.iterations.length > 0);
		const origin = await originUrl(root);
		const repository = origin === null ? null : parseRemote(origin);
		if (repository) here = { repository, branchOf: (projectId) => codebaseBranchFor(descriptor, projectId) };
	}
	let fromGitHub: Project[] = [];
	try {
		fromGitHub = await remote();
	} catch (err) {
		if (local.length === 0) throw err;
	}
	const merged = mergeProjects(fromGitHub, local);
	if (here === null) return merged;
	const at = here;
	// Work on this checkout's codebase branch for a project is in this checkout's repository.
	return merged.map((p) => ({
		...p,
		iterations: p.iterations.map((it) =>
			workKind(it) === 'codebase' && !it.repository && it.branch === at.branchOf(p.id) ? { ...it, repository: at.repository } : it,
		),
	}));
};
