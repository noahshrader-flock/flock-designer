import {
	FSAlert,
	FSBox,
	FSButton,
	FSChip,
	FSDivider,
	FSStack,
	FSTextField,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import { useCallback, useEffect, useState } from 'react';
import type { Checkout, ContextReceipt, Iteration, PreviewStatus, RunLogLine } from '../shared/contract';
import { ContextReceiptPanel } from './ContextReceiptPanel';
import { LogPanel } from './LogPanel';
import { useCall } from './useWorkspace';

/**
 * The whole journey step 13 owes, on one screen.
 *
 * Open a repository, see what was grounded before anything is generated, create
 * or continue an iteration, hand the task to the agent, run the preview. The app
 * stays quiet on purpose -- it coordinates a repository, it is not a place to
 * design in.
 */
export const App = () => {
	const checkout = useCall<Checkout | null>();
	const receipt = useCall<ContextReceipt>();
	const iterations = useCall<Iteration[]>();
	const preview = useCall<PreviewStatus>();
	const agent = useCall<unknown>();

	const [projectId, setProjectId] = useState('');
	const [note, setNote] = useState('');
	const [task, setTask] = useState('');
	const [log, setLog] = useState<RunLogLine[]>([]);
	const [previewStatus, setPreviewStatus] = useState<PreviewStatus>({ state: 'stopped' });

	const root = checkout.value?.root ?? null;

	useEffect(() => {
		const append = (line: RunLogLine) => setLog((prev) => [...prev, line].slice(-500));
		const offRun = window.workspace.onRunLog(append);
		const offAgent = window.workspace.onAgentLog(append);
		const offStatus = window.workspace.onPreviewStatus(setPreviewStatus);
		return () => {
			offRun();
			offAgent();
			offStatus();
		};
	}, []);

	const openRepository = useCallback(async () => {
		const opened = await checkout.call(() => window.workspace.chooseCheckout());
		if (opened) {
			await receipt.call(() => window.workspace.readContextReceipt(opened.root));
		}
	}, [checkout, receipt]);

	const refreshIterations = useCallback(async () => {
		if (root && projectId) {
			await iterations.call(() => window.workspace.listIterations(root, projectId));
		}
	}, [iterations, root, projectId]);

	const newIteration = useCallback(async () => {
		if (!root || !projectId) {
			return;
		}
		const created = await iterations.call(async () => {
			const result = await window.workspace.createIteration(root, projectId, note);
			return result.ok ? { ok: true as const, value: [result.value] } : result;
		});
		if (created) {
			await checkout.call(() => window.workspace.openCheckout(root));
			await refreshIterations();
		}
	}, [checkout, iterations, note, projectId, refreshIterations, root]);

	const commands = receipt.value?.commands ?? [];
	const previewCommand = commands.find((c) => c.id === 'preview') ?? commands[0];

	return (
		<FSBox sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
			<FSStack spacing={3}>
				<FSStack direction="row" alignItems="center" spacing={2}>
					<FSTypography variant="h5" component="h1">
						Flock Designer Workspace
					</FSTypography>
					<FSBox flexGrow={1} />
					<FSButton onClick={openRepository} disabled={checkout.busy}>
						Open a repository
					</FSButton>
				</FSStack>

				{checkout.error && <FSAlert severity="error">{checkout.error}</FSAlert>}

				{checkout.value && (
					<FSStack direction="row" spacing={2} alignItems="center">
						<FSTypography variant="subtitle1">{checkout.value.name}</FSTypography>
						<FSChip variant="status" size="small" label={checkout.value.branch ?? 'detached HEAD'} />
						<FSChip
							variant="status"
							size="small"
							color={checkout.value.clean ? 'success' : 'warning'}
							label={checkout.value.clean ? 'clean' : 'uncommitted changes'}
						/>
					</FSStack>
				)}

				{receipt.error && <FSAlert severity="error">{receipt.error}</FSAlert>}
				{receipt.value && <ContextReceiptPanel receipt={receipt.value} />}

				{root && receipt.value && (
					<>
						<FSDivider />
						<FSTypography variant="h6" component="h2">
							Project
						</FSTypography>
						<FSStack direction="row" spacing={2} alignItems="flex-start">
							<FSTextField
								label="Project id"
								placeholder="users-inactivity-signal"
								value={projectId}
								onChange={setProjectId}
								sx={{ minWidth: 280 }}
							/>
							<FSTextField
								label="What this iteration is trying"
								value={note}
								onChange={setNote}
								sx={{ flexGrow: 1 }}
							/>
							<FSButton onClick={newIteration} disabled={!projectId || iterations.busy}>
								New iteration
							</FSButton>
							<FSButton variant="secondary" onClick={refreshIterations} disabled={!projectId}>
								Load
							</FSButton>
						</FSStack>
						{iterations.error && <FSAlert severity="error">{iterations.error}</FSAlert>}
						{iterations.value?.map((it) => (
							<FSStack key={it.name} direction="row" spacing={2} alignItems="center">
								<FSChip variant="status" size="small" label={it.name} />
								<FSTypography variant="body2">{it.branch}</FSTypography>
								<FSTypography variant="body2" color="text.secondary">
									{it.note}
								</FSTypography>
								<FSBox flexGrow={1} />
								<FSButton
									variant="secondary"
									onClick={() =>
										iterations.call(async () => {
											const r = await window.workspace.continueIteration(root, projectId, it.name);
											return r.ok ? { ok: true as const, value: [r.value] } : r;
										})
									}
								>
									Continue
								</FSButton>
							</FSStack>
						))}

						<FSDivider />
						<FSTypography variant="h6" component="h2">
							Ask the agent
						</FSTypography>
						<FSStack direction="row" spacing={2} alignItems="flex-start">
							<FSTextField
								label="Task"
								multiline
								minRows={2}
								value={task}
								onChange={setTask}
								sx={{ flexGrow: 1 }}
							/>
							<FSButton
								onClick={() => agent.call(() => window.workspace.startAgent(root, projectId, task))}
								disabled={!projectId || !task}
							>
								Start
							</FSButton>
						</FSStack>
						{agent.error && <FSAlert severity="error">{agent.error}</FSAlert>}

						<FSDivider />
						<FSTypography variant="h6" component="h2">
							Preview
						</FSTypography>
						{previewCommand ? (
							<FSStack direction="row" spacing={2} alignItems="center">
								<FSButton
									onClick={() => preview.call(() => window.workspace.startCommand(root, previewCommand.id))}
									disabled={previewStatus.state === 'running'}
								>
									{previewCommand.label}
								</FSButton>
								<FSButton
									variant="secondary"
									onClick={() => preview.call(() => window.workspace.stopCommand(root, previewCommand.id))}
									disabled={previewStatus.state === 'stopped'}
								>
									Stop
								</FSButton>
								<FSTypography variant="body2">
									{previewStatus.state === 'running'
										? previewStatus.url
										: previewStatus.state === 'failed'
											? previewStatus.detail
											: previewStatus.state}
								</FSTypography>
							</FSStack>
						) : (
							<FSAlert severity="info">
								This repository declares no commands, so there is nothing Workspace may run in it.
							</FSAlert>
						)}
						{preview.error && <FSAlert severity="error">{preview.error}</FSAlert>}

						<LogPanel lines={log} />
					</>
				)}
			</FSStack>
		</FSBox>
	);
};
