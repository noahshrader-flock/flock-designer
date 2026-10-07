import { useEffect, useState } from 'react';
import type { Checkout, Project, ProjectIteration } from '../shared/contract';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

/**
 * Handoff, said out loud before it starts.
 *
 * It is the heavy pass that building leaves out: the product's full gate, both reviews and the fixes they
 * call for, committed on the branch, then a note for the engineer. It runs unattended for a while and
 * changes the branch, so it asks first, and says when the agent is busy rather than queueing behind it.
 */
export const HandoffDialog = ({
	open,
	onClose,
	project,
	iteration,
	checkout,
	onStart,
}: {
	open: boolean;
	onClose: () => void;
	project: Project;
	iteration: ProjectIteration;
	checkout: Checkout;
	onStart: (task: string) => void;
}) => {
	const [agentBusy, setAgentBusy] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		let current = true;
		setError(null);
		void window.workspace.agentStatus().then((r) => current && setAgentBusy(r.ok && r.value.state === 'running'));
		return () => {
			current = false;
		};
	}, [open]);

	const start = async () => {
		setBusy(true);
		setError(null);
		const task = await window.workspace.prepareHandoff(checkout.root, project.id);
		setBusy(false);
		if (!task.ok) return setError(task.error);
		onClose();
		onStart(task.value);
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
				<DialogHeader>
					<DialogTitle>Hand off to engineering</DialogTitle>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">
						The full check of {iteration.branch}, done once, before an engineer picks it up. It runs by itself and takes a while.
					</p>
					{agentBusy && (
						<Alert variant="warning">
							<AlertTitle>The agent is busy with other work</AlertTitle>
							<AlertDescription>It does one thing at a time. Open this again when that work has finished.</AlertDescription>
						</Alert>
					)}
					<div className="flex flex-col gap-1.5">
						<p className="text-sm font-medium">What happens</p>
						<ol className="text-muted-foreground m-0 list-decimal pl-5 text-sm">
							<li>The product's handoff gate runs: every test, accessibility, the app bundling, the standards.</li>
							<li>Two independent reviews: does it read as the product, and is it built correctly.</li>
							<li>What they block on is fixed and committed on {iteration.branch}, one fix at a time.</li>
							<li>A note for the engineer, HANDOFF.md, is written on the branch. Nothing is pushed.</li>
						</ol>
					</div>
					{error && (
						<Alert variant="destructive">
							<AlertDescription className="wrap-anywhere whitespace-pre-wrap">{error}</AlertDescription>
						</Alert>
					)}
				</DialogBody>
				<DialogFooter>
					<Button variant="secondary" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={() => void start()} disabled={busy || agentBusy}>
						{busy ? 'Starting…' : 'Start handoff'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
