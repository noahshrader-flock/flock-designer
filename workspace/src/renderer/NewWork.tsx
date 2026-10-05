import {
	FSAlert,
	FSButton,
	FSDialog,
	FSDialogActions,
	FSDialogContent,
	FSDialogTitle,
	FSLink,
	FSStack,
	FSTextField,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import { useState } from 'react';
import type { Checkout, IterationKind, Project, ProjectIteration } from '../shared/contract';
import { slugify } from '../shared/projects';

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
			commit: r.value.commit,
			contributors: r.value.contributors ?? [],
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
		<FSDialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
			<FSDialogTitle>New prototype</FSDialogTitle>
			<FSDialogContent>
				<FSStack spacing={2} sx={{ pt: 1 }}>
					{checkout ? (
						<FSTypography variant="body2" color="text.secondary">
							In {checkout.name}, on {checkout.branch ?? 'a detached HEAD'}. The new branch starts from there.{' '}
							<FSLink component="button" onClick={onChoose}>
								Change
							</FSLink>
						</FSTypography>
					) : (
						<FSAlert severity="info" action={<FSButton size="md" onClick={onChoose}>Find it</FSButton>}>
							Flock Designer could not find a Flock product repository on this machine.
						</FSAlert>
					)}
					<FSTextField label="Name" placeholder="Users — inactivity signal" value={name} onChange={setName} autoFocus />
					<FSTypography variant="caption" color="text.secondary">
						{id ? `Project id: ${id}` : 'The id is made from the name.'}
					</FSTypography>
					<FSTextField
						label="What should it explore?"
						multiline
						minRows={4}
						value={task}
						onChange={setTask}
						placeholder="A users list that flags people who have not signed in for 90 days."
					/>
					{checkout && checkout.clean === false && (
						<FSAlert severity="warning">There are uncommitted changes in this checkout. Commit or set them aside first.</FSAlert>
					)}
					{error && <FSAlert severity="error">{error}</FSAlert>}
				</FSStack>
			</FSDialogContent>
			<FSDialogActions>
				<FSButton size="md" variant="secondary" onClick={onClose} disabled={busy}>
					Cancel
				</FSButton>
				<FSButton size="md" variant="secondary" onClick={() => void create('codebase')} disabled={busy || !checkout || !id || !task.trim()}>
					In the codebase
				</FSButton>
				<FSButton size="md" onClick={() => void create('prototype')} disabled={busy || !checkout || !id || !task.trim()}>
					{busy ? 'Creating…' : 'Create prototype'}
				</FSButton>
			</FSDialogActions>
		</FSDialog>
	);
};
