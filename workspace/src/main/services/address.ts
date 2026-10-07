import { AGENT_BUSY } from './agent';
import type { ReviewComment } from '../../shared/contract';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
 * The agent edits the working tree and commits, so the tree must be on this iteration's branch and
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
	iteration: { name: string; branch: string };
	/** The one comment to act on. There is no batch. */
	commentId: number;
}

export class AddressProblem extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AddressProblem';
	}
}

/**
 * The task the agent is given. It names the skill, the file and the branch, all of which this
 * app produced, and **none of what a reviewer wrote**: their words reach the agent only through
 * the file, quoted, under a heading that says they are feedback and not instructions.
 */
/** The skill, relative to the design repository. Shared by every product. */
export const SKILL_FILE = 'skills/address-comments.md';

/** Reads the shared skill from the design repository (`recordsRoot` is its `projects` folder), or null. */
export const readSkill = (recordsRoot: string): string | null => {
	try {
		return readFileSync(join(dirname(recordsRoot), SKILL_FILE), 'utf8');
	} catch {
		return null;
	}
};

/**
 * `only` is the number of the comment to act on -- the number the designer read off its pin. The file
 * still holds every comment, because it is the project's file and its pictures are kept in step with
 * it, so which one to act on is said here rather than by narrowing the file.
 */
export const addressTask = (commentsPath: string, branch: string, skill: string, only: number): string =>
	[
		`Address comment ${only} on this project, and only that one.`,
		`The comments are in ${commentsPath}, written from GitHub a moment ago. Read it first.`,
		`Act on comment ${only} alone. The others are listed for context: leave them, and do not mention them except to say you left them.`,
		`This iteration's branch is ${branch}.`,
		'',
		'Follow these instructions:',
		'',
		skill.trim(),
	].join('\n');

export const prepareAddress = async (
	deps: AddressDeps,
	{ recordsRoot, projectId, iteration, commentId }: AddressTarget,
): Promise<{ task: string; open: number; path: string }> => {
	if (deps.agentRunning()) {
		throw new AddressProblem(AGENT_BUSY);
	}
	// The skill is shared by every product and lives in the design repository, which has to be here anyway
	// (the records are in it). Only an out-of-date copy of that repository can lack it.
	const skill = deps.skill();
	if (skill === null) {
		throw new AddressProblem(
			`The design repository on this machine has no ${SKILL_FILE}, which tells the agent how to act on comments. Update it (git pull) and try again.`,
		);
	}
	const here = await deps.checkout();
	if (here.branch !== iteration.branch) {
		throw new AddressProblem(
			`This machine is on ${here.branch ?? 'no branch'}, not ${iteration.branch}. Open this iteration here first, so its preview and the agent's changes are the same work.`,
		);
	}
	if (!here.clean) {
		throw new AddressProblem(
			`There are uncommitted changes on ${iteration.branch}, and the agent commits its work. Commit them or put them aside first.`,
		);
	}

	// Read now, not earlier: this is what makes the file current.
	const comments = await deps.readComments();
	const input: ExportInput = {
		projectId,
		title: deps.title,
		iteration,
		comments,
		generatedAt: (deps.now ?? (() => new Date()))(),
	};
	// Written even when nothing is open, so the file never keeps listing comments that have since been resolved.
	const written = writeCommentsExport(recordsRoot, input);
	const open = openComments(comments).length;
	if (open === 0) throw new AddressProblem('There are no open comments to address.');

	// The read above is the fresh truth, so this is also where a comment someone resolved or deleted a
	// moment ago is caught, rather than the agent being sent after one that is no longer there.
	const chosen = comments.find((c) => c.id === commentId);
	if (!chosen) throw new AddressProblem('That comment is no longer there. It may have been deleted since this screen was last read.');
	if (chosen.resolved) throw new AddressProblem('That comment has been resolved already, so there is nothing to act on.');
	const number = numberComments(comments).get(commentId);
	if (number === undefined) throw new AddressProblem('That comment could not be numbered, so the agent cannot be told which one to act on.');
	return { task: addressTask(written.path, iteration.branch, skill, number), open: 1, path: written.path };
};
