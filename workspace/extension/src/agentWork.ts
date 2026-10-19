import type { WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';

/** The notification has a Stop button only when `onStop` is given. */
export type Progress = (title: string, task: (say: (message: string) => void) => Promise<void>, onStop?: () => void) => Promise<void>;

/** `start` clears the log and shows it. */
export interface AgentLogLike {
	start: (title: string) => void;
	line: (text: string) => void;
}

export type Tell = (message: string) => void;
/** Resolves to the action pressed, or undefined when dismissed. */
export type Offer = (message: string, actions: string[]) => Promise<string | undefined>;

export interface AgentWorkDeps {
	api: Pick<WorkspaceApi, 'agentReadiness' | 'stopAgent' | 'onAgentLog'>;
	progress: Progress;
	log: AgentLogLike;
}

export const agentReady = async (api: Pick<WorkspaceApi, 'agentReadiness'>): Promise<void> => {
	const { state } = valueOf(await api.agentReadiness());
	if (state === 'missing')
		throw new Error(
			'Claude Code is not installed. New work is built by Claude Code on this machine: install it from claude.com/claude-code, sign in, then start again.',
		);
	if (state === 'signedOut')
		throw new Error('Claude Code is not signed in. Sign in in the Claude Code panel, or by running claude in a terminal, then start again.');
};

/** Stop stops the agent, which ends the core's job too. */
export const agentWork = async (
	{ api, progress, log }: AgentWorkDeps,
	{ title, logTitle }: { title: string; logTitle: string },
	work: (say: (message: string) => void) => Promise<void>,
): Promise<{ stopped: boolean }> => {
	let stopped = false;
	log.start(logTitle);
	const listening = api.onAgentLog((l) => log.line(l.text.replace(/\n$/, '')));
	try {
		await progress(
			title,
			(say) => work(say),
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
