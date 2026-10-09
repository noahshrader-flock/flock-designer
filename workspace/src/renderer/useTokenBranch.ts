import { useCallback, useEffect, useState } from 'react';
import type { Result, TokenBranch, TokenEdit } from '../shared/contract';
import { sameChange } from '../shared/tokens';

/** How often a proposed change looks for Chromatic's build, and for how long, after which it is left to the pull request. */
const CHROMATIC_EVERY_MS = 20_000;
const CHROMATIC_FOR_MS = 30 * 60_000;

/** The branch a change is kept on, as the tokens panel shows it, and what can be done with it. */
export interface TokenBranchControls {
	branch: TokenBranch | null;
	/** Whether the change in the panel is not the one last saved. */
	unsaved: boolean;
	busy: 'saving' | 'proposing' | null;
	error: string | null;
	save: () => void;
	propose: () => void;
	/** Forgets the branch and empties the change, to start a new one. The branch and any pull request stay. */
	startOver: () => void;
}

/**
 * The branch the shown design system's change is kept on (T4 and T5). Asked for whenever another design system is
 * shown (`shown`); a change the app was closed with is put back in the panel when it has none. Once proposed, it looks
 * for Chromatic's build until the library's CI has linked one.
 */
export const useTokenBranch = (shown: string | null, edits: TokenEdit[], setEdits: (edits: TokenEdit[]) => void): TokenBranchControls => {
	const [branch, setBranch] = useState<TokenBranch | null>(null);
	const [busy, setBusy] = useState<TokenBranchControls['busy']>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setBranch(null);
		setError(null);
		if (shown === null) return;
		let live = true;
		void window.workspace.tokenBranch().then((r) => {
			if (!live || !r.ok || r.value === null) return;
			setBranch(r.value);
			if (edits.length === 0) setEdits(r.value.saved);
		});
		return () => {
			live = false;
		};
		// Only when another design system is shown: the change in the panel is the person's after that.
	}, [shown]);

	const waiting = Boolean(branch?.pullRequest) && branch?.pullRequest?.chromatic === null;
	useEffect(() => {
		if (!waiting) return;
		const started = Date.now();
		const timer = setInterval(() => {
			if (Date.now() - started > CHROMATIC_FOR_MS) return clearInterval(timer);
			void window.workspace.tokenBranch().then((r) => r.ok && r.value && setBranch(r.value));
		}, CHROMATIC_EVERY_MS);
		return () => clearInterval(timer);
	}, [waiting]);

	const run = useCallback(async (what: 'saving' | 'proposing', act: () => Promise<Result<TokenBranch>>) => {
		setBusy(what);
		setError(null);
		const r = await act();
		setBusy(null);
		if (r.ok) setBranch(r.value);
		else setError(r.error);
	}, []);

	return {
		branch,
		unsaved: branch === null ? edits.length > 0 : !sameChange(edits, branch.saved),
		busy,
		error,
		save: () => void run('saving', () => window.workspace.saveTokens(edits)),
		propose: () => void run('proposing', () => window.workspace.proposeTokens()),
		// Only once it is forgotten: a branch still kept would come back the next time.
		startOver: () =>
			void window.workspace.forgetTokenBranch().then((r) => {
				if (!r.ok) return setError(r.error);
				setBranch(null);
				setError(null);
				setEdits([]);
			}),
	};
};
