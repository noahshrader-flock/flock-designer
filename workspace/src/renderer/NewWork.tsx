import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentReadiness, Checkout, ClonePlan, CloneProgress, IterationKind, Project, ProjectIteration, PrototypeReadiness, Repository } from '../shared/contract';
import { freshIteration, slugify } from '../shared/projects';
import { SearchSelect } from './SearchSelect';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Spinner } from './ui/spinner';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';

/** What New makes. The older numbered prototype branches still open, but are no longer offered here. */
const KINDS: { kind: IterationKind; label: string; about: string }[] = [
	{
		kind: 'prototype',
		label: 'Prototype',
		about:
			"One page built from the product's real components and shared as a single file. Needs the repository and its packages installed on this machine. Nothing runs and nothing in the codebase changes, so no environment setup.",
	},
	{
		kind: 'codebase',
		label: 'Codebase work',
		about: "Real work on the project's own feature branch, started from the branch below. Needs the full setup: packages, environment variables, and the app able to run.",
	},
];

export interface Created {
	project: Project;
	iteration: ProjectIteration;
	task: string;
}

/**
 * Starting something new: what kind (a prototype or codebase work, switched at the top), where
 * it starts (a repository, and a branch in it), a name, and what it should explore. Both kinds start from
 * the same two choices: codebase work branches from them, a prototype reads them to look like
 * the product. Creating it makes the record (and the branch); the agent and the preview follow on their own.
 *
 * The repositories are the ones GitHub shows the signed-in person, so the list follows their permissions;
 * both lists can be searched by typing. The repository starts on the one last used, and the branch on the one
 * it has checked out, so the usual case is two choices already made. Work is built in a clone, so a
 * repository with none on this machine is cloned from here: where it will go is shown, and can be changed, before
 * anything is downloaded, and once it is cloned the form carries on with it.
 */
export const NewWork = ({
	open,
	onClose,
	checkout,
	onChoose,
	onCheckout,
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	checkout: Checkout | null;
	onChoose: () => void;
	/** A repository picked from the list, now accepted. */
	onCheckout: (checkout: Checkout) => void;
	onCreated: (created: Created) => void;
}) => {
	// Kept between openings, so someone who makes one kind is not switched back each time.
	const [kind, setKind] = useState<IterationKind>('prototype');
	const [name, setName] = useState('');
	const [task, setTask] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [repos, setRepos] = useState<Repository[]>([]);
	const [readiness, setReadiness] = useState<AgentReadiness>({ state: 'unknown' });
	// The repository chosen, by name. Null means the one in use.
	const [picked, setPicked] = useState<string | null>(null);
	const [branches, setBranches] = useState<string[]>([]);
	const [from, setFrom] = useState<string | null>(null);
	const id = slugify(name);
	// Cloning a repository with no clone here: what it would do, and, while it runs, how far it has got.
	const [clonePlan, setClonePlan] = useState<ClonePlan | null>(null);
	const [cloning, setCloning] = useState<CloneProgress | 'starting' | null>(null);

	useEffect(() => {
		if (!open) return;
		setPicked(null);
		setError(null);
		void window.workspace.listRepositories().then((r) => r.ok && setRepos(r.value));
		// Asked now, not after the branch is made: an agent that cannot start would leave an empty iteration behind.
		void window.workspace.agentReadiness().then((r) => r.ok && setReadiness(r.value));
	}, [open]);

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
	const askPlan = useCallback(() => {
		setClonePlan(null);
		if (toClone === null) return;
		void window.workspace.clonePlan(toClone).then((r) => (r.ok ? setClonePlan(r.value) : setError(r.error)));
	}, [toClone]);
	useEffect(askPlan, [askPlan]);
	// Only while one runs: a line arriving after it ended does not bring it back.
	useEffect(() => window.workspace.onCloneProgress((p) => setCloning((c) => (c === null ? null : p))), []);

	const changeFolder = async () => {
		const r = await window.workspace.chooseCloneFolder();
		if (!r.ok) return setError(r.error);
		if (r.value !== null) askPlan();
	};
	const clone = async () => {
		if (toClone === null) return;
		setError(null);
		setCloning('starting');
		const r = await window.workspace.cloneRepository(toClone);
		setCloning(null);
		// Stopped by closing the modal: nobody is there to be told it was stopped.
		if (closedWhileCloning.current) return void (closedWhileCloning.current = false);
		if (!r.ok) return setError(r.error);
		// Found and accepted: the form carries on with it, and the list shows it as here now.
		onCheckout(r.value);
		setPicked(null);
		void window.workspace.listRepositories().then((l) => l.ok && setRepos(l.value));
	};
	// Closing while it clones stops the clone, which leaves nothing behind.
	const closedWhileCloning = useRef(false);
	const close = () => {
		if (busy) return;
		if (cloning !== null) {
			closedWhileCloning.current = true;
			void window.workspace.cancelClone();
		}
		onClose();
	};

	// Building needs Claude Code; when it is plainly not ready, nothing is created.
	const blocked = readiness.state === 'missing' || readiness.state === 'signedOut';

	// Whether this repository can build a prototype here, asked as soon as there is one to ask about.
	const [prototype, setPrototype] = useState<PrototypeReadiness | null>(null);
	const askRoot = checkout && !elsewhere ? checkout.root : null;
	useEffect(() => {
		setPrototype(null);
		if (!open || kind !== 'prototype' || askRoot === null) return;
		let current = true;
		void window.workspace.prototypeReadiness(askRoot).then((r) => current && r.ok && setPrototype(r.value));
		return () => {
			current = false;
		};
	}, [open, kind, askRoot]);
	// Nothing else decides this: no repository, or one without its packages, cannot make a prototype.
	const prototypeBlocked = kind === 'prototype' && (askRoot === null || (prototype !== null && !prototype.ready));

	const pickRepo = async (name: string) => {
		const repo = choices.find((r) => r.name === name);
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
		if (kind !== 'prototype' && !checkout) return;
		setBusy(true);
		setError(null);
		const note = task.trim().split('\n')[0] ?? '';
		const r =
			kind === 'prototype'
				? await window.workspace.createPrototype(id, name.trim(), task.trim(), checkout && !elsewhere && from ? { root: checkout.root, branch: from } : undefined)
				: await window.workspace.createIteration((checkout as Checkout).root, id, note, from ?? undefined);
		setBusy(false);
		if (!r.ok) return setError(r.error);
		const iteration = freshIteration(r.value);
		onCreated({
			project: { id, title: name.trim(), records: [], iterations: [iteration], people: [], openComments: 0 },
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
					<DialogTitle>New</DialogTitle>
				</DialogHeader>
				{/* With the title: switching kind must stay in reach however far the form below has scrolled. */}
				<div className="flex flex-col gap-4">
					<Tabs value={kind} onValueChange={(v) => setKind(v as IterationKind)}>
						<TabsList className="w-full">
							{KINDS.map((k) => (
								<TabsTrigger key={k.kind} value={k.kind} disabled={busy}>
									{k.label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
					<p className="text-muted-foreground text-sm">{KINDS.find((k) => k.kind === kind)?.about}</p>
				</div>
				<DialogBody className="flex flex-col gap-4">
					{checkout || choices.length > 0 ? (
						<>
							<div className="flex flex-col gap-2">
								<Label htmlFor="new-work-repo">Repository</Label>
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
								{toClone !== null && clonePlan && (
									<CloneHere
										plan={clonePlan}
										cloning={cloning}
										onChangeFolder={() => void changeFolder()}
										onClone={() => void clone()}
										onStop={() => void window.workspace.cancelClone()}
									/>
								)}
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="new-work-from">Starts from</Label>
								<SearchSelect
									id="new-work-from"
									items={branches}
									value={elsewhere ? null : from}
									onChange={setFrom}
									placeholder={checkout && !elsewhere ? 'Choose a branch' : 'Choose a repository first'}
									search="Search branches…"
									empty="No branch matches."
									disabled={busy || elsewhere || branches.length === 0}
									className="font-mono"
								/>
							</div>
						</>
					) : (
						<Alert>
							<AlertDescription className="flex items-center justify-between gap-4">
								<span>Flock Designer could not find a Flock product repository on this machine.</span>
								<Button size="sm" onClick={onChoose}>
									Find it
								</Button>
							</AlertDescription>
						</Alert>
					)}
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-work-name">Name</Label>
						<Input
							id="new-work-name"
							placeholder="Users — inactivity signal"
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoFocus
						/>
						<p className="text-muted-foreground text-xs">{id ? `Project id: ${id}` : 'The id is made from the name.'}</p>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="new-work-task">What should it explore?</Label>
						<Textarea
							id="new-work-task"
							rows={4}
							value={task}
							onChange={(e) => setTask(e.target.value)}
							placeholder="A users list that flags people who have not signed in for 90 days."
						/>
					</div>
					{kind === 'prototype' && prototype && !prototype.ready && (
						<Alert variant="warning">
							<AlertTitle>{prototype.why === 'not-installed' ? "The real components aren't installed here" : 'The page builder is missing'}</AlertTitle>
							<AlertDescription>
								{prototype.why === 'not-installed' ? (
									<>
										A prototype is built from {prototype.designSystem}, and it is not installed in {prototype.repository} on this machine. Run{' '}
										<code>npm ci</code> in it (this needs access to the private packages), then open this again.
									</>
								) : (
									'Flock Designer cannot build pages on this machine. Reinstall the app and try again.'
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
					{kind !== 'prototype' && checkout && checkout.clean === false && (
						<Alert variant="warning">
							<AlertDescription>There are uncommitted changes in this checkout. Commit or set them aside first.</AlertDescription>
						</Alert>
					)}
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</DialogBody>
				<DialogFooter>
					<Button variant="secondary" onClick={close} disabled={busy}>
						Cancel
					</Button>
					<Button
						onClick={() => void create()}
						disabled={busy || blocked || prototypeBlocked || !id || !task.trim() || !checkout || elsewhere || !from}
					>
						{busy ? 'Creating…' : kind === 'prototype' ? 'Create prototype' : 'Start codebase work'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

/**
 * A repository with no clone on this machine, cloned from the New modal: one button, and under it where it goes (with
 * the design repository, when that is missing too) and a way to change that. Nothing is downloaded until it is
 * pressed; while it runs it says how far it has got, and can be stopped.
 */
const CloneHere = ({
	plan,
	cloning,
	onChangeFolder,
	onClone,
	onStop,
}: {
	plan: ClonePlan;
	cloning: CloneProgress | 'starting' | null;
	onChangeFolder: () => void;
	onClone: () => void;
	onStop: () => void;
}) => {
	const { place, design } = plan;
	const taken = [place, design].find((p) => p?.state === 'taken');
	const name = plan.repository.split('/')[1];
	if (cloning !== null) {
		return (
			<div className="flex items-center gap-2 text-xs">
				<Spinner />
				<span className="grow">
					{cloning === 'starting'
						? `Cloning ${name}…`
						: `Cloning ${cloning.repository.split('/')[1]}: ${cloning.step}${cloning.percent === null ? '' : ` ${cloning.percent}%`}`}
				</span>
				<Button size="sm" variant="outline" onClick={onStop}>
					Stop
				</Button>
			</div>
		);
	}
	return (
		<div className="flex flex-col items-start gap-2">
			{taken?.state === 'taken' && (
				<Alert variant="warning">
					<AlertDescription>{taken.why} Nothing is cloned over it: change where clones go, or move it.</AlertDescription>
				</Alert>
			)}
			<Button size="sm" onClick={onClone} disabled={taken !== undefined}>
				{place.state === 'cloned' ? 'Use it and continue' : 'Clone and continue'}
			</Button>
			<p className="text-muted-foreground text-xs">
				{place.state === 'cloned' ? 'Already in ' : 'Into '}
				<code className="break-all">{plan.where}</code>
				{design?.state === 'free' && (
					<>
						, with <code>flock-designer</code> beside it
					</>
				)}
				{' · '}
				<button type="button" className="text-primary underline underline-offset-4" onClick={onChangeFolder}>
					Change
				</button>
			</p>
		</div>
	);
};
