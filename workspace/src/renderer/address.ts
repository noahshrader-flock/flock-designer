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
	| { kind: 'done' }
	| { kind: 'failed'; message: string };

export type AddressApi = Pick<WorkspaceApi, 'addressComments' | 'agentStatus'>;

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
	const started = await api.addressComments(root, projectId, name);
	if (!started.ok) return onPhase({ kind: 'failed', message: started.error });
	if (started.value.state === 'unavailable') return onPhase({ kind: 'failed', message: started.value.detail });

	const outcome = await waitForAgent(api, isLive, pollMs);
	if (outcome.kind === 'stopped') return;
	onPhase(outcome.kind === 'failed' ? { kind: 'failed', message: outcome.message } : { kind: 'done' });
};
