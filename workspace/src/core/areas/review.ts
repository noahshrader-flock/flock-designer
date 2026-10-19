import type { CallsDeps } from '../compose';
import type { CommentRef } from '../../shared/contract';
import { sanitizeAnchor, sanitizePicture } from '../../shared/anchor';
import type { Project, ReviewComment } from '../../shared/contract';
import { classify } from '../services/projects/branchProjects';
import { projectTitle, writeCommentsExport } from '../services/prototypes/commentsExport';
import { readDescriptor } from '../services/projects/descriptor';
import { readWork } from '../services/projects/workRecords';
import { listProjects } from '../services/projects/listProjects';
import { ProfileNames } from '../services/publishing/profileNames';

export const reviewArea = (d: CallsDeps) => {
	const { designRepo, github, opened, publisher, signedInLogin, trustedRecords, trustedRoot } = d;
	const profiles = new ProfileNames((path) => github.api(path));
	/** Best effort: reading comments never fails because a file could not be written; the Address button, which depends on it, is strict. */
	const exportComments = (projectId: string, branch: string, comments: ReviewComment[]): void => {
		try {
			const trusted = trustedRecords();
			if (trusted === null) return;
			const { root, recordsRoot } = trusted;
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
			// The comments themselves were read fine.
		}
	};
	return {
		listProjects: async (): Promise<Project[]> => {
			// The gate, not the discovery list: nothing is read or run in a repository this window has not opened, and one
			// remembered from an earlier window does not count.
			const remembered = trustedRoot();
			const root = remembered !== null && opened.has(remembered) ? remembered : null;
			const projects = await listProjects({ root, login: signedInLogin(), remote: () => designRepo.listProjects() });
			void publisher.publish();
			return profiles.nameEveryone(projects);
		},
		readComments: async (projectId: string, branch: string): Promise<ReviewComment[]> => {
			const comments = await designRepo.threads.readComments(branch);
			exportComments(projectId, branch, comments);
			return comments;
		},
		postComment: (projectId: string, branch: string, body: string, anchor: unknown, picture: unknown): Promise<ReviewComment> =>
			designRepo.threads.postComment(projectId, branch, body, sanitizeAnchor(anchor), sanitizePicture(picture)),
		moveComment: (comment: CommentRef, anchor: unknown): Promise<ReviewComment> => {
			const clean = sanitizeAnchor(anchor);
			if (!clean) throw new Error('That is not a place a pin can be moved to.');
			return designRepo.threads.moveComment(comment, clean);
		},
		deleteComment: async (comment: CommentRef) => {
			await designRepo.threads.deleteComment(comment);
			return null;
		},
		resolveComment: (comment: CommentRef, resolved: boolean): Promise<ReviewComment> => designRepo.threads.setResolved(comment, resolved),
	};
};

export type ReviewArea = ReturnType<typeof reviewArea>;
