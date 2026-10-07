import { useEffect, useState } from 'react';
import type { AgentReadiness, Checkout, MoveToCodePlan, Project, ProjectIteration } from '../shared/contract';
import { freshIteration } from '../shared/projects';
import { SearchSelect } from './SearchSelect';
import { useAgentBusy } from './useAgentBusy';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';

/**
 * Moving a quick prototype into the code, said out loud before it happens.
 *
 * It changes the person's checkout (a new branch, switched to), runs an agent unattended on real files, and needs
 * the full setup a prototype does not. So it asks first, shows what it will do and what would stop it, and starts
 * from the branch the prototype was modelled on rather than whichever one the checkout happens to be on.
 *
 * It is a codebase feature that starts with a source and an audit: the same branch and the same agent as a codebase
 * feature made from New, so there is one way to make that branch, not two.
 */
export const MoveToCode = ({
	open,
	onClose,
	project,
	iteration,
	checkout,
	onStarted,
}: {
	open: boolean;
	onClose: () => void;
	project: Project;
	iteration: ProjectIteration;
	checkout: Checkout;
	onStarted: (project: Project, iteration: ProjectIteration, task: string) => void;
}) => {
	const [plan, setPlan] = useState<MoveToCodePlan | null>(null);
	const [branches, setBranches] = useState<string[]>([]);
	const [from, setFrom] = useState<string | null>(null);
	const [agent, setAgent] = useState<AgentReadiness>({ state: 'unknown' });
	// The agent does one piece of work at a time; this would otherwise be refused behind another run.
	const agentBusy = useAgentBusy(open);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		let current = true;
		setPlan(null);
		setError(null);
		void window.workspace.moveToCodePlan(checkout.root, project.id, iteration.name).then((r) => {
			if (!current) return;
			if (r.ok) setPlan(r.value);
			else setError(r.error);
		});
		void window.workspace.listBaseBranches(checkout.root).then((r) => current && r.ok && setBranches(r.value));
		void window.workspace.agentReadiness().then((r) => current && r.ok && setAgent(r.value));
		return () => {
			current = false;
		};
	}, [open, checkout.root, project.id, iteration.name]);

	// Starts from what the prototype was modelled on, when that branch is here; otherwise from where the checkout is.
	useEffect(() => {
		if (!plan) return;
		const modelled = plan.basedOn?.branch;
		setFrom(modelled && branches.includes(modelled) ? modelled : plan.current);
	}, [plan, branches]);

	const agentBlocked = agent.state === 'missing' || agent.state === 'signedOut';
	const wrongRepository = plan !== null && plan.basedOn !== null && plan.basedOn.repository !== plan.repository;
	const canStart = plan !== null && !plan.recorded && plan.clean && !agentBlocked && !agentBusy && (plan.exists || from !== null) && !busy;

	const start = async () => {
		if (!plan) return;
		setBusy(true);
		setError(null);
		const task = await window.workspace.prepareMoveToCode(project.id, iteration.name);
		if (!task.ok) {
			setBusy(false);
			return setError(task.error);
		}
		const made = await window.workspace.createIteration(
			checkout.root,
			project.id,
			`From quick prototype ${iteration.name}`,
			'codebase',
			from ?? undefined,
		);
		setBusy(false);
		if (!made.ok) return setError(made.error);
		onClose();
		onStarted(project, freshIteration(made.value), task.value);
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
				<DialogHeader>
					<DialogTitle>Build in the codebase</DialogTitle>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">
						This moves {iteration.name} into {checkout.name} as real work. It needs the full setup: packages, environment variables, and the app able to run.
					</p>

					{plan?.recorded && (
						<Alert variant="warning">
							<AlertTitle>This project already has codebase work</AlertTitle>
							<AlertDescription>
								It is on {plan.branch}. Open it from the project list; a second one is not started.
							</AlertDescription>
						</Alert>
					)}
					{plan && !plan.recorded && !plan.clean && (
						<Alert variant="warning">
							<AlertTitle>There are uncommitted changes in {plan.repository}</AlertTitle>
							<AlertDescription>The work starts on a new branch, which needs a clean checkout. Commit or set them aside first.</AlertDescription>
						</Alert>
					)}
					{wrongRepository && plan?.basedOn && (
						<Alert>
							<AlertDescription>
								The prototype was modelled on {plan.basedOn.repository}, and this is {plan.repository}.
							</AlertDescription>
						</Alert>
					)}
					{agentBlocked && (
						<Alert variant="warning">
							<AlertTitle>{agent.state === 'missing' ? 'Claude Code is not installed' : 'Claude Code is not signed in'}</AlertTitle>
							<AlertDescription>
								{agent.state === 'missing'
									? 'The code is written by Claude Code on this machine. Install it, sign in, then open this again.'
									: 'Sign in with your Claude account, then open this again.'}
							</AlertDescription>
						</Alert>
					)}
					{agentBusy && !agentBlocked && (
						<Alert variant="warning">
							<AlertTitle>The agent is busy with other work</AlertTitle>
							<AlertDescription>It does one thing at a time. Open this again when that work has finished.</AlertDescription>
						</Alert>
					)}

					{plan && !plan.recorded && (
						<>
							<div className="flex flex-col gap-2">
								<Label htmlFor="move-from">{plan.exists ? 'Continues' : 'Starts from'}</Label>
								{plan.exists ? (
									<p className="font-mono text-sm">{plan.branch}</p>
								) : (
									<SearchSelect
										id="move-from"
										items={branches}
										value={from}
										onChange={setFrom}
										placeholder="Choose a branch"
										search="Search branches…"
										empty="No branch matches."
										disabled={busy}
										className="font-mono"
									/>
								)}
								<p className="text-muted-foreground text-xs">
									{plan.exists
										? `${plan.branch} is already here, so the work continues on it and your checkout moves to it.`
										: `Creates ${plan.branch} from this branch and moves your checkout to it.`}
								</p>
							</div>

							<div className="flex flex-col gap-1.5">
								<p className="text-sm font-medium">What happens</p>
								<ol className="text-muted-foreground m-0 list-decimal pl-5 text-sm">
									<li>The agent reads the prototype's source and its marks.</li>
									<li>It writes an audit first: a decision for each stand-in, a data task for each mock, a deletion for each removal.</li>
									<li>Then it builds the real thing in the files where it belongs, and commits on {plan.branch}.</li>
								</ol>
							</div>
						</>
					)}

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
					<Button onClick={() => void start()} disabled={!canStart}>
						{busy ? 'Starting…' : plan?.exists ? 'Continue on the branch and build' : 'Create branch and build'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
