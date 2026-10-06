import type { WorkspaceApi } from '../shared/contract';
import { waitForAgent } from './localBuild';

/**
 * Asking the agent to act on a project's open comments, and waiting for it.
 *
 * One call does the whole of it on the main process's side (read the comments, write the file,
 * start the agent), so what this adds is the waiting, and saying how it ended.
 */

export type AddressPhase =
	| { kind: 'idle' }
	| { kind: 'running' }
	/**
	 * `changed` is whether the branch moved while the agent ran. An agent that reads the comments and
	 * decides it should not act -- the change is outside this iteration's boundary, or the comment
	 * needs a decision only a person can make -- finishes exactly as cleanly as one that rewrote half
	 * the view. Reporting both as "finished" sent people looking for a change that was never made.
	 */
	| { kind: 'done'; changed: boolean }
	| { kind: 'failed'; message: string };

export type AddressApi = Pick<WorkspaceApi, 'addressComments' | 'agentStatus' | 'iterationCommit'>;

export const runAddress = async ({
	api,
	root,
	projectId,
	name,
	isLive,
	onPhase,
	pollMs,
}: {
	api: AddressApi;
	root: string;
	projectId: string;
	name: string;
	isLive: () => boolean;
	onPhase: (phase: AddressPhase) => void;
	pollMs?: number;
}): Promise<void> => {
	onPhase({ kind: 'running' });
	// Where the branch stood before the agent touched it. A failure to read it is not a reason to
	// refuse to run: it only means this cannot tell afterwards whether anything was committed.
	const before = await api.iterationCommit(root, projectId, name);
	const started = await api.addressComments(root, projectId, name);
	if (!started.ok) return onPhase({ kind: 'failed', message: started.error });
	if (started.value.state === 'unavailable') return onPhase({ kind: 'failed', message: started.value.detail });

	const outcome = await waitForAgent(api, isLive, pollMs);
	if (outcome.kind === 'stopped') return;
	if (outcome.kind === 'failed') return onPhase({ kind: 'failed', message: outcome.message });
	const after = await api.iterationCommit(root, projectId, name);
	// Unknown either side means it cannot be said the branch stood still, so it is not claimed.
	const moved = !before.ok || !after.ok || before.value === null || after.value === null || before.value !== after.value;
	onPhase({ kind: 'done', changed: moved });
};
