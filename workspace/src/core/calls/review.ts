import { sanitizeAnchor, sanitizePicture } from '../../shared/anchor';
import type { Project, ReviewComment } from '../../shared/contract';
import { arg, handle } from '../handle';
import { classify } from '../services/branchProjects';
import { projectTitle, writeCommentsExport } from '../services/commentsExport';
import { readDescriptor } from '../services/descriptor';
import { readWork } from '../services/workRecords';
import { listProjects } from '../services/listProjects';
import { ProfileNames } from '../services/profileNames';
import type { CallsDeps } from '../calls';

/**
 * The project list, its records, and the review comments kept as GitHub issues.
 */
export const registerReview = (d: CallsDeps): void => {
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
			const name = readWork(recordsRoot, projectId).find((i) => i.branch === branch)?.name ?? classify(readDescriptor(root), branch)?.name;
			if (!name) return;
			writeCommentsExport(recordsRoot, {
				projectId,
				title: projectTitle(recordsRoot, projectId),
				work: { name, branch },
				comments,
				generatedAt: new Date(),
			});
		} catch {
			// Nothing to do: the comments themselves were read fine.
		}
	};

	// Reviewer mode: read through the API, never a checkout.
	// Everything on GitHub plus everything built on this machine. Work made here
	// must appear here, shared or not, so the two are merged; if GitHub cannot be
	// reached, what is local still shows.
	handle('listProjects', [], async (): Promise<Project[]> => {
		// The gate, not the discovery list: nothing is read or run in a repository this window has not opened. One remembered
		// from an earlier window is not one: with no product open here, the list is the design repository's alone.
		const remembered = trustedRoot();
		const root = remembered !== null && opened.has(remembered) ? remembered : null;
		const projects = await listProjects({ root, login: signedInLogin(), remote: () => designRepo.listProjects() });
		// Reading the list is a good moment to make sure what it shows is published.
		void publisher.publish();
		return profiles.nameEveryone(projects);
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
	handle('moveComment', [arg.comment, arg.unknown], (comment, anchor): Promise<ReviewComment> => {
		const clean = sanitizeAnchor(anchor);
		if (!clean) throw new Error('That is not a place a pin can be moved to.');
		return designRepo.threads.moveComment(comment, clean);
	});
	handle('deleteComment', [arg.comment], async (comment) => {
		await designRepo.threads.deleteComment(comment);
		return null;
	});
	handle('resolveComment', [arg.comment, arg.flag], (comment, resolved): Promise<ReviewComment> => designRepo.threads.setResolved(comment, resolved));
};
