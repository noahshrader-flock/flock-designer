import type { TokenEdit } from '../shared/contract';
import { sameChange } from '../shared/tokens';
import { type BranchControls, useChangeBranch } from './useChangeBranch';

/** The branch the tokens panel's change is kept on, and what can be done with it. */
export type TokenBranchControls = BranchControls<TokenEdit[]>;

/**
 * The branch the shown design system's change to its tokens is kept on (T4 and T5), asked for whenever another design
 * system is shown (`shown`), as every change's branch is (`useChangeBranch`).
 */
export const useTokenBranch = (shown: string | null, edits: TokenEdit[], setEdits: (edits: TokenEdit[]) => void): TokenBranchControls =>
	useChangeBranch({
		shown,
		change: edits,
		setChange: setEdits,
		same: sameChange,
		empty: [],
		calls: {
			current: () => window.workspace.tokenBranch(),
			save: (change) => window.workspace.saveTokens(change),
			propose: () => window.workspace.proposeTokens(),
			forget: () => window.workspace.forgetTokenBranch(),
		},
	});
