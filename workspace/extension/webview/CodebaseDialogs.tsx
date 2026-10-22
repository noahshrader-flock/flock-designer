import { type FormEvent, useEffect, useState } from 'react';
import { useAction } from './hooks/useAction';
import { useWorkspace } from './hooks/useWorkspace';
import type { Handed } from '../../src/shared/contract';
import { handedTo } from '../../src/shared/handedTo';
import { AgentInUse, useAgentName, useAgentPhrase } from './AgentInUse';
import { AgainstBase } from './AgainstBase';
import type { Prototype } from '../../src/shared/domain/prototypes';
import { buildStart, buildSteps, noSetupNote, startBranch } from '../../src/shared/work';
import { Button } from '../../src/ui/Button';
import { Dialog, DialogButtons } from '../../src/ui/Dialog';
import { Field, Select } from '../../src/ui/Field';
import { workspace } from './host';
import { Message } from '../../src/ui/Message';

/**
 * With the work found ready (`readyAt`), Run again sits beside its pull request, so a dismissed offer is never a dead end.
 */
export const HandoffDialog = ({
	root,
	prototype,
	branch,
	readyAt,
	pullRequest,
	onStart,
	onUpdate,
	onShare,
	onOpenCode,
	onClose,
}: {
	/** The product open here; null when none is, and how the branch stands is not read. */
	root: string | null;
	prototype: Prototype;
	branch: string;
	/** The commit a handoff found the work ready at, while its branch is still there; null when it has to be run. */
	readyAt: string | null;
	pullRequest: string | null;
	onStart: () => void;
	onUpdate: () => void;
	onShare: () => void;
	onOpenCode: () => void;
	onClose: () => void;
}) => {
	const agent = useAgentName();
	const start = (e: FormEvent) => {
		e.preventDefault();
		onStart();
		onClose();
	};
	const then = (act: () => void) => () => {
		act();
		onClose();
	};
	return (
		<Dialog title="Hand off to engineering" onClose={onClose}>
			<form onSubmit={start}>
				{readyAt !== null ? (
					<Message>
						A handoff found <strong>{prototype.title}</strong>’s codebase work ready for engineering, and nothing has changed on <code>{branch}</code>{' '}
						since. {pullRequest ? 'Its draft pull request is open.' : 'Open a draft pull request for an engineer to take it.'}
					</Message>
				) : (
					<>
						<Message>
							This checks <strong>{prototype.title}</strong>’s codebase work on <code>{branch}</code>, and gets it ready for an engineer.
						</Message>
						<p className="field-label">What happens</p>
						<ol className="dialog-steps">
							<li>The task opens in {agent} in this window: answer it there as it goes.</li>
							<li>The product’s handoff gate runs: every test, accessibility, the app bundling, the standards.</li>
							<li>Two independent reviews: does it read as the product, and is it built correctly.</li>
							<li>What they block on is fixed and committed on {branch}, one fix at a time.</li>
							<li>A note for the engineer, HANDOFF.md, is written on the branch, and says whether it is ready. Nothing is pushed.</li>
						</ol>
						{root !== null && <AgainstBase root={root} prototypeId={prototype.id} quiet onUpdate={then(onUpdate)} />}
						<AgentInUse />
					</>
				)}
				<DialogButtons>
					{readyAt !== null ? (
						<>
							<Button type="submit" variant="secondary">
								Run again
							</Button>
							{pullRequest ? (
								<Button onPress={then(onOpenCode)}>View on GitHub</Button>
							) : (
								<Button onPress={then(onShare)}>Open a draft pull request</Button>
							)}
						</>
					) : (
						<Button type="submit">Start handoff</Button>
					)}
				</DialogButtons>
			</form>
		</Dialog>
	);
};

/** Update this branch, from a prototype's menu: how it stands, and the update handed to the agent when it is behind. */
export const UpdateBranchDialog = ({
	root,
	prototype,
	onUpdate,
	onClose,
}: {
	root: string;
	prototype: Prototype;
	onUpdate: () => void;
	onClose: () => void;
}) => (
	<Dialog title="Update this branch" onClose={onClose}>
		<AgainstBase
			root={root}
			prototypeId={prototype.id}
			quiet={false}
			onUpdate={() => {
				onUpdate();
				onClose();
			}}
		/>
		<AgentInUse />
	</Dialog>
);

export const BuildInCodebaseDialog = ({
	root,
	prototype,
	name,
	onBuilt,
	onClose,
}: {
	root: string;
	prototype: Prototype;
	name: string;
	onBuilt: () => void;
	onClose: () => void;
}) => {
	const planned = useWorkspace(() => workspace().buildInCodebasePlan(root, prototype.id, name), [root, prototype.id, name]);
	const setup = useWorkspace(() => workspace().branchesWithSetup(root), [root]);
	const plan = planned.value;
	const listed = setup.value;
	const [from, setFrom] = useState<string | null>(null);
	const { busy, error, run } = useAction();
	const [handed, setHanded] = useState<Handed | null>(null);
	const agent = useAgentName();
	const phrase = useAgentPhrase();
	useEffect(() => {
		if (plan && listed) setFrom(startBranch(plan, listed));
	}, [plan, listed]);
	const { continuing, canStart: startable, uncommitted } = plan ? buildStart(plan, from) : { continuing: false, canStart: false, uncommitted: null };
	const canStart = startable && !busy;
	const start = async (e: FormEvent) => {
		e.preventDefault();
		if (!canStart) return;
		await run(
			() => workspace().buildInCodebase(root, prototype.id, name, ...(continuing || from === null ? [] : [from])),
			(value) => {
				setHanded(value);
				onBuilt();
			},
		);
	};
	if (handed && plan)
		return (
			<Dialog title="Build in the codebase" onClose={onClose}>
				<Message>
					{handedTo(handed, `The build, on ${plan.branch},`)}
					{handed.command === null ? ' Watch the agent write the audit and then the code, and step in when you like.' : null}
				</Message>
				{handed.command === null ? null : <pre className="dialog-command">{handed.command}</pre>}
			</Dialog>
		);
	return (
		<Dialog title="Build in the codebase" onClose={onClose}>
			<form onSubmit={(e) => void start(e)}>
				<Message>
					This moves <strong>{prototype.title}</strong> into the product as real work, built by {agent} in the repository. It needs the full setup:
					packages, environment variables, and the app able to run.
				</Message>
				{plan === null && planned.error === null && <Message waiting>Reading what it would do…</Message>}
				<Message tone="warning">{plan && !plan.setup ? noSetupNote(plan.branch) : null}</Message>
				<Message tone="warning">{plan && uncommitted ? `There are uncommitted changes in ${plan.repository}. ${uncommitted}` : null}</Message>
				{plan?.basedOn && plan.basedOn.repository !== plan.repository && (
					<Message>
						The prototype was modeled on {plan.basedOn.repository}, and this is {plan.repository}.
					</Message>
				)}
				{plan &&
					(continuing ? (
						<div className="field">
							<span className="field-label">Continues</span>
							<code>{plan.branch}</code>
							<span className="field-hint">
								{plan.branch} already has this prototype’s codebase work, so {agent} picks it up there.
								{plan.current === plan.branch ? '' : ' Your checkout moves to it.'}
							</span>
						</div>
					) : (
						<Field label="Starts from" hint={`Creates ${plan.branch} from this branch and moves your checkout to it.`}>
							{(control) => (
								<Select control={control} value={from ?? ''} onChange={setFrom} options={(listed ?? []).map((b) => ({ value: b, label: b }))} />
							)}
						</Field>
					))}
				{plan && (
					<>
						<p className="field-label">What happens</p>
						<ol className="dialog-steps">
							<li>
								{agent} opens in this window on {plan.branch}, with the task in a new conversation.
							</li>
							{buildSteps(continuing, plan.branch).map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
					</>
				)}
				{[error, planned.error, setup.error].map(
					(e) =>
						e && (
							<Message key={e} tone="error">
								{e}
							</Message>
						),
				)}
				<AgentInUse />
				<DialogButtons>
					<Button type="submit" disabled={!canStart} busy={busy}>
						{busy ? 'Opening…' : phrase(continuing ? 'Continue' : 'Build')}
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};
