import { GitBranchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { plural } from '../shared/plural';
import { OutLink } from './Links';
import { Button } from './ui/button';
import { CHANGE_REQUEST } from '../shared/vocabulary';
import { type KeptBranch, branchButtons } from '../shared/branchButtons';
import { ErrorAlert } from './ErrorAlert';

/**
 * What can be done with a change kept on a branch, under it: its branch and how many saves, its draft pull request once
 * it is proposed, what went wrong, then what can be done with it (`branchButtons`, VS Code's rule too); Start over forgets
 * the branch, which stays on GitHub with any pull request. One piece, so a change to the tokens and a change to the voice
 * and tone are kept the same way.
 */
export const BranchActions = ({
	branch,
	unsaved,
	busy,
	error,
	canSave = true,
	pullRequestNote,
	onSave,
	onPropose,
	onStartOver,
}: {
	branch: KeptBranch | null;
	unsaved: boolean;
	busy: 'saving' | 'proposing' | null;
	error: ReactNode;
	/** False while something must be settled first (the voice and tone, changed on GitHub meanwhile). */
	canSave?: boolean;
	/** Said beside the pull request's link: the tokens' Chromatic build. */
	pullRequestNote?: ReactNode;
	onSave: () => void;
	onPropose: () => void;
	onStartOver: () => void;
}) => {
	const offered = branchButtons({ branch, unsaved, busy, canSave });
	return (
		<div data-branch-actions className="flex flex-col gap-2">
			{branch && (
				<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
					<GitBranchIcon className="size-3.5 shrink-0" />
					<span className="min-w-0 truncate font-mono">{branch.branch}</span>
					<span className="shrink-0">· {plural(branch.saves, 'save')}</span>
				</p>
			)}
			{branch?.pullRequest && (
				<p className="flex flex-wrap items-center gap-x-2 text-xs">
					<OutLink href={branch.pullRequest.url}>{`Draft ${CHANGE_REQUEST} #${branch.pullRequest.number}`}</OutLink>
					{pullRequestNote}
				</p>
			)}
			{error && <ErrorAlert error={error} />}
			<div className="flex items-center gap-2">
				{offered.save && (
					<Button size="sm" disabled={offered.save.disabled} onClick={onSave}>
						{offered.save.label}
					</Button>
				)}
				{offered.propose && (
					<Button size="sm" disabled={offered.propose.disabled} onClick={onPropose}>
						{offered.propose.label}
					</Button>
				)}
				{offered.startOver && (
					<Button variant="ghost" size="sm" className="ml-auto" disabled={offered.startOver.disabled} onClick={onStartOver}>
						Start over
					</Button>
				)}
			</div>
		</div>
	);
};
