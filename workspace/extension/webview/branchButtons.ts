import { CHANGE_REQUEST } from '../../src/shared/vocabulary';

interface KeptBranch {
	branch: string;
	saves: number;
	pullRequest: { number: number; url: string } | null;
}

interface Offered {
	label: string;
	disabled: boolean;
}

/** While one is being done, nothing else can be pressed; Save also waits on `canSave` (the voice and tone, changed on GitHub meanwhile). */
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
