import { ALL_FOLDERS, type FolderChoice } from '../shared/brief';
import { ChoiceMenu } from './ChoiceMenu';

/** The menu's word for each choice that is not a folder; a folder is its own name, after `folder:` so no name is taken for one. */
const ALL = 'all';
const NONE = 'none';

/**
 * Which folder the Projects screen shows (the folders plan): all of them, one, or the projects in none, which is offered
 * only when some project is in none.
 */
export const FolderFilter = ({
	folders,
	unfiled,
	folder,
	onChange,
}: {
	folders: string[];
	unfiled: boolean;
	folder: FolderChoice;
	onChange: (folder: FolderChoice) => void;
}) => (
	<ChoiceMenu
		name="Folder"
		value={folder.kind === 'all' ? ALL : folder.kind === 'none' ? NONE : `folder:${folder.name}`}
		choices={[
			{ value: ALL, label: 'All folders' },
			...folders.map((f) => ({ value: `folder:${f}`, label: f })),
			...(unfiled ? [{ value: NONE, label: 'No folder' }] : []),
		]}
		onChange={(v) => onChange(v === ALL ? ALL_FOLDERS : v === NONE ? { kind: 'none' } : { kind: 'folder', name: v.slice('folder:'.length) })}
	/>
);
