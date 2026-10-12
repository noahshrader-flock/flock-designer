import { useEffect, useState } from 'react';
import { sameFolder } from '../shared/projects';
import { CancelButton } from './CancelButton';
import { FolderField, type FolderPick, pickOf, pickedFolder } from './FolderField';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

/**
 * Assign folder, from a project's More menu (the folders plan): the same folder field as New, on the folder the project
 * is in, and Assign, off until the choice is another folder (and a new one has a name). Assigning writes the project's
 * brief; a refusal is said here, and the modal stays.
 */
export const AssignFolder = ({
	open,
	onClose,
	projectId,
	folders,
	folder,
	onAssigned,
}: {
	open: boolean;
	onClose: () => void;
	projectId: string;
	folders: string[];
	folder: string | null;
	onAssigned: (folder: string | null) => void;
}) => {
	const [choice, setChoice] = useState<FolderPick>(pickOf(folder));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Each opening starts on the folder the project is in.
	useEffect(() => {
		if (!open) return;
		setChoice(pickOf(folder));
		setError(null);
	}, [open, folder]);
	const chosen = pickedFolder(choice);
	const same = choice.kind === 'naming' || (chosen === null ? folder === null : folder !== null && sameFolder(chosen, folder));
	const assign = async () => {
		if (choice.kind === 'naming') return;
		setBusy(true);
		setError(null);
		const r = await window.workspace.assignFolder(projectId, chosen);
		setBusy(false);
		if (!r.ok) return setError(r.error);
		onAssigned(chosen);
	};
	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent className="sm:max-w-md" showCloseButton={!busy}>
				<DialogHeader>
					<DialogTitle>Assign folder</DialogTitle>
				</DialogHeader>
				<DialogBody className="flex flex-col gap-4">
					<FolderField id="assign-folder" label="Folder" folders={folders} value={chosen} onChange={setChoice} disabled={busy} />
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</DialogBody>
				<DialogFooter>
					<CancelButton onClick={onClose} disabled={busy} />
					<Button onClick={() => void assign()} disabled={busy || same}>
						{busy ? 'Assigning…' : 'Assign'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
