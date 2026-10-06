import { useEffect, useState } from 'react';
import type { AgentReadiness, Checkout, IterationKind, Project, ProjectIteration, Repository } from '../shared/contract';
import { slugify } from '../shared/projects';
import { SearchSelect } from './SearchSelect';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

export interface Created {
	project: Project;
	iteration: ProjectIteration;
	task: string;
}

/**
 * Starting something new: where it starts (a repository, and a branch in it), a name, and what it should
 * explore. Creating it makes the branch and the record; the agent and the preview follow on their own.
 *
 * The repositories are the ones GitHub shows the signed-in person, so the list follows their permissions;
 * both lists can be searched by typing. The repository starts on the one last used, and the branch on the one
 * it has checked out, so the usual case is two choices already made. Work is built in a clone, so a
 * repository with none on this machine says so instead of offering branches.
 */
export const NewWork = ({
	open,
	kind,
	onClose,
	checkout,
	onChoose,
	onCheckout,
	onCreated,
}: {
	open: boolean;
	/** What is being made, chosen from the New menu before this opened. */
	kind: IterationKind;
	onClose: () => void;
	checkout: Checkout | null;
	onChoose: () => void;
	/** A repository picked from the list, now accepted. */
	onCheckout: (checkout: Checkout) => void;
	onCreated: (created: Created) => void;
}) => {
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

	useEffect(() => {
		if (!open) return;
		setPicked(null);
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

	// Building needs Claude Code; when it is plainly not ready, nothing is created.
	const blocked = readiness.state === 'missing' || readiness.state === 'signedOut';

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

	const create = async (kind: IterationKind) => {
		if (!checkout || !id || !task.trim()) return;
		setBusy(true);
		setError(null);
		const r = await window.workspace.createIteration(checkout.root, id, task.trim().split('\n')[0] ?? '', kind, from ?? undefined);
		setBusy(false);
		if (!r.ok) return setError(r.error);
		const iteration: ProjectIteration = {
			name: r.value.name,
			branch: r.value.branch,
			issueNumber: null,
			previewUrl: null,
			// Nothing is built yet, so there is nowhere to land: whoever builds it records the route.
			route: null,
			commit: r.value.commit,
			contributors: r.value.contributors ?? [],
			createdAt: r.value.createdAt,
		};
		onCreated({
			project: { id, title: name.trim(), records: [], iterations: [iteration], people: [], openComments: 0 },
			iteration,
			task: task.trim(),
		});
		setName('');
		setTask('');
	};

	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent className="sm:max-w-xl" showCloseButton={!busy}>
				<DialogHeader>
					<DialogTitle>{kind === 'codebase' ? 'New in the codebase' : 'New prototype'}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
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
									disabled={busy}
								/>
								{elsewhere && chosen?.root === null && (
									<p className="text-muted-foreground text-xs">
										{chosen.name} is not on this machine, so there is nothing here to build it in. Clone it, then{' '}
										<button type="button" className="text-primary cursor-pointer underline underline-offset-4" onClick={onChoose}>
											point the app at it
										</button>
										.
									</p>
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
					{checkout && checkout.clean === false && (
						<Alert variant="warning">
							<AlertDescription>There are uncommitted changes in this checkout. Commit or set them aside first.</AlertDescription>
						</Alert>
					)}
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>
				<DialogFooter>
					<Button variant="secondary" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					<Button onClick={() => void create(kind)} disabled={busy || blocked || !checkout || elsewhere || !from || !id || !task.trim()}>
						{busy ? 'Creating…' : kind === 'codebase' ? 'Create in the codebase' : 'Create prototype'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
