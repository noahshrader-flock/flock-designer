import type { CallsDeps } from '../compose';
import type { CommentRef } from '../../shared/contract';
import { sanitizeAnchor, sanitizePicture } from '../../shared/anchor';
import type { Prototype, ReviewComment } from '../../shared/contract';
import { classify } from '../services/prototypes/branchPrototypes';
import { prototypeTitle, writeCommentsExport } from '../services/prototypes/commentsExport';
import { readDescriptor } from '../services/products/descriptor';
import { readWork } from '../services/prototypes/workRecords';
import { listPrototypes } from '../services/prototypes/listPrototypes';
import { pendingHere } from '../services/prototypes/pendingPrototypes';
import { ProfileNames } from '../services/publishing/profileNames';

export const reviewArea = (d: CallsDeps) => {
	const { designRepos, github, opened, prototypesRoot, publisher, recordsRootOf, saveBuilt, signedInLogin, trustedRecords, trustedRoot } = d;
	const profiles = new ProfileNames((path) => github.api(path));
	/** Best effort: reading comments never fails because a file could not be written; the Address button, which depends on it, is strict. */
	const exportComments = (prototypeId: string, branch: string, comments: ReviewComment[]): void => {
		try {
			const trusted = trustedRecords();
			if (trusted === null) return;
			const { root, recordsRoot } = trusted;
			const name = readWork(recordsRoot, prototypeId).find((i) => i.branch === branch)?.name ?? classify(readDescriptor(root), branch)?.name;
			if (!name) return;
			writeCommentsExport(recordsRoot, {
				prototypeId,
				title: prototypeTitle(recordsRoot, prototypeId),
				work: { name, branch },
				comments,
				generatedAt: new Date(),
			});
		} catch {
			// The comments themselves were read fine.
		}
	};
	return {
		listPrototypes: async (): Promise<Prototype[]> => {
			// The gate, not the discovery list: nothing is read or run in a repository this window has not opened, and one
			// remembered from an earlier window does not count.
			const remembered = trustedRoot();
			const root = remembered !== null && opened.has(remembered) ? remembered : null;
			// A start built here and never saved (its watcher gone with its window) is saved now, as opening a page saves it.
			if (root !== null) for (const r of pendingHere(prototypesRoot)) await saveBuilt(r.prototypeId, r.name, null).catch(() => 'waiting');
			const prototypes = await listPrototypes({
				root,
				login: signedInLogin(),
				remote: () => designRepos.now().listPrototypes(),
				recordsRootOf,
				prototypesRoot,
			});
			void publisher.publish();
			return profiles.nameEveryone(prototypes);
		},
		readComments: async (prototypeId: string, branch: string): Promise<ReviewComment[]> => {
			const comments = await designRepos.now().threads.readComments(branch);
			exportComments(prototypeId, branch, comments);
			return comments;
		},
		postComment: (prototypeId: string, branch: string, body: string, anchor: unknown, picture: unknown): Promise<ReviewComment> =>
			designRepos.now().threads.postComment(prototypeId, branch, body, sanitizeAnchor(anchor), sanitizePicture(picture)),
		moveComment: (comment: CommentRef, anchor: unknown): Promise<ReviewComment> => {
			const clean = sanitizeAnchor(anchor);
			if (!clean) throw new Error('That is not a place a pin can be moved to.');
			return designRepos.now().threads.moveComment(comment, clean);
		},
		deleteComment: async (comment: CommentRef) => {
			await designRepos.now().threads.deleteComment(comment);
			return null;
		},
		resolveComment: (comment: CommentRef, resolved: boolean): Promise<ReviewComment> => designRepos.now().threads.setResolved(comment, resolved),
	};
};

export type ReviewArea = ReturnType<typeof reviewArea>;
