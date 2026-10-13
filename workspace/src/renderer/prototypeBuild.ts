import { useEffect, useRef, useState } from 'react';
import type { Project, ProjectIteration, RunLogLine } from '../shared/contract';
import { prototypeKey } from '../shared/designPaths';
import type { BuildPhase } from './localBuild';
import { runPrototypeBuild } from './runPrototypeBuild';

/** The hook the review screen uses, shaped like `useLocalBuild` so the screen treats both alike. */
export const usePrototypeBuild = ({
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
			if (r.ok && r.value.work === prototypeKey(project.id, iteration.name)) setLog((prev) => (prev.length ? prev : r.value.lines));
		});
		return window.workspace.onAgentLog((l: RunLogLine) => setLog((prev) => [...prev, l.text.replace(/\n$/, '')].slice(-200)));
	}, [enabled, project.id, iteration.name]);

	useEffect(() => {
		if (!enabled) return;
		let canceled = false;
		setPhase({ kind: 'idle' });
		void runPrototypeBuild({
			api: window.workspace,
			project,
			iteration,
			task: built.current ? undefined : task,
			isLive: () => !canceled,
			onPhase: (p) => {
				if (canceled) return;
				if (p.kind === 'preview' && task) built.current = true;
				setPhase(p);
			},
		});
		return () => {
			canceled = true;
		};
	}, [enabled, project.id, iteration.name, task, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

	return { phase, log, retry: () => setAttempt((n) => n + 1) };
};
