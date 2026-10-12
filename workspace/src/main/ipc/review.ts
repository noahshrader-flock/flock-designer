import { sanitizeAnchor, sanitizePicture } from '../../shared/anchor';
import { shownRecord } from '../../shared/brief';
import type { Project, ReviewComment } from '../../shared/contract';
import { isCommit } from '../../shared/sha';
import { isRecordName } from '../../shared/validate';
import { arg, handle } from '../handle';
import { recordsRootFor } from '../services/discovery';
import { resolveInside } from '../services/paths';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IpcDeps } from '../ipc';
import { listProjects } from '../services/listProjects';

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
		// The gate, not the discovery list: nothing is read or run in a repository this person has not accepted.
		const root = trustedRoot();
		if (root !== null) opened.require(root);
		const me = github.state();
		const projects = await listProjects({
			root,
			login: me.state === 'signedIn' ? me.user.login : null,
			remote: () => designRepo.listProjects(),
		});
		// Reading the list is a good moment to make sure what it shows is published.
		void publisher.publish();
		return profiles.nameEveryone(projects);
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
