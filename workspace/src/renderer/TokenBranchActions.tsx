import { BranchActions } from './BranchActions';
import { OutLink } from './OutLink';
import type { TokenBranchControls } from './useTokenBranch';

/**
 * What can be done with a change to the tokens once it is tried (T4 and T5), under the list of what was changed: the shared
 * `BranchActions`, with Chromatic's build beside the draft pull request once the library's CI has made one.
 */
export const TokenBranchActions = ({ controls }: { controls: TokenBranchControls }) => {
	const { branch, unsaved, busy, error, save, propose, startOver } = controls;
	const chromatic = branch?.pullRequest?.chromatic;
	return (
		<BranchActions
			branch={branch}
			unsaved={unsaved}
			busy={busy}
			error={error}
			pullRequestNote={
				chromatic ? <OutLink href={chromatic}>Chromatic</OutLink> : <span className="text-muted-foreground">Chromatic’s build is linked here once the library’s CI has made it.</span>
			}
			onSave={save}
			onPropose={propose}
			onStartOver={startOver}
		/>
	);
};
