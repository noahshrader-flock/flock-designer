import type { Project, ProjectIteration, WorkspaceApi } from '../shared/contract';

/**
 * Getting an iteration onto the screen from this machine, with nobody asked to do anything.
 *
 * Opening an iteration puts the checkout on its branch and starts its preview. Work that
 * was only just created has a request attached, so the agent builds it first. Each step
 * reports where it is, so the screen can say so instead of sitting blank.
 *
 * A function over an injected API rather than code in a component: the order of these
 * steps, and what each failure says, are what matter, and that is testable without a
 * window. It stops quietly the moment `isLive` says nobody is looking any more, which is
 * what keeps a poll from outliving the screen that started it.
 */

export type BuildPhase =
	| { kind: 'idle' }
	| { kind: 'agent' }
	| { kind: 'preview' }
	| { kind: 'running'; url: string }
	| { kind: 'failed'; message: string };

export type BuildApi = Pick<WorkspaceApi, 'openCheckout' | 'continueIteration' | 'startAgent' | 'agentStatus' | 'startCommand'>;

/**
 * From the iteration's own name, which the main process already normalised, rather than a
 * hard-coded branch prefix: the repository declares how its branches are named.
 */
export const previewCommandFor = (iteration: ProjectIteration): string =>
	iteration.name === 'codebase' ? 'design-mode' : 'preview';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How an agent run ended: it finished cleanly, it failed (with what to tell the person), or nobody is looking any more. */
export type AgentOutcome = { kind: 'finished' } | { kind: 'failed'; message: string } | { kind: 'stopped' };

/**
 * Waits for the agent that was just started, asking how it is getting on. Shared by building a
 * prototype and addressing comments, which both start the one agent and wait for it the same way.
 */
export const waitForAgent = async (
	api: Pick<WorkspaceApi, 'agentStatus'>,
	isLive: () => boolean,
	pollMs = 1000,
): Promise<AgentOutcome> => {
	for (;;) {
		await sleep(pollMs);
		if (!isLive()) return { kind: 'stopped' };
		const status = await api.agentStatus();
		if (!status.ok) return { kind: 'failed', message: status.error };
		if (status.value.state === 'unavailable') return { kind: 'failed', message: status.value.detail };
		if (status.value.state === 'running') continue;
		if (status.value.state === 'finished' && status.value.exitCode !== 0) {
			return { kind: 'failed', message: `The agent stopped with code ${status.value.exitCode}.` };
		}
		return { kind: 'finished' };
	}
};

export interface BuildRun {
	api: BuildApi;
	root: string;
	project: Project;
	iteration: ProjectIteration;
	/** What to ask the agent to build first, for work that was just created. Omit to go straight to the preview. */
	task?: string;
	isLive: () => boolean;
	onPhase: (phase: BuildPhase) => void;
	/** How often the agent is asked how it is getting on. */
	pollMs?: number;
}

/** Resolves to the preview's address, or null if it failed (already reported) or nobody is looking. */
export const runLocalBuild = async ({
	api,
	root,
	project,
	iteration,
	task,
	isLive,
	onPhase,
	pollMs = 1000,
}: BuildRun): Promise<string | null> => {
	const fail = (message: string): null => {
		onPhase({ kind: 'failed', message });
		return null;
	};

	// The checkout has to be on this iteration's branch. A dirty tree stops it, and the
	// message says what to do about it.
	const opened = await api.openCheckout(root);
	// Checked before every step that changes something, not just at the end: a screen that
	// has gone (or that React ran twice on purpose) must not still be switching branches.
	if (!isLive()) return null;
	if (!opened.ok) return fail(opened.error);
	if (opened.value.branch !== iteration.branch) {
		const moved = await api.continueIteration(root, project.id, iteration.name);
		if (!moved.ok) return fail(moved.error);
	}
	if (!isLive()) return null;

	if (task) {
		onPhase({ kind: 'agent' });
		const started = await api.startAgent(root, project.id, task);
		if (!started.ok) return fail(started.error);
		if (started.value.state === 'unavailable') return fail(started.value.detail);
		const outcome = await waitForAgent(api, isLive, pollMs);
		if (outcome.kind === 'stopped') return null;
		if (outcome.kind === 'failed') return fail(outcome.message);
		if (!isLive()) return null;
	}

	onPhase({ kind: 'preview' });
	const result = await api.startCommand(root, previewCommandFor(iteration), project.id);
	if (!result.ok) return fail(result.error);
	if (result.value.state === 'running') {
		onPhase({ kind: 'running', url: result.value.url });
		return result.value.url;
	}
	// `stopped` here means the process ended before it ever answered; its output is on screen.
	return fail(result.value.state === 'failed' ? result.value.detail : 'The preview stopped before it was ready. Its output is below.');
};
