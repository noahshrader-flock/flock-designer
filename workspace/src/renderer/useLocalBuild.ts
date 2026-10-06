import { useEffect, useRef, useState } from 'react';
import type { Checkout, Project, ProjectIteration, RunLogLine } from '../shared/contract';
import { type BuildPhase, runLocalBuild } from './localBuild';

/**
 * Brings an iteration up on this machine as soon as it is opened.
 *
 * `enabled` is false when there is nothing to run here (a hosted preview already has an
 * address) and `checkout` is null when this machine has no product repository.
 */
export const useLocalBuild = ({
	checkout,
	project,
	iteration,
	task,
	enabled,
}: {
	checkout: Checkout | null;
	project: Project;
	iteration: ProjectIteration;
	/** For work that was just created: the request the agent builds before the preview starts. */
	task?: string;
	enabled: boolean;
}) => {
	const [phase, setPhase] = useState<BuildPhase>({ kind: 'idle' });
	const [log, setLog] = useState<string[]>([]);
	const [attempt, setAttempt] = useState(0);
	// Once the agent has done its work, trying again must not ask it to do the work twice.
	const agentDone = useRef(false);

	useEffect(() => {
		// What the agent said before this screen was opened, when the run is this branch's: picks up where it was left.
		void window.workspace.agentRecent().then((r) => {
			if (r.ok && r.value.work === iteration.branch) setLog((prev) => (prev.length ? prev : r.value.lines));
		});
		const add = (l: RunLogLine) => setLog((prev) => [...prev, l.text.replace(/\n$/, '')].slice(-200));
		const offs = [window.workspace.onAgentLog(add), window.workspace.onRunLog(add)];
		return () => offs.forEach((off) => off());
	}, [iteration.branch]);

	const root = checkout?.root ?? null;
	useEffect(() => {
		if (!enabled || root === null) return;
		let cancelled = false;
		setPhase({ kind: 'idle' });
		void runLocalBuild({
			api: window.workspace,
			root,
			project,
			iteration,
			task: agentDone.current ? undefined : task,
			isLive: () => !cancelled,
			onPhase: (p) => {
				if (cancelled) return;
				if (p.kind === 'preview' && task) agentDone.current = true;
				setPhase(p);
			},
		});
		return () => {
			cancelled = true;
		};
		// The iteration is identified by these, not by the object, which is new on every render of the parent.
	}, [enabled, root, project.id, iteration.name, iteration.branch, task, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

	return { phase, log, retry: () => setAttempt((n) => n + 1) };
};
