import { CHANGE_REQUEST } from '../../src/shared/vocabulary';

/** A change kept on a branch of DSNR's, as either kind of change has one: the tokens' (T4, T5) and the voice and tone's (T9). */
export interface KeptBranch {
	branch: string;
	saves: number;
	pullRequest: { number: number; url: string } | null;
}

/** A button: what it says, and whether it can be pressed now. */
interface Offered {
	label: string;
	disabled: boolean;
}

/**
 * What can be done with a change kept on a branch, in the app and in VS Code alike: Save (to a branch, the first time),
 * offered only when the change is not the one last saved; Propose only once it is, until it is proposed; Start over
 * while there is a branch. While one is being done, it says so and nothing else can be pressed. Save also waits on what
 * must be settled first (`canSave`: the voice and tone, changed on GitHub meanwhile). Each shell draws what is offered.
 */
export const branchButtons = ({
	branch,
	unsaved,
	busy,
	canSave = true,
}: {
	branch: KeptBranch | null;
	unsaved: boolean;
	busy: 'saving' | 'proposing' | null;
	canSave?: boolean;
}): { save: Offered | null; propose: Offered | null; startOver: { disabled: boolean } | null } => ({
	save: unsaved ? { label: busy === 'saving' ? 'Saving…' : branch ? 'Save' : 'Save to a branch', disabled: busy !== null || !canSave } : null,
	propose:
		branch && !unsaved && !branch.pullRequest
			? { label: busy === 'proposing' ? `Opening a draft ${CHANGE_REQUEST}…` : 'Propose', disabled: busy !== null }
			: null,
	startOver: branch ? { disabled: busy !== null } : null,
});
