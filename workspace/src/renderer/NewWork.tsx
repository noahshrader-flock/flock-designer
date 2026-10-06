import { useState } from 'react';
import type { Checkout, IterationKind, Project, ProjectIteration } from '../shared/contract';
import { slugify } from '../shared/projects';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

export interface Created {
	project: Project;
	iteration: ProjectIteration;
	task: string;
}

/**
 * Starting something new: a name, and what it should explore. Creating it makes
 * the branch and the record; the agent and the preview follow on their own.
 */
export const NewWork = ({
	open,
	onClose,
	checkout,
	onChoose,
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	checkout: Checkout | null;
	onChoose: () => void;
	onCreated: (created: Created) => void;
}) => {
	const [name, setName] = useState('');
	const [task, setTask] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const id = slugify(name);

	const create = async (kind: IterationKind) => {
		if (!checkout || !id || !task.trim()) return;
		setBusy(true);
		setError(null);
		const r = await window.workspace.createIteration(checkout.root, id, task.trim().split('\n')[0] ?? '', kind);
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
					{checkout ? (
						<p className="text-muted-foreground text-sm">
							In {checkout.name}, on {checkout.branch ?? 'a detached HEAD'}. The new branch starts from there.{' '}
							<button type="button" className="text-primary cursor-pointer underline underline-offset-4" onClick={onChoose}>
								Change
							</button>
						</p>
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
						<label htmlFor="new-work-name" className="text-sm font-medium">
							Name
						</label>
						{/* eslint-disable-next-line jsx-a11y/no-autofocus */}
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
						<label htmlFor="new-work-task" className="text-sm font-medium">
							What should it explore?
						</label>
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
					<Button variant="secondary" onClick={() => void create('codebase')} disabled={busy || !checkout || !id || !task.trim()}>
						In the codebase
					</Button>
					<Button onClick={() => void create('prototype')} disabled={busy || !checkout || !id || !task.trim()}>
						{busy ? 'Creating…' : 'Create prototype'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
