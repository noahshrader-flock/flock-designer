import { FSAlert, FSBox, FSButton, FSChip, FSLink, FSStack, FSTextField, FSTypography } from '@flocksafety/flock-react-component-lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentStatus, Checkout, PreviewStatus, Project, ProjectIteration, RunLogLine } from '../shared/contract';

/**
 * Building on this machine: run the agent, run the preview, and hand the
 * preview's address to the review view -- so a prototype can be generated and
 * looked at without leaving the window, and without pasting an address.
 *
 * A prototype (`fd/…`) runs the standalone prototype harness. Codebase work
 * runs the real shell on mock data. Both are commands the repository itself
 * declares; this names one and the repository decides what it means.
 */

// From the iteration's own name, which the main process already normalised, rather
// than a hard-coded `fd/` prefix -- the branch pattern is the repository's to declare.
const commandFor = (iteration: ProjectIteration): string => (iteration.name === 'codebase' ? 'design-mode' : 'preview');

export const Build = ({
	checkout,
	onChoose,
	project,
	iteration,
	autoTask,
	onPreviewUrl,
}: {
	checkout: Checkout | null;
	onChoose: () => void;
	project: Project;
	iteration: ProjectIteration;
	/** Set when the work was just created: start the agent, then the preview, with no further clicks. */
	autoTask?: string;
	onPreviewUrl: (url: string) => void;
}) => {
	const [task, setTask] = useState('');
	const [agent, setAgent] = useState<AgentStatus>({ state: 'idle' });
	const [preview, setPreview] = useState<PreviewStatus>({ state: 'stopped' });
	const [log, setLog] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const logEnd = useRef<HTMLDivElement>(null);
	// Everything async below checks this: the panel unmounts whenever the person
	// presses Back, and a poll that outlives it would keep running for the session.
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	const root = checkout?.root ?? null;
	const command = commandFor(iteration);

	useEffect(() => {
		const add = (l: RunLogLine) => setLog((prev) => [...prev, l.text.replace(/\n$/, '')].slice(-300));
		const offs = [window.workspace.onAgentLog(add), window.workspace.onRunLog(add), window.workspace.onPreviewStatus((status) => {
				// A preview that belongs to another project is not this panel's to show.
				if ('projectId' in status && status.projectId && status.projectId !== project.id) return;
				setPreview(status);
			}),
		];
		return () => offs.forEach((off) => off());
	}, [project.id]);

	useEffect(() => {
		// A block body on purpose: newer Chromium's scrollIntoView returns a Promise, and an
		// effect that returns anything but a cleanup function takes the whole window down.
		logEnd.current?.scrollIntoView({ block: 'end' });
	}, [log]);

	/** Puts the checkout on this iteration's branch first; a clean tree is required, and the app says so if it is not. */
	const onBranch = useCallback(async (): Promise<boolean> => {
		if (!root) return false;
		const opened = await window.workspace.openCheckout(root);
		if (!opened.ok) return setError(opened.error), false;
		if (opened.value.branch === iteration.branch) return true;
		const moved = await window.workspace.continueIteration(root, project.id, iteration.name);
		if (!moved.ok) return setError(moved.error), false;
		return true;
	}, [root, iteration.branch, iteration.name, project.id]);

	const runPreview = useCallback(async () => {
		if (!root) return;
		setError(null);
		setBusy(true);
		if (await onBranch()) {
			setPreview({ state: 'starting', commandId: command });
			const r = await window.workspace.startCommand(root, command, project.id);
			if (!r.ok) setError(r.error);
			else {
				setPreview(r.value);
				if (r.value.state === 'running') onPreviewUrl(r.value.url);
			}
		}
		setBusy(false);
	}, [root, onBranch, command, project.id, onPreviewUrl]);

	const stopPreview = async () => {
		if (root) setPreview(await window.workspace.stopCommand(root, command).then((r) => (r.ok ? r.value : { state: 'stopped' as const })));
	};

	/** Starts the agent and waits for it; `thenRun` starts the preview when it finishes cleanly. */
	const askAgent = useCallback(
		async (request: string, thenRun: boolean) => {
			if (!root || !request.trim()) return;
			setError(null);
			setBusy(true);
			if (!(await onBranch())) return setBusy(false);
			const started = await window.workspace.startAgent(root, project.id, request.trim());
			if (!started.ok) return setError(started.error), setBusy(false);
			setAgent(started.value);
			for (;;) {
				await new Promise((r) => setTimeout(r, 1000));
				if (!live.current) return;
				const s = await window.workspace.agentStatus();
				if (!s.ok) {
					// Say so rather than leaving the button reading "Agent is working…"
					// for the rest of the session with nothing to click.
					setError(s.error);
					setAgent({ state: 'idle' });
					break;
				}
				setAgent(s.value);
				if (s.value.state !== 'running') {
					setBusy(false);
					if (thenRun && s.value.state === 'finished' && s.value.exitCode === 0 && live.current) await runPreview();
					return;
				}
			}
			setBusy(false);
		},
		[root, onBranch, project.id, runPreview],
	);

	// Work that was just created builds itself: the agent, then the preview.
	const started = useRef(false);
	useEffect(() => {
		if (autoTask && root && !started.current) {
			started.current = true;
			void askAgent(autoTask, true);
		}
	}, [autoTask, root, askAgent]);

	// Pick up a preview that is already running, instead of starting a second.
	useEffect(() => {
		if (!root) return;
		void window.workspace.commandStatus(root, command).then((r) => {
			if (!live.current) return;
			// Only a preview that belongs to *this* project. Every prototype shares one
			// port, so a running preview is usually someone else's.
			if (r.ok && r.value.state === 'running' && r.value.projectId === project.id) {
				setPreview(r.value);
				onPreviewUrl(r.value.url);
			}
		});
	}, [root, command, project.id, onPreviewUrl]);

	if (!root) {
		return (
			<FSBox sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
				<FSStack spacing={1}>
					<FSTypography variant="subtitle2">Build on this machine</FSTypography>
					<FSTypography variant="body2" color="text.secondary">
						Flock Designer could not find a Flock product repository on this machine. Point it at your Coke folder once to run this here.
					</FSTypography>
					<FSButton size="md" variant="secondary" onClick={onChoose}>
						Find it
					</FSButton>
				</FSStack>
			</FSBox>
		);
	}

	const running = preview.state === 'running';
	return (
		<FSBox sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
			<FSStack spacing={1.5}>
				<FSStack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
					<FSTypography variant="subtitle2">Build on this machine</FSTypography>
					<FSChip variant="status" size="small" label={checkout?.name ?? ''} />
					<FSLink component="button" variant="caption" onClick={onChoose}>
						Change
					</FSLink>
				</FSStack>

				<FSStack direction="row" spacing={1} alignItems="center">
					{running ? (
						<FSButton size="md" variant="secondary" onClick={stopPreview}>
							Stop preview
						</FSButton>
					) : (
						<FSButton size="md" onClick={runPreview} disabled={busy || preview.state === 'starting'}>
							{preview.state === 'starting' ? 'Starting…' : 'Run preview'}
						</FSButton>
					)}
					<FSTypography variant="caption" color="text.secondary">
						{preview.state === 'running'
							? 'Running'
							: preview.state === 'failed'
								? preview.detail
								: preview.state === 'starting'
									? 'This can take a minute the first time.'
									: ''}
					</FSTypography>
				</FSStack>

				<FSTextField label="Ask the agent" multiline minRows={2} value={task} onChange={setTask} />
				<FSButton size="md" variant="secondary" onClick={() => void askAgent(task, true)} disabled={busy || agent.state === 'running' || !task.trim()}>
					{agent.state === 'running' ? 'Agent is working…' : 'Ask the agent'}
				</FSButton>
				{agent.state === 'unavailable' && <FSAlert severity="error">{agent.detail}</FSAlert>}
				{agent.state === 'finished' && agent.exitCode !== 0 && (
					<FSAlert severity="warning">The agent stopped with code {agent.exitCode}. Its output is below.</FSAlert>
				)}
				{error && <FSAlert severity="error">{error}</FSAlert>}

				{log.length > 0 && (
					<FSBox
						component="pre"
						sx={{ m: 0, p: 1, maxHeight: 160, overflow: 'auto', bgcolor: 'grey.100', borderRadius: 1, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
					>
						{log.join('\n')}
						<div ref={logEnd} />
					</FSBox>
				)}
			</FSStack>
		</FSBox>
	);
};
