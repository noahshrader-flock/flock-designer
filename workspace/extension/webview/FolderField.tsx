import { Field, Select, TextInput } from '../../src/ui/Field';

export type FolderPick = { kind: 'none' } | { kind: 'existing'; name: string } | { kind: 'new'; name: string };

const NONE = 'none';
const NEW = 'new';
const EXISTING = 'folder:';

export const pickOf = (folder: string | null): FolderPick => (folder === null ? { kind: 'none' } : { kind: 'existing', name: folder });

/** A new folder not yet named is not a choice: check `isChosen` first. */
export const folderOf = (pick: FolderPick): string | null => (pick.kind === 'none' ? null : pick.name.trim());

export const isChosen = (pick: FolderPick): boolean => pick.kind !== 'new' || pick.name.trim() !== '';

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
