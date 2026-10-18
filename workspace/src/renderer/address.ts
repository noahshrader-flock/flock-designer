import type { CommentRef, PrototypeAddressed, WorkspaceApi } from '../shared/contract';
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
	| { kind: 'done'; changed: boolean; commit: string | null; prototype?: PrototypeAddressed }
	| { kind: 'failed'; message: string };

export type AddressApi = Pick<WorkspaceApi, 'addressComments' | 'agentStatus' | 'iterationCommit'>;

export type PrototypeAddressApi = Pick<WorkspaceApi, 'addressPrototype' | 'agentStatus' | 'finishPrototypeAddress'>;

/**
 * The same, on a prototype. It has no commits, so where the change went and whether there was one are the main
 * process's to say once the agent has finished: in this version, or in a new one from it when `newVersion` asked for one.
 */
export const runPrototypeAddress = async ({
	api,
	projectId,
	name,
	comment,
	newVersion,
	isLive,
	onPhase,
	pollMs,
}: {
	api: PrototypeAddressApi;
	projectId: string;
	name: string;
	comment: CommentRef;
	newVersion: boolean;
	isLive: () => boolean;
	onPhase: (phase: AddressPhase) => void;
	pollMs?: number;
}): Promise<void> => {
	onPhase({ kind: 'running' });
	const started = await api.addressPrototype(projectId, name, comment, newVersion);
	if (!started.ok) return onPhase({ kind: 'failed', message: started.error });
	if (started.value.state === 'unavailable') return onPhase({ kind: 'failed', message: started.value.detail });

	const outcome = await waitForAgent(api, isLive, pollMs);
	// Left before it ended: the change is finished when the prototype is next opened.
	if (outcome.kind === 'stopped') return;
	if (outcome.kind === 'failed') return onPhase({ kind: 'failed', message: outcome.message });
	const finished = await api.finishPrototypeAddress(comment);
	if (!finished.ok) return onPhase({ kind: 'failed', message: finished.error });
	onPhase({ kind: 'done', changed: finished.value.changed, commit: null, prototype: finished.value });
};
