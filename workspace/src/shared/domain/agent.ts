/** `unknown`: it could not be told, which blocks nothing. */
export type AgentReadiness = { state: 'ready' } | { state: 'missing' } | { state: 'signedOut' } | { state: 'unknown' };

export interface AgentRecent {
	work: string | null;
	lines: string[];
}

/** `editor`: VS Code with Claude Code is here; `session`: this branch has a conversation to continue in it. */
export interface EditorState {
	editor: boolean;
	session: boolean;
}

export type ContinuedIn = 'editor' | 'terminal';

export type AgentStatus =
	| { state: 'idle' }
	/**
	 * `work`: which piece of work this run is for, so a screen opened again can tell its own run from another; null when
	 * started for none.
	 */
	| { state: 'running'; startedAt: string; work: string | null }
	| { state: 'finished'; exitCode: number; work: string | null }
	| { state: 'unavailable'; detail: string };
