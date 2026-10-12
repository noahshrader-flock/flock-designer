import { useEffect, useRef, useState } from 'react';
import type {
	AgentReadiness,
	Checkout,
	Project,
	ProjectIteration,
	PrototypeReadiness,
	Repository,
	RepositoryList,
	RepositoryReach,
} from '../shared/contract';
import { slugify } from '../shared/validate';
import { freshIteration } from '../shared/work';
import { CancelButton } from './CancelButton';
import { CloneHere, useClone, Working } from './Clone';
import { FolderField, type FolderPick, pickOf, pickedFolder } from './FolderField';
import { RepositoryReachNote } from './RepositoryReachNote';
import { SearchSelect } from './SearchSelect';
import { GitBranchIcon, InfoIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Field, FieldDescription, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

/** What New makes, said under its title. The app is for prototypes: codebase work is started in the codebase. */
const ABOUT =
	"One page built from the product's real components and shared as a single file. Needs the repository and its packages installed on this machine. Nothing runs and nothing in the codebase changes, so no environment setup.";

export interface Created {
	project: Project;
	iteration: ProjectIteration;
	task: string;
}

/** Where it starts, as the repository's description: a branch icon and the branch, and a Change that swaps it for a field with the list. */
const StartsFrom = ({
	branch,
	branches,
	onChange,
	disabled,
}: {
	branch: string;
	branches: string[];
	onChange: (branch: string) => void;
	disabled: boolean;
}) => {
	const [changing, setChanging] = useState(false);
	if (changing)
		return (
			<Field>
				<FieldLabel htmlFor="new-work-from">Starts from</FieldLabel>
				<SearchSelect
					id="new-work-from"
					items={branches}
					value={branch}
					onChange={onChange}
					placeholder="Choose a branch"
					search="Search branches…"
					empty="No branch matches."
					className="font-mono"
					defaultOpen
					onOpenChange={(open) => !open && setChanging(false)}
				/>
			</Field>
		);
	return (
		<FieldDescription data-starts-from className="flex items-center gap-1.5">
			<GitBranchIcon aria-hidden className="size-3.5 shrink-0" />
			<code className="font-mono">{branch}</code>
			<Button variant="link" className="h-auto p-0 text-sm" disabled={disabled || branches.length === 0} onClick={() => setChanging(true)}>
				Change
			</Button>
		</FieldDescription>
	);
};

/**
 * Starting a prototype: a name, what it should explore, where it starts (a repository, and a branch in it, which it
 * reads to look like the product), and, if it is a new project, the folder it goes in, in that order. Creating it makes
 * the record; the agent and the preview follow on their own. Codebase work is not started here: that is done in the codebase, and a prototype moves into it with
 * Build in the codebase.
 *
 * The repositories are the ones GitHub shows the signed-in person, so the list follows their permissions;
 * both lists can be searched by typing. The repository starts on the one last used, and the branch on the one
 * it has checked out, said under the repository with a Change, so the usual case is two choices already made.
 * Work is built in a clone, so a repository with none on this machine is cloned from here: where it will go is shown, and can be changed, before
 * anything is downloaded, and once it is cloned the form carries on with it, and only then asks what it starts from.
 */
export const NewWork = ({
	open,
	onClose,
	checkout,
	onChoose,
	onCheckout,
	onCreated,
	folders = [],
	folder = null,
}: {
	open: boolean;
	onClose: () => void;
	checkout: Checkout | null;
	onChoose: () => void;
	/** A repository picked from the list, now accepted. */
	onCheckout: (checkout: Checkout) => void;
	onCreated: (created: Created) => void;
	/** The folders in use, to put the new project in one (the folders plan), and the one being viewed, which it starts on. */
	folders?: string[];
	folder?: string | null;
}) => {
	const [name, setName] = useState('');
	const [task, setTask] = useState('');
	// The folder the new project goes in: none while a new one is being named, until it has a name.
	const [inFolder, setInFolder] = useState<FolderPick>(pickOf(folder ?? null));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [repos, setRepos] = useState<Repository[]>([]);
	const [reach, setReach] = useState<RepositoryReach | null>(null);
	const [readiness, setReadiness] = useState<AgentReadiness>({ state: 'unknown' });
	// The repository chosen, by name. Null means the one in use.
	const [picked, setPicked] = useState<string | null>(null);
	const [branches, setBranches] = useState<string[]>([]);
	const [from, setFrom] = useState<string | null>(null);
	const id = slugify(name);
	const showRepos = (list: RepositoryList) => {
		setRepos(list.repositories);
		setReach(list.reach);
	};

	useEffect(() => {
		if (!open) return;
		setPicked(null);
		setInFolder(pickOf(folder ?? null));
		setError(null);
		void window.workspace.listRepositories().then((r) => r.ok && showRepos(r.value));
		// Asked now, not after the branch is made: an agent that cannot start would leave an empty iteration behind.
		void window.workspace.agentReadiness().then((r) => r.ok && setReadiness(r.value));
		// Only when it opens: the folder it starts in is the one shown then, and the person's choice after that.
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	// A new repository brings its own branches, and starts on the one it has checked out.
	useEffect(() => {
		setBranches([]);
		setFrom(checkout?.branch ?? null);
		if (!open || !checkout) return;
		let current = true;
		void window.workspace.listBaseBranches(checkout.root).then((r) => current && r.ok && setBranches(r.value));
		return () => {
			current = false;
		};
	}, [open, checkout?.root, checkout?.branch]); // eslint-disable-line react-hooks/exhaustive-deps

	// The one in use is always offered, even when it was opened by hand from somewhere discovery does not look.
	const choices: Repository[] =
		checkout && !repos.some((r) => r.root === checkout.root) ? [{ name: checkout.name, root: checkout.root }, ...repos] : repos;
	const inUse = choices.find((r) => r.root !== null && r.root === checkout?.root) ?? null;
	const chosen = (picked === null ? inUse : choices.find((r) => r.name === picked)) ?? null;
	// Chosen, and not the clone in use: either it is being switched to, or there is no clone to switch to.
	const elsewhere = chosen !== null && chosen.root !== checkout?.root;

	// A repository with no clone here: asked where it would go, and again when the clone folder is changed.
	const toClone = elsewhere && chosen?.root === null ? chosen.name : null;
	// Cloning it: what it would do, and, while it runs, how far it has got.
	const cloneState = useClone(toClone, setError);
	const cloning = cloneState.cloning;
	const clone = async () => {
		setError(null);
		const r = await cloneState.run(window.workspace.cloneRepository);
		// Stopped by closing the modal: nobody is there to be told it was stopped.
		if (closedWhileCloning.current) return void (closedWhileCloning.current = false);
		if (!r?.ok) return;
		// Found and accepted: the form carries on with it, and the list shows it as here now.
		onCheckout(r.value);
		setPicked(null);
		void window.workspace.listRepositories().then((l) => l.ok && showRepos(l.value));
	};
	// Closing while it clones stops the clone, which leaves nothing behind.
	const closedWhileCloning = useRef(false);
	const close = () => {
		if (busy) return;
		if (cloning !== null) {
			closedWhileCloning.current = true;
			void window.workspace.cancelClone();
		}
		// An install is left to finish: stopping npm part way leaves the packages half there.
		onClose();
	};

	// Building needs Claude Code; when it is plainly not ready, nothing is created.
	const blocked = readiness.state === 'missing' || readiness.state === 'signedOut';

	// Whether this repository can build a prototype here, asked as soon as there is one to ask about.
	const [prototype, setPrototype] = useState<PrototypeReadiness | null>(null);
	const askRoot = checkout && !elsewhere ? checkout.root : null;
	// Asked again once its packages are installed from here.
	const [installed, setInstalled] = useState(0);
	useEffect(() => {
		setPrototype(null);
		if (!open || askRoot === null) return;
		let current = true;
		void window.workspace.prototypeReadiness(askRoot).then((r) => current && r.ok && setPrototype(r.value));
		return () => {
			current = false;
		};
	}, [open, askRoot, installed]);

	// Installing its packages, with the command the repository declares: the last line it printed while it runs.
	const [installing, setInstalling] = useState<string | null>(null);
	useEffect(() => window.workspace.onInstallLine((line) => setInstalling((now) => (now === null ? null : line))), []);
	const install = async () => {
		if (askRoot === null) return;
		setError(null);
		setInstalling('Starting…');
		const r = await window.workspace.installPackages(askRoot);
		setInstalling(null);
		if (!r.ok) return setError(r.error);
		setInstalled((n) => n + 1);
	};
	// Nothing else decides this: no repository, or one without its packages, cannot make a prototype.
	const prototypeBlocked = askRoot === null || (prototype !== null && !prototype.ready);

	const pickRepo = async (repoName: string) => {
		const repo = choices.find((r) => r.name === repoName);
		if (!repo) return;
		setPicked(repo.name);
		setError(null);
		if (repo.root === null || repo.root === checkout?.root) return;
		const r = await window.workspace.useCheckout(repo.root);
		if (r.ok) {
			onCheckout(r.value);
			setPicked(null);
		} else setError(r.error);
	};

	const create = async () => {
		if (!id || !task.trim()) return;
		setBusy(true);
		setError(null);
		const r = await window.workspace.createPrototype(
			id,
			name.trim(),
			task.trim(),
			checkout && !elsewhere && from ? { root: checkout.root, branch: from } : undefined,
			pickedFolder(inFolder),
		);
		setBusy(false);
		if (!r.ok) return setError(r.error);
		const iteration = freshIteration(r.value);
		onCreated({
			project: { id, title: name.trim(), folder: pickedFolder(inFolder), records: [], iterations: [iteration], people: [] },
			iteration,
			task: task.trim(),
		});
		setName('');
		setTask('');
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
				<DialogHeader>
					<DialogTitle>New prototype</DialogTitle>
					<DialogDescription>{ABOUT}</DialogDescription>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-4">
					<Field>
						<FieldLabel htmlFor="new-work-name">Name</FieldLabel>
						<Input id="new-work-name" placeholder="Users — inactivity signal" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
					</Field>
					<Field>
						<FieldLabel htmlFor="new-work-task">What should it explore?</FieldLabel>
						<Textarea
							id="new-work-task"
							rows={4}
							value={task}
							onChange={(e) => setTask(e.target.value)}
							placeholder="A users list that flags people who have not signed in for 90 days."
						/>
					</Field>
					{checkout || choices.length > 0 ? (
						<Field>
							<FieldLabel htmlFor="new-work-repo">Repository</FieldLabel>
							<SearchSelect
								id="new-work-repo"
								items={choices.map((r) => r.name)}
								value={chosen?.name ?? null}
								onChange={(v) => void pickRepo(v)}
								placeholder="Choose a repository"
								search="Search repositories…"
								empty="No repository matches."
								disabled={busy || cloning !== null}
							/>
							<RepositoryReachNote reach={reach} />
							{toClone !== null && <CloneHere clone={cloneState} onClone={() => void clone()} />}
							{/* After the clone, not before: there is nothing to start from until it is here. */}
							{toClone === null && !elsewhere && from !== null && <StartsFrom branch={from} branches={branches} onChange={setFrom} disabled={busy} />}
						</Field>
					) : (
						<Alert>
							<InfoIcon />
							<AlertTitle>No product repository found</AlertTitle>
							<AlertDescription>DSNR could not find a Flock product repository on this machine.</AlertDescription>
							<AlertAction>
								<Button variant="outline" onClick={onChoose}>
									Find it
								</Button>
							</AlertAction>
						</Alert>
					)}
					<FolderField
						id="new-work-folder"
						label="Folder (optional)"
						folders={folders}
						value={pickedFolder(inFolder)}
						onChange={setInFolder}
						disabled={busy}
					/>
					{prototype && !prototype.ready && (
						<Alert variant="warning">
							<AlertTitle>
								{prototype.why === 'not-installed' ? "The real components aren't installed here" : 'The page builder is missing'}
							</AlertTitle>
							<AlertDescription>
								{prototype.why === 'not-installed' && prototype.canInstall ? (
									<div className="flex flex-col items-start gap-3">
										<span>
											A prototype is built from {prototype.designSystem}, and {prototype.repository}'s packages are not installed on this machine yet.
										</span>
										{installing === null ? (
											<Button onClick={() => void install()}>Install packages</Button>
										) : (
											<Working text={installing} onStop={() => void window.workspace.cancelInstall()} />
										)}
									</div>
								) : prototype.why === 'not-installed' ? (
									<>
										A prototype is built from {prototype.designSystem}, and it is not installed in {prototype.repository} on this machine. Run{' '}
										<code>npm ci</code> in it (this needs access to the private packages), then open this again.
									</>
								) : (
									'DSNR cannot build pages on this machine. Reinstall the app and try again.'
								)}
							</AlertDescription>
						</Alert>
					)}
					{readiness.state === 'missing' && (
						<Alert variant="warning">
							<AlertTitle>Claude Code is not installed</AlertTitle>
							<AlertDescription>
								New work is built by Claude Code on this machine. Install it from{' '}
								<a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
									claude.com/claude-code
								</a>
								, sign in, then open this again.
							</AlertDescription>
						</Alert>
					)}
					{readiness.state === 'signedOut' && (
						<Alert variant="warning">
							<AlertTitle>Claude Code is not signed in</AlertTitle>
							<AlertDescription>
								Sign in with your Claude account, in your editor's Claude panel or by running <code>claude</code> in a terminal. Then open this again.
							</AlertDescription>
						</Alert>
					)}
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</DialogBody>
				<DialogFooter>
					<CancelButton onClick={close} disabled={busy} />
					<Button
						onClick={() => void create()}
						disabled={busy || blocked || prototypeBlocked || !id || !task.trim() || !checkout || elsewhere || !from}
					>
						{busy ? 'Creating…' : 'Create prototype'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
