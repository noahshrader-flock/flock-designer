import type { TriedValue } from '../shared/contract';
import { sameTried } from '../shared/contract';
import { type BranchControls, useChangeBranch } from './useChangeBranch';

/**
 * The branch a component's values are kept on (Phase 4), by its story file, asked for whenever the tab shows another, as
 * every change's branch is (`useChangeBranch`): its values as last saved are put back when none are being tried.
 */
export const useValueBranch = (file: string | null, tried: TriedValue[], setTried: (tried: TriedValue[]) => void): BranchControls<TriedValue[]> =>
	useChangeBranch({
		shown: file,
		change: tried,
		setChange: setTried,
		same: sameTried,
		empty: [],
		calls: {
			current: () => window.workspace.valueBranch(file as string),
			save: (change) => window.workspace.saveValues(file as string, change),
			propose: () => window.workspace.proposeValues(file as string),
			forget: () => window.workspace.forgetValueBranch(file as string),
		},
	});
