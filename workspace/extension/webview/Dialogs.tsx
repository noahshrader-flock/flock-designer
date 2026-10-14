import { type FormEvent, useEffect, useState } from 'react';
import { useWorkspace } from '../../src/renderer/useWorkspace';
import { stripAnchor } from '../../src/shared/anchor';
import type { BuildInCodebase } from '../../src/shared/contract';
import type { Project } from '../../src/shared/domain/projects';
import { foldersOf, sameFolder } from '../../src/shared/brief';
import { noSetupNote, workOf } from '../../src/shared/work';
import { type CodebaseAction, type PanelDialog, reviewsOf } from '../src/messages';
import { slugify } from '../../src/shared/validate';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Field, Select, TextArea, TextInput } from './ui/Field';
import { FolderField, type FolderPick, folderOf, isChosen, pickOf } from './ui/FolderField';
import { workspace } from './host';

/** A dialog's buttons, in a row: Cancel, then what it does. */
const Buttons = ({ onClose, doing, disabled }: { onClose: () => void; doing: string; disabled: boolean }) => (
	<div className="dialog-buttons">
		<Button secondary onClick={onClose}>
			Cancel
		</Button>
		<Button type="submit" disabled={disabled}>
			{doing}
		</Button>
	</div>
);

/** What a prototype is started from, as the extension takes it: its name, what it explores, and its folder. */
interface NewPrototypeAnswers {
	title: string;
	task: string;
	folder: string | null;
}

/**
 * New prototype, as a dialog in the panel: a name, what it should explore (as many lines as it takes), and its folder.
 * Made once it has a name with a letter or a number in it and something to explore; what is asked is then the
 * extension's, which builds it and says how it goes.
 */
const NewPrototypeDialog = ({
	folders,
	onStart,
	onClose,
}: {
	folders: string[];
	onStart: (answers: NewPrototypeAnswers) => void;
	onClose: () => void;
}) => {
	const [title, setTitle] = useState('');
	const [task, setTask] = useState('');
	const [pick, setPick] = useState<FolderPick>({ kind: 'none' });
	const ready = slugify(title) !== '' && task.trim() !== '' && isChosen(pick);
	const start = (e: FormEvent) => {
		e.preventDefault();
		if (!ready) return;
		onStart({ title: title.trim(), task: task.trim(), folder: folderOf(pick) });
		onClose();
	};
	return (
		<Dialog title="New prototype" onClose={onClose}>
			<form onSubmit={start}>
				<Field label="Name">{(control) => <TextInput control={control} value={title} onChange={setTitle} placeholder="Alert history" />}</Field>
				<Field label="What should it explore?" hint="DSNR builds it from this, with the real design system.">
					{(control) => (
						<TextArea control={control} value={task} onChange={setTask} placeholder="A history of alerts, filterable by camera and by day" rows={5} />
					)}
				</Field>
				<FolderField folders={folders} pick={pick} onPick={setPick} />
				<Buttons onClose={onClose} doing="Create prototype" disabled={!ready} />
			</form>
		</Dialog>
	);
};

/**
 * Assign folder, as a dialog in the panel: the project's folder, with the one it is in chosen, to change or to take it
 * out of. Kept in its brief by the core; what the core says if it cannot is said in the dialog, which stays open.
 */
const AssignFolderDialog = ({
	project,
	folders,
	onAssigned,
	onClose,
}: {
	project: Project;
	folders: string[];
	onAssigned: () => void;
	onClose: () => void;
}) => {
	// The folder it is in, as the list of folders spells it (they are one folder whatever the case), so it is one of the options.
	const [pick, setPick] = useState<FolderPick>(
		pickOf(project.folder === null ? null : (folders.find((f) => sameFolder(f, project.folder as string)) ?? project.folder)),
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const same = project.folder === null ? pick.kind === 'none' : pick.kind !== 'none' && sameFolder(folderOf(pick) ?? '', project.folder);
	const assign = async (e: FormEvent) => {
		e.preventDefault();
		if (same || !isChosen(pick) || busy) return;
		setBusy(true);
		const done = await workspace().assignFolder(project.id, folderOf(pick));
		setBusy(false);
		if (!done.ok) return setError(done.error);
		onAssigned();
		onClose();
	};
	return (
		<Dialog title="Assign folder" onClose={onClose}>
			<form onSubmit={(e) => void assign(e)}>
				<p className="dialog-about">
					Which folder <strong>{project.title}</strong> is in.
				</p>
				<FolderField folders={folders} pick={pick} onPick={setPick} />
				{error && (
					<p role="alert" className="dialog-error">
						{error}
					</p>
				)}
				<Buttons onClose={onClose} doing="Assign" disabled={same || !isChosen(pick) || busy} />
			</form>
		</Dialog>
	);
};

/**
 * Hand off to engineering, said before it starts (ELECTRON_MIGRATION_PLAN 5.2): what the run does, on the work's branch,
 * and that nothing is pushed. Start handoff asks the extension, which runs it as a build is run, with Stop and its log.
 */
const HandoffDialog = ({ project, branch, onStart, onClose }: { project: Project; branch: string; onStart: () => void; onClose: () => void }) => {
	// It does one thing at a time: busy with other work, it says so, and does not start.
	const status = useWorkspace(() => workspace().agentStatus(), []);
	const busy = status.value?.state === 'running';
	return (
		<Dialog title="Hand off to engineering" onClose={onClose}>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (busy) return;
					onStart();
					onClose();
				}}
			>
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
				{busy && (
					<p role="alert" className="dialog-error">
						The agent is busy with other work. It does one thing at a time: open this again when that work has finished.
					</p>
				)}
				<Buttons onClose={onClose} doing="Start handoff" disabled={busy} />
			</form>
		</Dialog>
	);
};

/**
 * The comments on codebase work, read only (ELECTRON_MIGRATION_PLAN 5.3, §1.4): there are no pins on a real product's
 * page, so new feedback goes on the pull request; what was said before is kept and shown, each with who said it and
 * whether it was resolved.
 */
const CodebaseCommentsDialog = ({
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
			{read.error !== null && (
				<p role="alert" className="dialog-error">
					{read.error}
				</p>
			)}
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
			<div className="dialog-buttons">
				<Button secondary onClick={onClose}>
					Close
				</Button>
				<Button onClick={onOpenCode}>Open on GitHub</Button>
			</div>
		</Dialog>
	);
};

/**
 * Build in the codebase (ELECTRON_MIGRATION_PLAN 5.1), for a project's newest prototype, in the product open here: what
 * it would do, read first (the branch, where it starts from, a clean checkout), then handed to Claude Code in this window,
 * which writes the audit and builds it. The app's own plan and hand-over (`buildInCodebasePlan`, `buildInCodebase`).
 */
const BuildInCodebaseDialog = ({
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
	const branches = setup.value ?? [];
	const [from, setFrom] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [handed, setHanded] = useState<BuildInCodebase | null>(null);
	// Starts from what the prototype was modeled on, when that can be started from; else from where the checkout is; else
	// from the first branch that can.
	const listed = setup.value;
	useEffect(() => {
		if (!plan || !listed) return;
		const startable = [plan.basedOn?.branch, plan.current].find((b): b is string => typeof b === 'string' && listed.includes(b));
		setFrom(startable ?? listed[0] ?? null);
	}, [plan, listed]);
	const continuing = plan?.started ?? false;
	// A new branch, or moving to the branch from another, needs a clean checkout; already on it, what is uncommitted is the work.
	const needsClean = plan !== null && (!continuing || plan.current !== plan.branch);
	const canStart = plan !== null && plan.setup && (!needsClean || plan.clean) && (continuing || from !== null) && !busy;
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
				<div className="dialog-buttons">
					<Button onClick={onClose}>Done</Button>
				</div>
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
				{plan && !plan.setup && (
					<p role="alert" className="dialog-error">
						{noSetupNote(plan.branch)}
					</p>
				)}
				{plan && needsClean && !plan.clean && (
					<p role="alert" className="dialog-error">
						There are uncommitted changes in {plan.repository}.{' '}
						{continuing
							? `Your checkout is on ${plan.current ?? 'no branch'}, and moving it to ${plan.branch} needs a clean checkout. Commit or set them aside first.`
							: 'The work starts on a new branch, which needs a clean checkout. Commit or set them aside first.'}
					</p>
				)}
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
								<Select control={control} value={from ?? ''} onChange={setFrom} options={branches.map((b) => ({ value: b, label: b }))} />
							)}
						</Field>
					))}
				{plan && (
					<>
						<p className="field-label">What happens</p>
						<ol className="dialog-steps">
							<li>Claude Code opens in this window on {plan.branch}, with the task in a new conversation.</li>
							<li>
								{continuing
									? 'The agent looks at what is already on the branch and its audit, then carries on from there.'
									: "The agent reads the prototype's source and its marks, and writes an audit first: a decision for each stand-in, a data task for each mock, a deletion for each removal."}
							</li>
							<li>Then it builds the real thing in the files where it belongs, and commits on {plan.branch}. You see all of it there.</li>
						</ol>
					</>
				)}
				{[error, planned.error, setup.error].map(
					(e) =>
						e && (
							<p key={e} role="alert" className="dialog-error">
								{e}
							</p>
						),
				)}
				<Buttons onClose={onClose} doing={busy ? 'Opening…' : continuing ? 'Continue in Claude Code' : 'Build in Claude Code'} disabled={!canStart} />
			</form>
		</Dialog>
	);
};

/**
 * The dialog open over the panel, if one is, drawn for the project it is about as the list has it: none for a project
 * not in the list. What each does is given: what is the extension's is asked of it (`onStart`, `onCodebase`), what is
 * the core's is done here, and what changes the projects reads them again (`onChanged`).
 */
export const PanelDialogs = ({
	dialog,
	projects,
	root,
	onStart,
	onCodebase,
	onChanged,
	onClose,
}: {
	dialog: PanelDialog | null;
	projects: Project[] | null;
	/** The product open here, which codebase work is in. */
	root: string | null;
	onStart: (answers: NewPrototypeAnswers) => void;
	onCodebase: (action: CodebaseAction, projectId: string) => void;
	onChanged: () => void;
	onClose: () => void;
}) => {
	const folders = projects ? foldersOf(projects) : [];
	if (dialog === null) return null;
	if (dialog.kind === 'new') return <NewPrototypeDialog folders={folders} onStart={onStart} onClose={onClose} />;
	const project = projects?.find((p) => p.id === dialog.projectId);
	if (!project) return null;
	const codebase = workOf(project.iterations, 'codebase')[0];
	const newest = reviewsOf(project)[0];
	switch (dialog.kind) {
		case 'assign':
			return <AssignFolderDialog project={project} folders={folders} onAssigned={onChanged} onClose={onClose} />;
		case 'build':
			return root && newest ? <BuildInCodebaseDialog root={root} project={project} name={newest.name} onBuilt={onChanged} onClose={onClose} /> : null;
		case 'hand-off':
			return codebase ? (
				<HandoffDialog project={project} branch={codebase.branch} onStart={() => onCodebase('hand-off', project.id)} onClose={onClose} />
			) : null;
		case 'comments':
			return codebase ? (
				<CodebaseCommentsDialog project={project} branch={codebase.branch} onOpenCode={() => onCodebase('open-code', project.id)} onClose={onClose} />
			) : null;
	}
};
