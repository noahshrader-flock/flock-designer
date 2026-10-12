/** The agent: whether it can run here, what it is doing, and where its conversation is continued. */

/** Whether Claude Code is here and signed in, so new work can be built. `unknown`: it could not be told, which blocks nothing. */
export type AgentReadiness = { state: 'ready' } | { state: 'missing' } | { state: 'signedOut' } | { state: 'unknown' };

/** The agent's current or last run's recent lines, and which work they were for. */
export interface AgentRecent {
	work: string | null;
	lines: string[];
}

/** Whether VS Code with Claude Code is here, and whether this branch has a conversation to continue in it. */
export interface EditorState {
	editor: boolean;
	session: boolean;
}

/** Where a conversation was continued: VS Code's panel, or a command for a terminal. */
export type ContinuedIn = 'editor' | 'terminal';

export type AgentStatus =
	| { state: 'idle' }
	/**
	 * `work`: which piece of work this run is for, so a screen opened again can tell its own run from another; null when
	 * the run was not started for one. `purpose`: `handoff` for a Handoff, which ends in a report rather than a preview.
	 */
	| { state: 'running'; startedAt: string; work: string | null; purpose: 'handoff' | null }
	| { state: 'finished'; exitCode: number; work: string | null; purpose: 'handoff' | null }
	| { state: 'unavailable'; detail: string };
