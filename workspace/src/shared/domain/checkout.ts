/** A repository: one opened, one found, one to clone, and a command running in it. */

/** A repository the designer has opened. */
export interface Checkout {
	/** Absolute path to the repository root. */
	root: string;
	/** Directory name, for display. */
	name: string;
	/** Current branch, or null on a detached HEAD. */
	branch: string | null;
	/** True when the working tree has no uncommitted changes. */
	clean: boolean;
}

/** What was grounded before the agent ran. Shown before anything is generated. */
export interface ContextReceipt {
	checkout: Checkout;
	product: string;
	/** Resolved from the checkout's lockfile — the version a prototype would build against. */
	designSystem: { package: string; resolved: string | null; source: string };
	/** Context files found, relative to the root. */
	contextFiles: string[];
	/** Commands this repository permits. */
	commands: { id: string; label: string }[];
	/** Anything that makes the repository not ready, in the designer's words. */
	problems: string[];
}

export type PreviewStatus =
	| { state: 'stopped' }
	| { state: 'starting'; commandId: string; projectId: string | null }
	/** `projectId` is whose preview this is: every prototype shares one port, so the address alone cannot say. */
	| { state: 'running'; commandId: string; url: string; projectId: string | null }
	| { state: 'failed'; commandId: string; detail: string };

/** A line of output from a running command, for the log surface. */
export interface RunLogLine {
	commandId: string;
	stream: 'stdout' | 'stderr';
	text: string;
}

/** A repository new work could start in. */
export interface Repository {
	/** `owner/repo` on GitHub; a folder name for a clone with no GitHub remote. */
	name: string;
	/** Its clone on this machine, or null when it has none. */
	root: string | null;
}

/**
 * How far a list of repositories reaches: `account`, every one the signed-in person's account can (through their own
 * GitHub command line, signed in as them); `app`, only those DSNR's GitHub App is installed on; `none`, nobody is signed
 * in, so only the clones on this computer. Said, so a repository missing from a short list is never a mystery.
 */
export type RepositoryReach = 'account' | 'app' | 'none';

/** The repositories a picker offers, and how far that list reaches. */
export interface RepositoryList {
	repositories: Repository[];
	reach: RepositoryReach;
}

/** Where a repository would be placed in the clone folder, and whether it can be. */
export type ClonePlace =
	/** Nothing there, or an empty folder: it can be cloned here. */
	| { state: 'free'; path: string }
	/** A clone of this same repository is already there: it is used, not cloned again. */
	| { state: 'cloned'; path: string }
	/** Something else is there. It is never cloned over. */
	| { state: 'taken'; path: string; why: string };

/** What cloning a repository would do, said before it is done. */
export interface ClonePlan {
	/** `owner/repo`, as GitHub names it. */
	repository: string;
	place: ClonePlace;
	/** The place as a person reads it: `~/Documents/GitHub/flock-coke`. */
	where: string;
	/** The design repository, when it is not beside it yet: cloned too, since the work's records go there. */
	design: ClonePlace | null;
}

/** Where a clone has got to: which repository, git's phase ("Receiving objects"), and how far through it. */
export interface CloneProgress {
	repository: string;
	step: string;
	percent: number | null;
}

/** A repository discovery found, which the person has not accepted yet. */
export interface CheckoutSuggestion {
	root: string;
	name: string;
	/** What the repository calls itself, read from its descriptor. */
	product: string;
}
