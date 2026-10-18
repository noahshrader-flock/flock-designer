import type { TriedValue } from '../../../src/shared/contract';
import { sameTried } from '../../../src/shared/contract';
import { type BranchControls, useChangeBranch } from './useChangeBranch';
import { workspace } from '../host';

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
			current: () => workspace().valueBranch(file as string),
			save: (change) => workspace().saveValues(file as string, change),
			propose: () => workspace().proposeValues(file as string),
			forget: () => workspace().forgetValueBranch(file as string),
		},
	});
