import { ExternalLinkIcon, GitBranchIcon } from 'lucide-react';
import { plural } from '../shared/plural';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import type { TokenBranchControls } from './useTokenBranch';

/** A link out, which the app hands to the system's browser. */
const Out = ({ href, children }: { href: string; children: string }) => (
	<a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-3">
		{children}
		<ExternalLinkIcon className="size-3" />
	</a>
);

/**
 * What can be done with a change once it is tried (T4 and T5), under the list of what was changed: save it to a branch,
 * then propose it as a draft pull request, with Chromatic's build once the library's CI has made one. Saving again is
 * offered only when the change is not the one last saved; proposing, only once it is saved. Start over forgets the
 * branch, which stays on GitHub with any pull request.
 */
export const TokenBranchActions = ({ controls }: { controls: TokenBranchControls }) => {
	const { branch, unsaved, busy, error, save, propose, startOver } = controls;
	return (
		<div data-token-branch className="flex flex-col gap-2">
			{branch && (
				<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
					<GitBranchIcon className="size-3.5 shrink-0" />
					<span className="min-w-0 truncate font-mono">{branch.branch}</span>
					<span className="shrink-0">· {plural(branch.saves, 'save')}</span>
				</p>
			)}
			{branch?.pullRequest && (
				<p className="flex flex-wrap items-center gap-x-2 text-xs">
					<Out href={branch.pullRequest.url}>{`Draft pull request #${branch.pullRequest.number}`}</Out>
					{branch.pullRequest.chromatic ? (
						<Out href={branch.pullRequest.chromatic}>Chromatic</Out>
					) : (
						<span className="text-muted-foreground">Chromatic’s build is linked here once the library’s CI has made it.</span>
					)}
				</p>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<div className="flex items-center gap-2">
				{unsaved && (
					<Button size="sm" disabled={busy !== null} onClick={save}>
						{busy === 'saving' ? 'Saving…' : branch ? 'Save' : 'Save to a branch'}
					</Button>
				)}
				{branch && !unsaved && !branch.pullRequest && (
					<Button size="sm" disabled={busy !== null} onClick={propose}>
						{busy === 'proposing' ? 'Opening a draft pull request…' : 'Propose'}
					</Button>
				)}
				{branch && (
					<Button variant="ghost" size="sm" className="ml-auto" disabled={busy !== null} onClick={startOver}>
						Start over
					</Button>
				)}
			</div>
		</div>
	);
};
