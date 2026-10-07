import type { ProjectIteration } from '../shared/contract';
import { useAgentBusy } from './useAgentBusy';
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
	iteration,
	onStart,
}: {
	open: boolean;
	onClose: () => void;
	iteration: ProjectIteration;
	/** Starts it: the main process checks and starts the run, and a refusal is shown where the run would be. */
	onStart: () => void;
}) => {
	const agentBusy = useAgentBusy(open);

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-xl">
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
				</DialogBody>
				<DialogFooter>
					<Button variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={() => {
							onClose();
							onStart();
						}}
						disabled={agentBusy}
					>
						Start handoff
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
