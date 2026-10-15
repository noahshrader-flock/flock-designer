/** A repository the person opened, and a command running in it. */

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
