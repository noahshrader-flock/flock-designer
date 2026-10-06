import { useEffect, useRef, useState } from 'react';
import type { Project, ProjectIteration, RunLogLine, WorkspaceApi } from '../shared/contract';
import { quickKey } from '../shared/projects';
import { type BuildPhase, waitForAgent } from './localBuild';

/**
 * Getting a quick prototype onto the screen: built by the agent first when it was only just asked for,
 * saved to the design repository, then served from this machine. The same phases as a local build, so
 * the review screen shows either the same way.
 */
export type QuickApi = Pick<WorkspaceApi, 'buildQuick' | 'agentStatus' | 'saveQuick' | 'openQuick'>;

export const runQuickBuild = async ({
	api,
	project,
	iteration,
	task,
	isLive,
	onPhase,
	pollMs = 1000,
}: {
	api: QuickApi;
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
	const stillBuilding = now.ok && now.value.state === 'running' && now.value.work === quickKey(project.id, iteration.name);
	if (task || stillBuilding) {
		onPhase({ kind: 'agent' });
		if (!stillBuilding) {
			const started = await api.buildQuick(project.id, iteration.name, task as string);
			if (!started.ok) return fail(started.error);
			if (started.value.state === 'unavailable') return fail(started.value.detail);
		}
		const outcome = await waitForAgent(api, isLive, pollMs);
		if (outcome.kind === 'stopped') return null;
		if (outcome.kind === 'failed') return fail(outcome.message);
		// Saved before it is shown, so what is on screen is what reviewers will see.
		const saved = await api.saveQuick(project.id, iteration.name);
		if (!saved.ok) return fail(saved.error);
		if (!isLive()) return null;
	}
	onPhase({ kind: 'preview' });
	const opened = await api.openQuick(project.id, iteration.name);
	if (!isLive()) return null;
	if (!opened.ok) return fail(opened.error);
	onPhase({ kind: 'running', url: opened.value });
	return opened.value;
};

/** The hook the review screen uses, shaped like `useLocalBuild` so the screen treats both alike. */
export const useQuickBuild = ({
	project,
	iteration,
	task,
	enabled,
}: {
	project: Project;
	iteration: ProjectIteration;
	task?: string;
	enabled: boolean;
}) => {
	const [phase, setPhase] = useState<BuildPhase>({ kind: 'idle' });
	const [log, setLog] = useState<string[]>([]);
	const [attempt, setAttempt] = useState(0);
	// Once the page is saved, trying again opens it rather than asking for it to be built twice.
	const built = useRef(false);

	useEffect(() => {
		if (!enabled) return;
		// What the agent said before this screen was opened, when the run is this prototype's: picks up where it was left.
		void window.workspace.agentRecent().then((r) => {
			if (r.ok && r.value.work === quickKey(project.id, iteration.name)) setLog((prev) => (prev.length ? prev : r.value.lines));
		});
		return window.workspace.onAgentLog((l: RunLogLine) => setLog((prev) => [...prev, l.text.replace(/\n$/, '')].slice(-200)));
	}, [enabled, project.id, iteration.name]);

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		setPhase({ kind: 'idle' });
		void runQuickBuild({
			api: window.workspace,
			project,
			iteration,
			task: built.current ? undefined : task,
			isLive: () => !cancelled,
			onPhase: (p) => {
				if (cancelled) return;
				if (p.kind === 'preview' && task) built.current = true;
				setPhase(p);
			},
		});
		return () => {
			cancelled = true;
		};
	}, [enabled, project.id, iteration.name, task, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

	return { phase, log, retry: () => setAttempt((n) => n + 1) };
};
