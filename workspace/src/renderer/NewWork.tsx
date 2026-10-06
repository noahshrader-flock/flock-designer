import { useEffect, useState } from 'react';
import type { Checkout, CheckoutSuggestion, IterationKind, Project, ProjectIteration } from '../shared/contract';
import { slugify } from '../shared/projects';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';

export interface Created {
	project: Project;
	iteration: ProjectIteration;
	task: string;
}

/** The repository picker's last entry, which opens a folder picker instead of choosing a repository. */
const OTHER = '\u0000other';

/**
 * Starting something new: where it starts (a repository on this machine, and a branch in it), a name, and
 * what it should explore. Creating it makes the branch and the record; the agent and the preview follow on
 * their own.
 *
 * The repository starts on the one last used, and the branch on the one it has checked out, so the usual
 * case is two choices already made.
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
	const [name, setName] = useState('');
	const [task, setTask] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [repos, setRepos] = useState<CheckoutSuggestion[]>([]);
	const [branches, setBranches] = useState<string[]>([]);
	const [from, setFrom] = useState<string | null>(null);
	const id = slugify(name);

	useEffect(() => {
		if (!open) return;
		void window.workspace.listCheckouts().then((r) => r.ok && setRepos(r.value));
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
	const choices = checkout && !repos.some((r) => r.root === checkout.root) ? [{ root: checkout.root, name: checkout.name }, ...repos] : repos;

	const pickRepo = async (root: string) => {
		if (root === OTHER) return onChoose();
		setError(null);
		const r = await window.workspace.useCheckout(root);
		if (r.ok) onCheckout(r.value);
		else setError(r.error);
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
					<DialogTitle>New prototype</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					{checkout || choices.length > 0 ? (
						<>
							<div className="flex flex-col gap-2">
								<Label htmlFor="new-work-repo">Repository</Label>
								<Select value={checkout?.root ?? ''} onValueChange={(v) => void pickRepo(v)} disabled={busy}>
									<SelectTrigger id="new-work-repo" className="w-full">
										<SelectValue placeholder="Choose a repository" />
									</SelectTrigger>
									<SelectContent>
										{choices.map((r) => (
											<SelectItem key={r.root} value={r.root}>
												{r.name}
											</SelectItem>
										))}
										<SelectSeparator />
										<SelectItem value={OTHER}>Another folder…</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="new-work-from">Starts from</Label>
								<Select value={from ?? ''} onValueChange={setFrom} disabled={busy || !checkout || branches.length === 0}>
									<SelectTrigger id="new-work-from" className="w-full font-mono">
										<SelectValue placeholder={checkout ? 'Choose a branch' : 'Choose a repository first'} />
									</SelectTrigger>
									<SelectContent>
										{branches.map((b) => (
											<SelectItem key={b} value={b} className="font-mono">
												{b}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
					<Button variant="secondary" onClick={() => void create('codebase')} disabled={busy || !checkout || !from || !id || !task.trim()}>
						In the codebase
					</Button>
					<Button onClick={() => void create('prototype')} disabled={busy || !checkout || !from || !id || !task.trim()}>
						{busy ? 'Creating…' : 'Create prototype'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
