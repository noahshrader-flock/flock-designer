import { AGENT_BUSY } from './agent';
import { addressTask } from './agentTasks';
import type { CommentRef, ReviewComment } from '../../shared/contract';
import { type ExportInput, writeCommentsExport } from './commentsExport';
import { numberComments, openComments } from '../../shared/comments';

/**
 * Everything that has to be true before the agent is asked to act on comments, in the order it
 * has to be true.
 *
 * The point of doing this in one place, in one click, is that **the agent can never read a stale
 * file**: the comments are read from GitHub now, `comments.md` is written from that read, and only
 * then is the agent started. Whatever a reviewer said a minute ago is in it.
 *
 * The agent edits the working tree and commits, so the tree must be on this work's branch and
 * clean: otherwise its commit would sweep up the designer's own unsaved work, or land on the wrong
 * branch.
 */

export interface AddressDeps {
	readComments(): Promise<ReviewComment[]>;
	checkout(): Promise<{ branch: string | null; clean: boolean }>;
	agentRunning(): boolean;
	/** The shared skill's text, from the design repository, or null if it is not there. */
	skill(): string | null;
	/** For the file's heading. */
	title: string;
	now?: () => Date;
}

export interface AddressTarget {
	recordsRoot: string;
	projectId: string;
	work: { name: string; branch: string };
	/** The one comment to act on. There is no batch. */
	comment: CommentRef;
}

/** The skill, relative to the design repository. Shared by every product. */
export const ADDRESS_SKILL = 'skills/address-comments.md';

/**
 * The number of the one comment to act on, from a read made just now. The fresh read is what catches a comment
 * someone resolved or deleted a moment ago, rather than the agent being sent after one that is no longer there.
 */
export const chooseComment = (comments: ReviewComment[], comment: CommentRef): number => {
	if (openComments(comments).length === 0) throw new Error('There are no open comments to address.');
	const chosen = comments.find((c) => c.thread === comment.thread && c.id === comment.id);
	if (!chosen) throw new Error('That comment is no longer there. It may have been deleted since this screen was last read.');
	if (chosen.resolved) throw new Error('That comment has been resolved already, so there is nothing to act on.');
	const number = numberComments(comments).get(chosen.id);
	if (number === undefined) throw new Error('That comment could not be numbered, so the agent cannot be told which one to act on.');
	return number;
};

export const prepareAddress = async (
	deps: AddressDeps,
	{ recordsRoot, projectId, work, comment }: AddressTarget,
): Promise<{ task: string; path: string }> => {
	if (deps.agentRunning()) {
		throw new Error(AGENT_BUSY);
	}
	// The skill is shared by every product and lives in the design repository, which has to be here anyway
	// (the records are in it). Only an out-of-date copy of that repository can lack it.
	const skill = deps.skill();
	if (skill === null) {
		throw new Error(
			`The design repository on this machine has no ${ADDRESS_SKILL}, which tells the agent how to act on comments. Update it (git pull) and try again.`,
		);
	}
	const here = await deps.checkout();
	if (here.branch !== work.branch) {
		throw new Error(
			`This machine is on ${here.branch ?? 'no branch'}, not ${work.branch}. Open this work here first, so its preview and the agent's changes are the same work.`,
		);
	}
	if (!here.clean) {
		throw new Error(`There are uncommitted changes on ${work.branch}, and the agent commits its work. Commit them or put them aside first.`);
	}

	// Read now, not earlier: this is what makes the file current.
	const comments = await deps.readComments();
	const input: ExportInput = {
		projectId,
		title: deps.title,
		work,
		comments,
		generatedAt: (deps.now ?? (() => new Date()))(),
	};
	// Written even when nothing is open, so the file never keeps listing comments that have since been resolved.
	const written = writeCommentsExport(recordsRoot, input);
	const number = chooseComment(comments, comment);
	return { task: addressTask(written.path, work.branch, skill, number), path: written.path };
};
