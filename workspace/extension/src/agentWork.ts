import type { WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';

/**
 * Work that takes a while, in VS Code's notification: `title`, then what `task` says as it goes; `onStop` when the person
 * presses its Stop, which it has only when it can be stopped.
 */
export type Progress = (title: string, task: (say: (message: string) => void) => Promise<void>, onStop?: () => void) => Promise<void>;

/** Where the agent's log is: started afresh, and shown, for a piece of work, then a line at a time. */
export interface AgentLogLike {
	start: (title: string) => void;
	line: (text: string) => void;
}

/** Says how something went, in VS Code's notification, without waiting on anyone. */
export type Tell = (message: string) => void;
/** Says how something went (or, as a warning, what stands in the way) with what can be done next: the action pressed, or undefined. */
export type Offer = (message: string, actions: string[]) => Promise<string | undefined>;

export interface AgentWorkDeps {
	api: Pick<WorkspaceApi, 'agentReadiness' | 'stopAgent' | 'onAgentLog'>;
	progress: Progress;
	log: AgentLogLike;
	/** How often the agent is asked how it is getting on (a test's is 0). */
	pollMs?: number;
}

/** Claude Code does the work: said when it is not here, or not signed in, before anything is started. */
export const agentReady = async (api: Pick<WorkspaceApi, 'agentReadiness'>): Promise<void> => {
	const { state } = valueOf(await api.agentReadiness());
	if (state === 'missing')
		throw new Error(
			'Claude Code is not installed. New work is built by Claude Code on this machine: install it from claude.com/claude-code, sign in, then start again.',
		);
	if (state === 'signedOut')
		throw new Error('Claude Code is not signed in. Sign in in the Claude Code panel, or by running claude in a terminal, then start again.');
};

/**
 * The agent at work, as VS Code shows it, the same for a build and for Address: its log started (`logTitle`) and fed as
 * it runs, a notification (`title`) saying how it is going, and Stop, which stops the agent. `work` is told to go on only
 * while nobody has stopped it. Says whether it was stopped.
 */
export const agentWork = async (
	{ api, progress, log }: AgentWorkDeps,
	{ title, logTitle }: { title: string; logTitle: string },
	work: (say: (message: string) => void, isLive: () => boolean) => Promise<void>,
): Promise<{ stopped: boolean }> => {
	let stopped = false;
	log.start(logTitle);
	const listening = api.onAgentLog((l) => log.line(l.text.replace(/\n$/, '')));
	try {
		await progress(
			title,
			(say) => work(say, () => !stopped),
			() => {
				stopped = true;
				void api.stopAgent();
			},
		);
	} finally {
		listening();
	}
	return { stopped };
};

/** How often to ask the agent how it is getting on, passed to the app's own run as its option: only when one is set. */
export const pollOf = ({ pollMs }: { pollMs?: number }): { pollMs?: number } => (pollMs !== undefined ? { pollMs } : {});
