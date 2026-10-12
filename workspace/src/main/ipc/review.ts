import { sanitizeAnchor, sanitizePicture } from '../../shared/anchor';
import { shownRecord } from '../../shared/brief';
import type { Project, ReviewComment } from '../../shared/contract';
import { mergeProjects, unionLocal } from '../../shared/projectList';
import { isCommit } from '../../shared/sha';
import { isRecordName } from '../../shared/validate';
import { workKind } from '../../shared/work';
import { arg, handle } from '../handle';
import { readBranchProjects } from '../services/branchProjects';
import { readDescriptor } from '../services/descriptor';
import { recordsRootFor } from '../services/discovery';
import { originUrl } from '../services/git';
import { codebaseBranchFor } from '../services/iterations';
import { readFolderProjects } from '../services/localProjects';
import { resolveInside } from '../services/paths';
import { gitHubRepoOf } from '../services/repositories';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IpcDeps } from '../ipc';

/**
 * The project list, its records, and the review comments kept as GitHub issues.
 */
export const registerReview = (d: IpcDeps): void => {
	const { MAX_RECORD, designRepo, exportComments, github, opened, profiles, publisher, trustedRoot } = d;

	// Reviewer mode: read through the API, never a checkout.
	// Everything on GitHub plus everything built on this machine. Work made here
	// must appear here, shared or not, so the two are merged; if GitHub cannot be
	// reached, what is local still shows.
	handle('listProjects', [], async (): Promise<Project[]> => {
		// The gate, not the discovery list: nothing is read or run in a repository
		// this person has not accepted.
		const root = trustedRoot();
		const me = github.state();
		const login = me.state === 'signedIn' ? me.user.login : null;
		let local: Project[] = [];
		// The checkout's repository on GitHub, for codebase work recorded before records named it.
		let here: { repository: string; branchOf: (projectId: string) => string } | null = null;
		if (root !== null) {
			opened.require(root);
			const recordsRoot = recordsRootFor(root);
			// Every project folder, not only those that record an iteration: the folder is what an agent makes
			// first, and it is what vouches for a `feature/<id>` branch (see readBranchProjects).
			const folders = recordsRoot ? readFolderProjects(recordsRoot) : [];
			// The branches are the evidence: work made without the app still shows.
			const branches = await readBranchProjects(root, readDescriptor(root), login, new Set(folders.map((p) => p.id))).catch(() => []);
			// A folder with nothing built yet is a notes folder, not work in progress.
			local = unionLocal(folders, branches).filter((p) => p.iterations.length > 0);
			const origin = await originUrl(root);
			const repository = origin === null ? null : gitHubRepoOf(origin);
			const descriptor = readDescriptor(root);
			if (repository) here = { repository, branchOf: (projectId) => codebaseBranchFor(descriptor, projectId) };
		}
		let remote: Project[] = [];
		try {
			remote = await designRepo.listProjects();
		} catch (err) {
			if (local.length === 0) throw err;
		}
		// Reading the list is a good moment to make sure what it shows is published.
		void publisher.publish();
		const merged = mergeProjects(remote, local);
		// Work on this checkout's codebase branch for a project is in this checkout's repository.
		const located =
			here === null
				? merged
				: merged.map((p) => ({
						...p,
						iterations: p.iterations.map((it) =>
							workKind(it) === 'codebase' && !it.repository && it.branch === here.branchOf(p.id) ? { ...it, repository: here.repository } : it,
						),
					}));
		return profiles.nameEveryone(located);
	});
	handle('readRecord', [arg.name, arg.name], async (projectId, name): Promise<string> => {
		if (!isRecordName(projectId) || !isRecordName(name)) throw new Error('That is not a file in a project.');
		// This machine's copy first: it is the one being written, and may not be published yet.
		const root = trustedRoot();
		const recordsRoot = root === null ? null : recordsRootFor(root);
		const path = recordsRoot === null ? null : resolveInside(recordsRoot, join(projectId, name));
		const text =
			path !== null && existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : await designRepo.readRecord(projectId, name);
		// The brief without its front matter (its folder), which is the app's and not the person's to read.
		return shownRecord(name, text).slice(0, MAX_RECORD);
	});
	handle('readComments', [arg.projectId, arg.branch], async (projectId, branch): Promise<ReviewComment[]> => {
		const comments = await designRepo.readComments(branch);
		exportComments(projectId, branch, comments);
		return comments;
	});
	handle(
		'postComment',
		[arg.projectId, arg.branch, arg.words, arg.unknown, arg.unknown],
		(projectId, branch, body, anchor, picture): Promise<ReviewComment> =>
			designRepo.postComment(projectId, branch, body, sanitizeAnchor(anchor), sanitizePicture(picture)),
	);
	handle('moveComment', [arg.commentId, arg.unknown], (commentId, anchor): Promise<ReviewComment> => {
		const clean = sanitizeAnchor(anchor);
		if (!clean) throw new Error('That is not a place a pin can be moved to.');
		return designRepo.moveComment(commentId, clean);
	});
	handle('deleteComment', [arg.commentId], async (commentId) => {
		await designRepo.deleteComment(commentId);
		return null;
	});
	handle('resolveComment', [arg.commentId, arg.flag], (commentId, resolved): Promise<ReviewComment> => {
		return designRepo.setResolved(commentId, resolved === true);
	});
	handle('markAddressed', [arg.commentId, arg.unknown], (commentId, commit): Promise<ReviewComment> => {
		// A commit, or nothing. Anything else is not written into a comment body.
		const sha = isCommit(commit) ? commit : null;
		return designRepo.setAddressed(commentId, sha);
	});
};
