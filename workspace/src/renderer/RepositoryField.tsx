import type { ReactNode } from 'react';
import type { RepositoryReach } from '../shared/contract';
import { CLI, HOST } from '../shared/vocabulary';
import { type CloneState, CloneHere } from './Clone';
import { SearchSelect } from './SearchSelect';
import { SkeletonStatus } from './Skeletons';
import { Field, FieldLabel } from './ui/field';
import { Skeleton } from './ui/skeleton';

/**
 * Choosing a repository, the same wherever it is asked (New, Connect): the person's repositories, searched by typing,
 * what the list leaves out when it is only those DSNR's GitHub App can see, and, for one with no clone here, where it
 * would go and the button that clones it (`clone`). A skeleton of the field while the list is read. What follows it on a
 * screen (what New starts from) is `children`.
 */
export const RepositoryField = ({
	id,
	names,
	reach,
	loading,
	value,
	onChange,
	disabled,
	clone,
	children,
}: {
	id: string;
	names: string[];
	reach: RepositoryReach | null;
	loading: boolean;
	value: string | null;
	onChange: (name: string) => void;
	disabled: boolean;
	/** A repository chosen with no clone here: where it goes, and what cloning it is called on this screen. */
	clone?: { state: CloneState; onClone: () => void; action?: string };
	children?: ReactNode;
}) =>
	loading ? (
		<SkeletonStatus label="Loading your repositories…" className="flex flex-col gap-2">
			<Skeleton className="h-4 w-20" />
			<Skeleton className="h-9 w-full" />
		</SkeletonStatus>
	) : (
		<Field>
			<FieldLabel htmlFor={id}>Repository</FieldLabel>
			<SearchSelect
				id={id}
				items={names}
				value={value}
				onChange={onChange}
				placeholder="Choose a repository"
				search="Search repositories…"
				empty="No repository matches."
				disabled={disabled}
			/>
			{reach === 'app' && (
				<p className="text-muted-foreground text-xs">
					Only the repositories DSNR’s {HOST} App is installed on are listed. To see every one your account can reach, sign in to {HOST}’s command
					line as this account (<code>{CLI} auth login</code>), or ask an owner of your organization to install the app on all its repositories.
				</p>
			)}
			{clone && <CloneHere clone={clone.state} onClone={clone.onClone} action={clone.action} />}
			{children}
		</Field>
	);
