import { type FormEvent, useState } from 'react';
import { sameFolder } from '../../src/shared/brief';
import type { Project } from '../../src/shared/domain/projects';
import { slugify } from '../../src/shared/validate';
import { Button } from './ui/Button';
import { Dialog, DialogButtons, ErrorLine } from './ui/Dialog';
import { Field, TextArea, TextInput } from './ui/Field';
import { FolderField, type FolderPick, folderOf, isChosen, pickOf } from './ui/FolderField';
import { workspace } from './host';

/** What a prototype is started from, as the extension takes it: its name, what it explores, and its folder. */
export interface NewPrototypeAnswers {
	title: string;
	task: string;
	folder: string | null;
}

/**
 * New prototype, as a dialog in the panel: a name, what it should explore (as many lines as it takes), and its folder.
 * Made once it has a name with a letter or a number in it and something to explore; what is asked is then the
 * extension's, which makes it and hands its building to Claude Code, as Build in the codebase is handed.
 */
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
				<Field label="What should it explore?" hint="Claude Code builds it from this, with the real design system, in this window.">
					{(control) => (
						<TextArea control={control} value={task} onChange={setTask} placeholder="A history of alerts, filterable by camera and by day" rows={5} />
					)}
				</Field>
				<FolderField folders={folders} pick={pick} onPick={setPick} />
				<DialogButtons onClose={onClose} close="Cancel">
					<Button type="submit" disabled={!ready}>
						Create prototype
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};

/**
 * Assign folder, as a dialog in the panel: the project's folder, with the one it is in chosen, to change or to take it
 * out of. Kept in its brief by the core; what the core says if it cannot is said in the dialog, which stays open.
 */
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
				<ErrorLine error={error} />
				<DialogButtons onClose={onClose} close="Cancel">
					<Button type="submit" disabled={same || !isChosen(pick) || busy}>
						Assign
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};
