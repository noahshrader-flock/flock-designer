import { Field, Select, TextInput } from '../../src/ui/Field';

/** A project's folder as chosen in a form: none, one there is, or a new one still being named. */
export type FolderPick = { kind: 'none' } | { kind: 'existing'; name: string } | { kind: 'new'; name: string };

const NONE = 'none';
const NEW = 'new';
const EXISTING = 'folder:';

/** The pick for a project that is in `folder` (null: in none). */
export const pickOf = (folder: string | null): FolderPick => (folder === null ? { kind: 'none' } : { kind: 'existing', name: folder });

/** The folder a pick names: its name, or null for none. A new folder not yet named is not a choice (`isChosen`). */
export const folderOf = (pick: FolderPick): string | null => (pick.kind === 'none' ? null : pick.name.trim());

/** Whether the pick is a choice a form may take: not a new folder with no name. */
export const isChosen = (pick: FolderPick): boolean => pick.kind !== 'new' || pick.name.trim() !== '';

/**
 * A project's folder, as a dropdown of those there are, none, and a new one, which asks its name beside it. The same in a
 * new prototype's dialog and in Assign folder, so a folder is chosen one way.
 */
export const FolderField = ({ folders, pick, onPick }: { folders: string[]; pick: FolderPick; onPick: (pick: FolderPick) => void }) => (
	<>
		<Field label="Folder">
			{(control) => (
				<Select
					control={control}
					value={pick.kind === 'none' ? NONE : pick.kind === 'new' ? NEW : `${EXISTING}${pick.name}`}
					onChange={(v) =>
						onPick(v === NONE ? { kind: 'none' } : v === NEW ? { kind: 'new', name: '' } : { kind: 'existing', name: v.slice(EXISTING.length) })
					}
					options={[
						{ value: NONE, label: 'No folder' },
						...folders.map((f) => ({ value: `${EXISTING}${f}`, label: f })),
						{ value: NEW, label: 'New folder…' },
					]}
				/>
			)}
		</Field>
		{pick.kind === 'new' && (
			<Field label="New folder">
				{(control) => <TextInput control={control} value={pick.name} onChange={(name) => onPick({ kind: 'new', name })} placeholder="Zones" />}
			</Field>
		)}
	</>
);
