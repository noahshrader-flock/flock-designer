import { useState } from 'react';
import { folderName, sameFolder } from '../shared/projects';
import { SearchSelect } from './SearchSelect';
import { Field, FieldLabel } from './ui/field';
import { Input } from './ui/input';

const NO_FOLDER = 'No folder';
const ADD = 'Add new folder';
const CHOOSE = 'Choose folder';

/**
 * Which folder a project is in (the folders plan), one field for New and for Assign folder: **Add new folder**, first,
 * which opens an input under the list for its name, then the folders in use. It says *Choose folder* until one is chosen,
 * and **No folder** is offered, last, only while one is: the way to clear it. (Filtering by no folder is the Projects
 * screen's.) A folder exists because a project is in it, so a new one is made by the project that is put in it. What is
 * chosen is said as a folder's name, `null` for no folder, or `undefined` while a new folder has no name yet. A new name
 * that is a folder in use, ignoring case, is that folder.
 */
export const FolderField = ({
	id,
	label,
	folders,
	value,
	onChange,
	disabled,
}: {
	id: string;
	label: string;
	folders: string[];
	value: string | null;
	onChange: (folder: string | null | undefined) => void;
	disabled?: boolean;
}) => {
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState('');
	const items = [ADD, ...folders, ...(value === null ? [] : [NO_FOLDER])];
	const choose = (item: string) => {
		setAdding(item === ADD);
		setName('');
		onChange(item === ADD ? undefined : item === NO_FOLDER ? null : item);
	};
	const rename = (typed: string) => {
		setName(typed);
		const named = folderName(typed);
		onChange(named === null ? undefined : (folders.find((f) => sameFolder(f, named)) ?? named));
	};
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<SearchSelect
				id={id}
				items={items}
				value={adding ? ADD : value}
				onChange={choose}
				placeholder={CHOOSE}
				search="Search folders…"
				empty="No folder matches."
				disabled={disabled}
			/>
			{adding && (
				<Field>
					<FieldLabel htmlFor={`${id}-new`}>New folder name</FieldLabel>
					<Input
						id={`${id}-new`}
						value={name}
						onChange={(e) => rename(e.target.value)}
						placeholder="Admin"
						maxLength={60}
						autoFocus
						disabled={disabled}
					/>
				</Field>
			)}
		</Field>
	);
};
