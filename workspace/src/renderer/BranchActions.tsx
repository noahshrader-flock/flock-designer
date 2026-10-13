import { GitBranchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { plural } from '../shared/plural';
import { OutLink } from './OutLink';
import { Button } from './ui/button';
import { CHANGE_REQUEST } from '../shared/vocabulary';
import { ErrorAlert } from './ErrorAlert';

/** A change kept on a branch of DSNR's, as either kind of change has one: the tokens' (T4, T5) and the voice and tone's (T9). */
interface KeptBranch {
	branch: string;
	saves: number;
	pullRequest: { number: number; url: string } | null;
}

/**
 * What can be done with a change kept on a branch, under it: its branch and how many saves, its draft pull request once
 * it is proposed, what went wrong, then Save (to a branch, the first time), Propose and Start over. Save is offered only
 * when the change is not the one last saved; Propose only once it is; Start over forgets the branch, which stays on GitHub
 * with any pull request. One piece, so a change to the tokens and a change to the voice and tone are kept the same way.
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
}) => (
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
			{unsaved && (
				<Button size="sm" disabled={busy !== null || !canSave} onClick={onSave}>
					{busy === 'saving' ? 'Saving…' : branch ? 'Save' : 'Save to a branch'}
				</Button>
			)}
			{branch && !unsaved && !branch.pullRequest && (
				<Button size="sm" disabled={busy !== null} onClick={onPropose}>
					{busy === 'proposing' ? `Opening a draft ${CHANGE_REQUEST}…` : 'Propose'}
				</Button>
			)}
			{branch && (
				<Button variant="ghost" size="sm" className="ml-auto" disabled={busy !== null} onClick={onStartOver}>
					Start over
				</Button>
			)}
		</div>
	</div>
);
