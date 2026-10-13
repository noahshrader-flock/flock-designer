import type { Project, ProjectIteration, WorkspaceApi } from '../shared/contract';
import { prototypeKey } from '../shared/designPaths';
import { type BuildPhase, waitForAgent } from './localBuild';

/**
 * Getting a prototype onto the screen: built by the agent first when it was only just asked for,
 * saved to the design repository, then served from this machine. The same phases as a local build, so
 * the review screen shows either the same way.
 *
 * A page the agent has just built is checked for accessibility before it is shown (T7), and what the check found goes
 * back to the agent, as a build error does, for up to `FIX_ROUNDS` rounds; what is left is shown, never hidden. A
 * check that cannot run never keeps the page from being shown.
 *
 * Over an API, with no React, so the app's review screen (`usePrototypeBuild`) and the VS Code extension's host both run it.
 */
export type PrototypeApi = Pick<
	WorkspaceApi,
	'buildPrototype' | 'agentStatus' | 'savePrototype' | 'openPrototype' | 'checkAccessibility' | 'fixAccessibility'
>;

/** How many times the agent is given what the accessibility check found, before the page is shown as it is (decision 30). */
export const FIX_ROUNDS = 2;

export const runPrototypeBuild = async ({
	api,
	project,
	iteration,
	task,
	isLive,
	onPhase,
	pollMs = 1000,
}: {
	api: PrototypeApi;
	project: Project;
	iteration: ProjectIteration;
	task?: string;
	isLive: () => boolean;
	onPhase: (phase: BuildPhase) => void;
	pollMs?: number;
}): Promise<string | null> => {
	const fail = (message: string): null => {
		onPhase({ kind: 'failed', message });
		return null;
	};
	// Opened again while its agent is still building it: wait on that run, as if the screen had never been left.
	const now = await api.agentStatus();
	const stillBuilding = now.ok && now.value.state === 'running' && now.value.work === prototypeKey(project.id, iteration.name);
	if (task || stillBuilding) {
		onPhase({ kind: 'agent' });
		if (!stillBuilding) {
			const started = await api.buildPrototype(project.id, iteration.name, task as string);
			if (!started.ok) return fail(started.error);
			if (started.value.state === 'unavailable') return fail(started.value.detail);
		}
		// The agent's run, then saved before it is shown, so what is on screen is what reviewers will see. Whether to go
		// on: not when the run failed (said), was stopped, or nobody is looking any more.
		const finish = async (): Promise<boolean> => {
			const outcome = await waitForAgent(api, isLive, pollMs);
			if (outcome.kind === 'stopped') return false;
			if (outcome.kind === 'failed') {
				fail(outcome.message);
				return false;
			}
			const saved = await api.savePrototype(project.id, iteration.name);
			if (!saved.ok) {
				fail(saved.error);
				return false;
			}
			return isLive();
		};
		if (!(await finish())) return null;
		for (let round = 0; round < FIX_ROUNDS; round++) {
			const checked = await api.checkAccessibility(project.id, iteration.name);
			if (!isLive()) return null;
			if (!checked.ok || checked.value.violations.length === 0) break;
			const fixing = await api.fixAccessibility(project.id, iteration.name);
			if (!fixing.ok || fixing.value.state !== 'running') break;
			onPhase({ kind: 'agent', accessibility: true });
			if (!(await finish())) return null;
		}
	}
	onPhase({ kind: 'preview' });
	const opened = await api.openPrototype(project.id, iteration.name);
	if (!isLive()) return null;
	if (!opened.ok) return fail(opened.error);
	onPhase({ kind: 'running', url: opened.value.url, states: opened.value.states });
	return opened.value.url;
};
