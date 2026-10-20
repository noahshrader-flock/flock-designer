import { type FormEvent, useState } from 'react';
import { namesProject, projectTitle, sameFolder } from '../../src/shared/brief';
import type { Project } from '../../src/shared/domain/projects';
import { plural } from '../../src/shared/plural';
import { openCommentsOf } from '../../src/shared/projectList';
import { slugify } from '../../src/shared/validate';
import { workOf } from '../../src/shared/work';
import { Button } from '../../src/ui/Button';
import { Dialog, DialogButtons } from '../../src/ui/Dialog';
import { Field, TextArea, TextInput } from '../../src/ui/Field';
import { FolderField, type FolderPick, folderOf, isChosen, pickOf } from './FolderField';
import { workspace } from './host';
import { Message } from '../../src/ui/Message';
import { AgentInUse } from './AgentInUse';
import { useAction } from './hooks/useAction';

interface NewPrototypeAnswers {
	title: string;
	task: string;
	folder: string | null;
}

export const NewPrototypeDialog = ({
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
				<Field label="What should it explore?">
					{(control) => (
						<TextArea
							control={control}
							value={task}
							onChange={setTask}
							placeholder="A history of alerts, filterable by camera and by day. Paste a Figma link to one screen if you have one, and drag screenshots into the conversation before you press Enter."
							rows={5}
						/>
					)}
				</Field>
				<FolderField folders={folders} pick={pick} onPick={setPick} />
				<AgentInUse />
				<DialogButtons>
					<Button type="submit" disabled={!ready}>
						Create prototype
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};

export const AssignFolderDialog = ({
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
	const { busy, error, run } = useAction();
	const same = project.folder === null ? pick.kind === 'none' : pick.kind !== 'none' && sameFolder(folderOf(pick) ?? '', project.folder);
	const assign = async (e: FormEvent) => {
		e.preventDefault();
		if (same || !isChosen(pick)) return;
		await run(
			() => workspace().assignFolder(project.id, folderOf(pick)),
			() => {
				onAssigned();
				onClose();
			},
		);
	};
	return (
		<Dialog title="Assign folder" onClose={onClose}>
			<form onSubmit={(e) => void assign(e)}>
				<Message>
					Which folder <strong>{project.title}</strong> is in.
				</Message>
				<FolderField folders={folders} pick={pick} onPick={setPick} />
				<Message tone="error">{error}</Message>
				<DialogButtons>
					<Button type="submit" disabled={same || !isChosen(pick) || busy}>
						Assign
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};

/** Only the name people see: the project's id, which its links, branches and comments are named by, stays as it was. */
export const RenameDialog = ({ project, onRenamed, onClose }: { project: Project; onRenamed: () => void; onClose: () => void }) => {
	const [title, setTitle] = useState(project.title);
	const { busy, error, run } = useAction();
	const name = projectTitle(title);
	const ready = name !== null && name !== project.title && !busy;
	const rename = async (e: FormEvent) => {
		e.preventDefault();
		if (!ready) return;
		await run(
			() => workspace().renameProject(project.id, name),
			() => {
				onRenamed();
				onClose();
			},
		);
	};
	return (
		<Dialog title="Rename" onClose={onClose}>
			<form onSubmit={(e) => void rename(e)}>
				<Field label="Name">{(control) => <TextInput control={control} value={title} onChange={setTitle} />}</Field>
				<Message tone="error">{error}</Message>
				<DialogButtons>
					<Button type="submit" disabled={!ready}>
						Save
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};

/** For everyone, with every version, so its name is typed first; the core checks the name again. */
export const DeleteProjectDialog = ({ project, onDeleted, onClose }: { project: Project; onDeleted: () => void; onClose: () => void }) => {
	const [typed, setTyped] = useState('');
	const { busy, error, run } = useAction();
	const ready = namesProject(typed, project.title) && !busy;
	const versions = workOf(project.work, 'prototype').length;
	const open = openCommentsOf(project.work);
	const codebase = workOf(project.work, 'codebase')[0];
	const goes = `This deletes ${project.title}${versions > 0 ? ` and its ${plural(versions, 'version')}` : ''} for everyone, with every page, picture and record of it, and takes it off the published site.`;
	const comments = open > 0 ? ` ${plural(open, 'open comment')} ${open === 1 ? 'is' : 'are'} on it.` : '';
	const code = codebase ? `, and its codebase branch ${codebase.branch}${codebase.pullRequest ? ' and pull request stay' : ' stays'}` : '';
	const remove = async (e: FormEvent) => {
		e.preventDefault();
		if (!ready) return;
		await run(
			() => workspace().deleteProject(project.id, typed),
			() => {
				onDeleted();
				onClose();
			},
		);
	};
	return (
		<Dialog title="Delete project" onClose={onClose}>
			<form onSubmit={(e) => void remove(e)}>
				<Message tone="warning">{`${goes}${comments}`}</Message>
				<Message>{`Its comments stay on GitHub${code}. What it was stays in the design repository’s history.`}</Message>
				<Field label={`Type ${project.title} to delete it`}>{(control) => <TextInput control={control} value={typed} onChange={setTyped} />}</Field>
				<Message tone="error">{error}</Message>
				<DialogButtons>
					<Button type="submit" variant="danger" disabled={!ready}>
						Delete project
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};
