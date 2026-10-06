import type { ShareStatus, ShareStep } from '../shared/contract';

/**
 * What the sharing dialog shows. Kept out of the component because the rule that matters is
 * easy to get wrong: the main process remembers the last result, so an old "ready" must not be
 * shown to someone who has just clicked Share again.
 */

export type DialogView = 'confirm' | 'running' | 'ready' | 'failed';

/** `phase` is what this window has done: nothing yet (confirm), or it started a share and is watching it. */
export const dialogView = (phase: 'confirm' | 'working', status: ShareStatus, mine: boolean): DialogView => {
	if (phase === 'confirm' || !mine) return 'confirm';
	return status.state === 'running' || status.state === 'ready' || status.state === 'failed' ? status.state : 'confirm';
};

const STEPS: Record<ShareStep, string> = {
	pushing: 'Pushing the branch',
	opening: 'Opening a draft pull request',
	building: 'Building the preview',
};

export const stepText = (step: ShareStep, detail?: string): string => `${STEPS[step]}${detail ? ` — ${detail}` : ''}`;

/** Whether the status is about this iteration. */
export const isMine = (status: ShareStatus, projectId: string, name: string): boolean =>
	status.state !== 'idle' && status.projectId === projectId && status.name === name;
