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

/**
 * Whether the change can be written where it is: `found` where every value has its place, `finding` while that is looked for,
 * `cannot` where one has none, or a save was refused (in words), so the agent writes it instead.
 */
export type Placing = 'found' | 'finding' | 'cannot';

/**
 * One main button for the change as it stands: Save to a branch where DSNR can write it, Process changes where it cannot,
 * never both, as it is DSNR that knows which. While one is being done, nothing else can be pressed (`busy`; `held` is
 * another branch shown in the library's place).
 */
export const branchButtons = ({
	branch,
	unsaved,
	busy,
	placing = 'found',
	held = false,
	agent,
}: {
	branch: KeptBranch | null;
	unsaved: boolean;
	busy: 'saving' | 'proposing' | 'handing' | null;
	placing?: Placing;
	held?: boolean;
	/** Who a change is handed to, named while it is. */
	agent: string;
}): { save: Offered | null; process: Offered | null; propose: Offered | null; startOver: { disabled: boolean } | null } => {
	const idle = busy === null && !held;
	// A branch kept already is saved to, whatever the new value's place: there, Save waits until it has one.
	const handing = unsaved && branch === null && placing === 'cannot';
	return {
		save:
			unsaved && !handing
				? {
						label: busy === 'saving' ? 'Saving…' : branch ? 'Save' : 'Save to a branch',
						disabled: !idle || placing !== 'found',
					}
				: null,
		process: handing ? { label: busy === 'handing' ? `Handing to ${agent}…` : 'Process changes', disabled: !idle } : null,
		propose:
			branch && !unsaved && !branch.pullRequest
				? { label: busy === 'proposing' ? `Opening a draft ${CHANGE_REQUEST}…` : 'Propose', disabled: !idle }
				: null,
		startOver: branch ? { disabled: !idle } : null,
	};
};
