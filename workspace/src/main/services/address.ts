import type { ReviewComment } from '../../shared/contract';
import { type ExportInput, writeCommentsExport } from './commentsExport';

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
	/** Whether the checkout has the skill the task tells the agent to follow. */
	skillPresent(): boolean;
	/** For the file's heading. */
	title: string;
	now?: () => Date;
}

export interface AddressTarget {
	recordsRoot: string;
	projectId: string;
	iteration: { name: string; branch: string };
	/** The skill's path in the checkout, from `skillFor`. */
	skill: string;
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
/** Where the skill lives, relative to the product checkout: in the folder the repository's descriptor names for its agent context. */
export const skillFor = (contextDir: string): string => `${contextDir}/skills/address-comments.md`;

export const addressTask = (commentsPath: string, branch: string, skill: string): string =>
	[
		`Address the open comments on this project. Follow ${skill}.`,
		`The comments are in ${commentsPath}, written from GitHub a moment ago. Read it first.`,
		`This iteration's branch is ${branch}.`,
	].join('\n');

export const prepareAddress = async (
	deps: AddressDeps,
	{ recordsRoot, projectId, iteration, skill }: AddressTarget,
): Promise<{ task: string; open: number; path: string }> => {
	if (deps.agentRunning()) {
		throw new AddressProblem('The agent is already working. Wait for it to finish, then try again.');
	}
	// The task names a skill file. A branch cut before the skill existed does not have it, and an agent
	// told to follow a file that is not there would do something else with the comments.
	if (!deps.skillPresent()) {
		throw new AddressProblem(
			`This checkout does not have ${skill}, which tells the agent how to act on comments. Rebase this iteration onto the product's design baseline (the branch its iterations are cut from), which has it.`,
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
	const open = comments.filter((c) => !c.resolved).length;
	if (open === 0) throw new AddressProblem('There are no open comments to address.');
	return { task: addressTask(written.path, iteration.branch, skill), open, path: written.path };
};
