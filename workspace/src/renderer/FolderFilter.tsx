import { ChoiceMenu } from './ChoiceMenu';

/** The menu's word for each choice that is not a folder; a folder is its own name, after `folder:` so no name is taken for one. */
const ALL = 'all';
const NONE = 'none';

/**
 * Which folder the Projects screen shows (the folders plan): all of them, one, or the projects in none, which is offered
 * only when some project is in none. `undefined` is all, `null` is none, a name is that folder.
 */
export const FolderFilter = ({
	folders,
	unfiled,
	folder,
	onChange,
}: {
	folders: string[];
	unfiled: boolean;
	folder: string | null | undefined;
	onChange: (folder: string | null | undefined) => void;
}) => (
	<ChoiceMenu
		name="Folder"
		value={folder === undefined ? ALL : folder === null ? NONE : `folder:${folder}`}
		choices={[
			{ value: ALL, label: 'All folders' },
			...folders.map((f) => ({ value: `folder:${f}`, label: f })),
			...(unfiled ? [{ value: NONE, label: 'No folder' }] : []),
		]}
		onChange={(v) => onChange(v === ALL ? undefined : v === NONE ? null : v.slice('folder:'.length))}
	/>
);
