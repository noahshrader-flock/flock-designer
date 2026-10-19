export interface Checkout {
	/** Absolute. */
	root: string;
	name: string;
	/** Current branch, or null on a detached HEAD. */
	branch: string | null;
	clean: boolean;
}

export type PreviewStatus =
	| { state: 'stopped' }
	| { state: 'starting'; commandId: string; projectId: string | null }
	/** `projectId` is whose preview this is: every prototype shares one port, so the address alone cannot say. */
	| { state: 'running'; commandId: string; url: string; projectId: string | null }
	| { state: 'failed'; commandId: string; detail: string };

export interface RunLogLine {
	commandId: string;
	stream: 'stdout' | 'stderr';
	text: string;
}
