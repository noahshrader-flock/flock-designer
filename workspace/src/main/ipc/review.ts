import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeAnchor, sanitizePicture } from '../../shared/anchor';
import { shownRecord } from '../../shared/brief';
import type { Project, ReviewComment } from '../../shared/contract';
import { isCommit } from '../../shared/sha';
import { isRecordName } from '../../shared/validate';
import { arg, handle } from '../handle';
import { classify } from '../services/branchProjects';
import { projectTitle, writeCommentsExport } from '../services/commentsExport';
import { readDescriptor } from '../services/descriptor';
import { readIterations } from '../services/iterations';
import { listProjects } from '../services/listProjects';
import { resolveInside } from '../services/paths';
import { ProfileNames } from '../services/profileNames';
import type { IpcDeps } from '../ipc';

/**
 * The project list, its records, and the review comments kept as GitHub issues.
 */
export const registerReview = (d: IpcDeps): void => {
	const { designRepo, github, opened, publisher, signedInLogin, trustedRecords, trustedRoot } = d;

	/** Names people by their GitHub profile, once each, so a person is the same name wherever they appear. */
	const profiles = new ProfileNames((path) => github.api(path));
	/**
	 * Rewrites `comments.md` for what was just read, on a machine that has the design repository
	 * beside the product checkout. Best effort: reading comments never fails because a file
	 * could not be written; the Address button, which depends on the file, is strict.
	 */
	const exportComments = (projectId: string, branch: string, comments: ReviewComment[]): void => {
		try {
			const trusted = trustedRecords();
			if (trusted === null) return;
			const { root, recordsRoot } = trusted;
			// The record's name for it, or the one the branch's own name gives it (work with no record yet).
			const name = readIterations(recordsRoot, projectId).find((i) => i.branch === branch)?.name ?? classify(readDescriptor(root), branch)?.name;
			if (!name) return;
			writeCommentsExport(recordsRoot, {
				projectId,
				title: projectTitle(recordsRoot, projectId),
				iteration: { name, branch },
				comments,
				generatedAt: new Date(),
			});
		} catch {
			// Nothing to do: the comments themselves were read fine.
		}
	};
	/** A record is text a person reads; anything larger than this is not one, and is cut rather than sent whole. */
	const MAX_RECORD = 400_000;

	// Reviewer mode: read through the API, never a checkout.
	// Everything on GitHub plus everything built on this machine. Work made here
	// must appear here, shared or not, so the two are merged; if GitHub cannot be
	// reached, what is local still shows.
	handle('listProjects', [], async (): Promise<Project[]> => {
		// The gate, not the discovery list: nothing is read or run in a repository this person has not accepted.
		const root = trustedRoot();
		if (root !== null) opened.require(root);
		const projects = await listProjects({ root, login: signedInLogin(), remote: () => designRepo.listProjects() });
		// Reading the list is a good moment to make sure what it shows is published.
		void publisher.publish();
		return profiles.nameEveryone(projects);
	});
	handle('readRecord', [arg.name, arg.name], async (projectId, name): Promise<string> => {
		if (!isRecordName(projectId) || !isRecordName(name)) throw new Error('That is not a file in a project.');
		// This machine's copy first: it is the one being written, and may not be published yet.
		const recordsRoot = trustedRecords()?.recordsRoot ?? null;
		const path = recordsRoot === null ? null : resolveInside(recordsRoot, join(projectId, name));
		const text =
			path !== null && existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : await designRepo.readRecord(projectId, name);
		// The brief without its front matter (its folder), which is the app's and not the person's to read.
		return shownRecord(name, text).slice(0, MAX_RECORD);
	});
	handle('readComments', [arg.projectId, arg.branch], async (projectId, branch): Promise<ReviewComment[]> => {
		const comments = await designRepo.threads.readComments(branch);
		exportComments(projectId, branch, comments);
		return comments;
	});
	handle(
		'postComment',
		[arg.projectId, arg.branch, arg.words, arg.unknown, arg.unknown],
		(projectId, branch, body, anchor, picture): Promise<ReviewComment> =>
			designRepo.threads.postComment(projectId, branch, body, sanitizeAnchor(anchor), sanitizePicture(picture)),
	);
	handle('moveComment', [arg.commentId, arg.unknown], (commentId, anchor): Promise<ReviewComment> => {
		const clean = sanitizeAnchor(anchor);
		if (!clean) throw new Error('That is not a place a pin can be moved to.');
		return designRepo.threads.moveComment(commentId, clean);
	});
	handle('deleteComment', [arg.commentId], async (commentId) => {
		await designRepo.threads.deleteComment(commentId);
		return null;
	});
	handle('resolveComment', [arg.commentId, arg.flag], (commentId, resolved): Promise<ReviewComment> =>
		designRepo.threads.setResolved(commentId, resolved),
	);
	handle('markAddressed', [arg.commentId, arg.unknown], (commentId, commit): Promise<ReviewComment> => {
		// A commit, or nothing. Anything else is not written into a comment body.
		const sha = isCommit(commit) ? commit : null;
		return designRepo.threads.setAddressed(commentId, sha);
	});
};
