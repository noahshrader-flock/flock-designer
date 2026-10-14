import { type FormEvent, useEffect, useState } from 'react';
import { useWorkspace } from '../../src/renderer/useWorkspace';
import { stripAnchor } from '../../src/shared/anchor';
import type { BuildInCodebase } from '../../src/shared/contract';
import type { Project } from '../../src/shared/domain/projects';
import { buildStart, buildSteps, noSetupNote, startBranch } from '../../src/shared/work';
import { Button } from './ui/Button';
import { Dialog, DialogButtons, ErrorLine } from './ui/Dialog';
import { Field, Select } from './ui/Field';
import { workspace } from './host';

/** Said when the agent is at other work: it does one thing at a time. */
const BUSY = 'The agent is busy with other work. It does one thing at a time: open this again when that work has finished.';

/**
 * Hand off to engineering, said before it starts: what the run does, on the work's branch, and that nothing is pushed.
 * Start handoff asks the extension, which runs it as a build is run, with Stop and its log. It starts only once it is
 * known the agent is free, asked again when it is pressed.
 */
export const HandoffDialog = ({
	project,
	branch,
	onStart,
	onClose,
}: {
	project: Project;
	branch: string;
	onStart: () => void;
	onClose: () => void;
}) => {
	const status = useWorkspace(() => workspace().agentStatus(), []);
	const [busy, setBusy] = useState(false);
	useEffect(() => setBusy(status.value?.state === 'running'), [status.value]);
	const known = status.value !== null || status.error !== null;
	const start = async (e: FormEvent) => {
		e.preventDefault();
		const now = await workspace().agentStatus();
		if (now.ok && now.value.state === 'running') return setBusy(true);
		onStart();
		onClose();
	};
	return (
		<Dialog title="Hand off to engineering" onClose={onClose}>
			<form onSubmit={(e) => void start(e)}>
				<p className="dialog-about">
					This checks <strong>{project.title}</strong>’s codebase work on <code>{branch}</code>, and gets it ready for an engineer.
				</p>
				<p className="field-label">What happens</p>
				<ol className="dialog-steps">
					<li>The product’s handoff gate runs: every test, accessibility, the app bundling, the standards.</li>
					<li>Two independent reviews: does it read as the product, and is it built correctly.</li>
					<li>What they block on is fixed and committed on {branch}, one fix at a time.</li>
					<li>A note for the engineer, HANDOFF.md, is written on the branch. Nothing is pushed.</li>
				</ol>
				<ErrorLine error={busy ? BUSY : null} />
				<DialogButtons onClose={onClose} close="Cancel">
					<Button type="submit" disabled={busy || !known}>
						Start handoff
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};

/**
 * The comments on codebase work, read only: there are no pins on a real product's page, so new feedback goes on the pull
 * request; what was said before is kept and shown, each with who said it and whether it was resolved.
 */
export const CodebaseCommentsDialog = ({
	project,
	branch,
	onOpenCode,
	onClose,
}: {
	project: Project;
	branch: string;
	onOpenCode: () => void;
	onClose: () => void;
}) => {
	const read = useWorkspace(() => workspace().readComments(project.id, branch), [project.id, branch]);
	return (
		<Dialog title={`Comments on ${project.title}’s codebase work`} onClose={onClose}>
			<p className="dialog-about">Comments on codebase work go on its pull request. These were made before, and are kept as they were.</p>
			<ErrorLine error={read.error} />
			{read.value === null ? (
				read.error === null && <p className="note">Reading them…</p>
			) : read.value.length === 0 ? (
				<p className="note">No comments on it.</p>
			) : (
				<ul className="comment-list">
					{read.value.map((c) => (
						<li key={c.id} data-part="comment" className="comment">
							<span className="comment-by">
								{c.author}
								{c.resolved && <span className="comment-resolved"> · Resolved</span>}
							</span>
							<span className="comment-text">{stripAnchor(c.body).trim()}</span>
						</li>
					))}
				</ul>
			)}
			<DialogButtons onClose={onClose}>
				<Button onClick={onOpenCode}>Open on GitHub</Button>
			</DialogButtons>
		</Dialog>
	);
};

/**
 * Build in the codebase, for a project's newest prototype, in the product open here: what it would do, read first (the
 * branch, where it starts from, a clean checkout), then handed to Claude Code in this window, which writes the audit and
 * builds it. The app's own plan, hand-over and rules (`buildInCodebasePlan`, `buildInCodebase`, `buildStart`).
 */
export const BuildInCodebaseDialog = ({
	root,
	project,
	name,
	onBuilt,
	onClose,
}: {
	root: string;
	project: Project;
	/** The prototype built: the project's newest. */
	name: string;
	onBuilt: () => void;
	onClose: () => void;
}) => {
	const planned = useWorkspace(() => workspace().buildInCodebasePlan(root, project.id, name), [root, project.id, name]);
	const setup = useWorkspace(() => workspace().branchesWithSetup(root), [root]);
	const plan = planned.value;
	const listed = setup.value;
	const [from, setFrom] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [handed, setHanded] = useState<BuildInCodebase | null>(null);
	useEffect(() => {
		if (plan && listed) setFrom(startBranch(plan, listed));
	}, [plan, listed]);
	const { continuing, canStart: startable, uncommitted } = plan ? buildStart(plan, from) : { continuing: false, canStart: false, uncommitted: null };
	const canStart = startable && !busy;
	const start = async (e: FormEvent) => {
		e.preventDefault();
		if (!canStart) return;
		setBusy(true);
		setError(null);
		const r = await workspace().buildInCodebase(root, project.id, name, ...(continuing || from === null ? [] : [from]));
		setBusy(false);
		if (!r.ok) return setError(r.error);
		setHanded(r.value);
		onBuilt();
	};
	if (handed && plan)
		return (
			<Dialog title="Build in the codebase" onClose={onClose}>
				{handed.editor ? (
					<p className="dialog-about">
						It is in Claude Code in this window now, on <code>{plan.branch}</code>: a new conversation there has the task typed in. Press Enter there
						to start it, then watch the agent write the audit and then the code, and step in when you like.
					</p>
				) : (
					<>
						<p className="dialog-about">Claude Code is not in this VS Code, so the command that starts it in a terminal is on your clipboard:</p>
						<pre className="dialog-command">{handed.command}</pre>
					</>
				)}
				<DialogButtons onClose={onClose} />
			</Dialog>
		);
	return (
		<Dialog title="Build in the codebase" onClose={onClose}>
			<form onSubmit={(e) => void start(e)}>
				<p className="dialog-about">
					This moves <strong>{project.title}</strong> into the product as real work, built by Claude Code in the repository. It needs the full setup:
					packages, environment variables, and the app able to run.
				</p>
				{plan === null && planned.error === null && <p className="note">Reading what it would do…</p>}
				<ErrorLine error={plan && !plan.setup ? noSetupNote(plan.branch) : null} />
				<ErrorLine error={plan && uncommitted ? `There are uncommitted changes in ${plan.repository}. ${uncommitted}` : null} />
				{plan?.basedOn && plan.basedOn.repository !== plan.repository && (
					<p className="dialog-about">
						The prototype was modeled on {plan.basedOn.repository}, and this is {plan.repository}.
					</p>
				)}
				{plan &&
					(continuing ? (
						<div className="field">
							<span className="field-label">Continues</span>
							<code>{plan.branch}</code>
							<span className="field-hint">
								{plan.branch} already has this project’s codebase work, so Claude Code picks it up there.
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
							<li>Claude Code opens in this window on {plan.branch}, with the task in a new conversation.</li>
							{buildSteps(continuing, plan.branch).map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
					</>
				)}
				{[error, planned.error, setup.error].map((e) => e && <ErrorLine key={e} error={e} />)}
				<DialogButtons onClose={onClose} close="Cancel">
					<Button type="submit" disabled={!canStart}>
						{busy ? 'Opening…' : continuing ? 'Continue in Claude Code' : 'Build in Claude Code'}
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};
