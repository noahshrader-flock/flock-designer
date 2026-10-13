import { useEffect, useState } from 'react';
import type { BuildInCodebase, Checkout, BuildInCodebasePlan, Project, ProjectIteration } from '../shared/contract';
import { iterationLabel } from '../shared/work';
import { CancelButton } from './CancelButton';
import { SearchSelect } from './SearchSelect';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Field, FieldDescription, FieldLabel } from './ui/field';

/**
 * Building a prototype in the codebase, said out loud before it happens.
 *
 * It changes the person's checkout (a new branch, switched to) and needs the full setup a prototype does not. So it
 * asks first, shows what it will do and what would stop it, and starts from the branch the prototype was modeled on
 * rather than whichever one the checkout happens to be on.
 *
 * The building is not done here: it is handed to Claude Code in the repository (VS Code's panel, or a terminal), where
 * the person watches the agent work and can step in. This makes the branch and the record, as all codebase work's are.
 */
export const BuildInCodebaseDialog = ({
	open,
	onClose,
	project,
	iteration,
	checkout,
}: {
	open: boolean;
	onClose: () => void;
	project: Project;
	iteration: ProjectIteration;
	checkout: Checkout;
}) => {
	const [plan, setPlan] = useState<BuildInCodebasePlan | null>(null);
	const [branches, setBranches] = useState<string[]>([]);
	const [from, setFrom] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	// Where the building went, once it was handed over.
	const [handed, setHanded] = useState<BuildInCodebase | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		let current = true;
		setPlan(null);
		setError(null);
		setHanded(null);
		void window.workspace.buildInCodebasePlan(checkout.root, project.id, iteration.name).then((r) => {
			if (!current) return;
			if (r.ok) setPlan(r.value);
			else setError(r.error);
		});
		// Only branches with the DSNR setup: codebase work cannot start anywhere else.
		void window.workspace.branchesWithSetup(checkout.root).then((r) => current && r.ok && setBranches(r.value));
		return () => {
			current = false;
		};
	}, [open, checkout.root, project.id, iteration.name]);

	// Starts from what the prototype was modeled on, when that can be started from; else from where the checkout is,
	// when that can; else from the newest branch that can.
	useEffect(() => {
		if (!plan) return;
		const startable = [plan.basedOn?.branch, plan.current].find((b): b is string => b !== undefined && b !== null && branches.includes(b));
		setFrom(startable ?? branches[0] ?? null);
	}, [plan, branches]);

	const wrongRepository = plan !== null && plan.basedOn !== null && plan.basedOn.repository !== plan.repository;
	// Work already started is continued where it is: not started a second time.
	const continuing = plan?.started ?? false;
	// A new branch, or moving to the branch from another, needs a clean checkout. Already on it, whatever is uncommitted
	// is the work in progress, and is left alone.
	const needsClean = plan !== null && (!continuing || plan.current !== plan.branch);
	const canStart = plan !== null && (!needsClean || plan.clean) && (continuing || from !== null) && !busy;

	const start = async () => {
		if (!plan) return;
		setBusy(true);
		setError(null);
		const r = await window.workspace.buildInCodebase(checkout.root, project.id, iteration.name, continuing ? undefined : (from ?? undefined));
		setBusy(false);
		if (!r.ok) return setError(r.error);
		setHanded(r.value);
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
				<DialogHeader>
					<DialogTitle>Build in the codebase</DialogTitle>
				</DialogHeader>
				{handed ? (
					<>
						<DialogBody className="flex flex-col gap-3">
							{handed.editor ? (
								<p className="text-sm">
									It is in Claude Code in VS Code now, on {plan?.branch}: a new conversation there has the task typed in. Press Enter there to start
									it, then watch the agent write the audit and then the code, and step in when you like.
								</p>
							) : (
								<>
									<p className="text-sm">
										VS Code with Claude Code is not on this machine, so the command that starts it in a terminal is on your clipboard. Paste it in a
										terminal to begin:
									</p>
									<pre className="bg-muted m-0 rounded-md p-3 font-mono text-xs wrap-anywhere whitespace-pre-wrap">{handed.command}</pre>
								</>
							)}
						</DialogBody>
						<DialogFooter>
							<Button onClick={onClose}>Done</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogBody className="flex flex-col gap-4">
							<p className="text-muted-foreground text-sm">
								This moves {iterationLabel(iteration)} into {checkout.name} as real work, built by Claude Code in the repository. It needs the full
								setup: packages, environment variables, and the app able to run.
							</p>

							{plan && needsClean && !plan.clean && (
								<Alert variant="warning">
									<AlertTitle>There are uncommitted changes in {plan.repository}</AlertTitle>
									<AlertDescription>
										{continuing
											? `Your checkout is on ${plan.current ?? 'no branch'}, and moving it to ${plan.branch} needs a clean checkout. Commit or set them aside first.`
											: 'The work starts on a new branch, which needs a clean checkout. Commit or set them aside first.'}
									</AlertDescription>
								</Alert>
							)}
							{wrongRepository && plan?.basedOn && (
								<Alert>
									<AlertDescription>
										The prototype was modeled on {plan.basedOn.repository}, and this is {plan.repository}.
									</AlertDescription>
								</Alert>
							)}
							{plan && (
								<>
									<Field>
										<FieldLabel htmlFor="move-from">{continuing ? 'Continues' : 'Starts from'}</FieldLabel>
										{continuing ? (
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
										<FieldDescription>
											{continuing
												? `${plan.branch} already has this project’s codebase work, so Claude Code picks it up there.${plan.current === plan.branch ? '' : ' Your checkout moves to it.'}`
												: `Creates ${plan.branch} from this branch and moves your checkout to it.`}
										</FieldDescription>
									</Field>

									<div className="flex flex-col gap-1.5">
										<p className="text-sm font-medium">What happens</p>
										<ol className="text-muted-foreground m-0 list-decimal pl-5 text-sm">
											<li>
												Claude Code opens in {checkout.name} on {plan.branch}, with the task in a new conversation.
											</li>
											<li>
												{continuing
													? 'The agent looks at what is already on the branch and its audit, then carries on from there.'
													: "The agent reads the prototype's source and its marks, and writes an audit first: a decision for each stand-in, a data task for each mock, a deletion for each removal."}
											</li>
											<li>Then it builds the real thing in the files where it belongs, and commits on {plan.branch}. You see all of it there.</li>
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
							<CancelButton onClick={onClose} disabled={busy} />
							<Button onClick={() => void start()} disabled={!canStart}>
								{busy ? 'Opening…' : continuing ? 'Continue in Claude Code' : 'Build in Claude Code'}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
