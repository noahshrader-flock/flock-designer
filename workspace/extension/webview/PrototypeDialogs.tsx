import { type FormEvent, useState } from 'react';
import { namesPrototype, prototypeTitle, sameFolder } from '../../src/shared/brief';
import type { Prototype } from '../../src/shared/domain/prototypes';
import { plural } from '../../src/shared/plural';
import { openCommentsOf } from '../../src/shared/prototypeList';
import { onlyBuilding, savedVersions, workOf } from '../../src/shared/work';
import { Button } from '../../src/ui/Button';
import { Dialog, DialogButtons } from '../../src/ui/Dialog';
import { Field, TextInput } from '../../src/ui/Field';
import { FolderField, type FolderPick, folderOf, isChosen, pickOf } from './FolderField';
import { workspace } from './host';
import { Message } from '../../src/ui/Message';
import { useAction } from './hooks/useAction';

export const AssignFolderDialog = ({
	prototype,
	folders,
	onAssigned,
	onClose,
}: {
	prototype: Prototype;
	folders: string[];
	onAssigned: () => void;
	onClose: () => void;
}) => {
	// The folder it is in, as the list of folders spells it (they are one folder whatever the case), so it is one of the options.
	const [pick, setPick] = useState<FolderPick>(
		pickOf(prototype.folder === null ? null : (folders.find((f) => sameFolder(f, prototype.folder as string)) ?? prototype.folder)),
	);
	const { busy, error, run } = useAction();
	const same = prototype.folder === null ? pick.kind === 'none' : pick.kind !== 'none' && sameFolder(folderOf(pick) ?? '', prototype.folder);
	const assign = async (e: FormEvent) => {
		e.preventDefault();
		if (same || !isChosen(pick)) return;
		await run(
			() => workspace().assignFolder(prototype.id, folderOf(pick)),
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
					Which folder <strong>{prototype.title}</strong> is in.
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

/** Only the name people see: the prototype's id, which its links, branches and comments are named by, stays as it was. */
export const RenameDialog = ({ prototype, onRenamed, onClose }: { prototype: Prototype; onRenamed: () => void; onClose: () => void }) => {
	const [title, setTitle] = useState(prototype.title);
	const { busy, error, run } = useAction();
	const name = prototypeTitle(title);
	const ready = name !== null && name !== prototype.title && !busy;
	const rename = async (e: FormEvent) => {
		e.preventDefault();
		if (!ready) return;
		await run(
			() => workspace().renamePrototype(prototype.id, name),
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

/**
 * For everyone, with every version, so its name is typed first; the core checks the name again. Closed as it starts, since
 * its card says Deleting… until it is gone; one refused opens this again, with `error`.
 */
export const DeletePrototypeDialog = ({
	prototype,
	error,
	onDelete,
	onClose,
}: {
	prototype: Prototype;
	error: string | null;
	onDelete: (typed: string) => void;
	onClose: () => void;
}) => {
	const [typed, setTyped] = useState('');
	const ready = namesPrototype(typed, prototype.title);
	const versions = savedVersions(prototype.work).length;
	const open = openCommentsOf(prototype.work);
	const codebase = workOf(prototype.work, 'codebase')[0];
	const building = onlyBuilding(prototype);
	const goes = `This deletes ${prototype.title}${versions > 0 ? ` and its ${plural(versions, 'version')}` : ''} for everyone, with every page, picture and record of it, and takes it off the published site.`;
	const comments = open > 0 ? ` ${plural(open, 'open comment')} ${open === 1 ? 'is' : 'are'} on it.` : '';
	const code = codebase ? `, and its codebase branch ${codebase.branch}${codebase.pullRequest ? ' and pull request stay' : ' stays'}` : '';
	const remove = (e: FormEvent) => {
		e.preventDefault();
		if (!ready) return;
		onDelete(typed);
		onClose();
	};
	return (
		<Dialog title="Delete prototype" onClose={onClose}>
			<form onSubmit={remove}>
				{building ? (
					<Message tone="warning">{`This deletes ${prototype.title}. It was started here and not saved yet, so nothing of it was shared.`}</Message>
				) : (
					<>
						<Message tone="warning">{`${goes}${comments}`}</Message>
						<Message>{`Its review issues on GitHub are closed, with their comments kept there${code}. What it was stays in the design repository’s history.`}</Message>
					</>
				)}
				<Field label={`Type ${prototype.title} to delete it`}>{(control) => <TextInput control={control} value={typed} onChange={setTyped} />}</Field>
				<Message tone="error">{error}</Message>
				<DialogButtons>
					<Button type="submit" variant="danger" disabled={!ready}>
						Delete prototype
					</Button>
				</DialogButtons>
			</form>
		</Dialog>
	);
};
