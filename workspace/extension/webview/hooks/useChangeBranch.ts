import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeBranch, ChangeKinds, Result } from '../../../src/shared/contract';
import { sameTried } from '../../../src/shared/contract';
import { sameChange } from '../../../src/shared/tokens';
import { workspace } from '../host';
import { askOnce, askWhile } from './ask';

/** How often a proposed change looks for Chromatic's build, and for how long, after which it is left to the pull request. */
const CHROMATIC_EVERY_MS = 20_000;
const CHROMATIC_FOR_MS = 30 * 60_000;

/** The branch a change is kept on, as the window shows it, and what can be done with it. */
export interface BranchControls<C> {
	branch: ChangeBranch<C> | null;
	/** Whether the change being tried is not the one last saved. */
	unsaved: boolean;
	busy: 'saving' | 'proposing' | null;
	error: string | null;
	save: () => void;
	propose: () => void;
	/** Forgets the branch and empties the change, to start a new one. The branch and any pull request stay. */
	startOver: () => void;
}

/** The kinds a panel tries before it saves them: when two of a kind are the same change, whatever their order, and none of it. */
type TriedKind = 'tokens' | 'values';
const TRIED: { [K in TriedKind]: { same: (a: ChangeKinds[K], b: ChangeKinds[K]) => boolean; empty: ChangeKinds[K] } } = {
	tokens: { same: sameChange, empty: [] },
	values: { same: sameTried, empty: [] },
};

/**
 * The branch a change being tried is kept on (a change to the tokens, T4 and T5; a component's values, Phase 4), the same
 * for either kind, through the calls every kind of change has. Asked for whenever `shown` is another (a design system, a
 * component); `scope` is the component's story file, or null for the design system whole. A change the app was closed with
 * is put back when none is being tried. Once proposed, it looks for Chromatic's build until the library's CI has linked one.
 */
export const useChangeBranch = <K extends TriedKind>(
	kind: K,
	{
		shown,
		scope,
		change,
		setChange,
	}: {
		shown: string | null;
		scope: string | null;
		change: ChangeKinds[K];
		setChange: (change: ChangeKinds[K]) => void;
	},
): BranchControls<ChangeKinds[K]> => {
	type C = ChangeKinds[K];
	const { same, empty } = TRIED[kind];
	const calls = {
		current: () => workspace().changeBranch(kind, scope) as Promise<Result<ChangeBranch<C> | null>>,
		save: (c: C) => workspace().saveChange(kind, scope, c) as Promise<Result<ChangeBranch<C>>>,
		propose: () => workspace().proposeChange(kind, scope, null) as Promise<Result<ChangeBranch<C>>>,
		forget: () => workspace().forgetChange(kind, scope),
	};
	const [branch, setBranch] = useState<ChangeBranch<C> | null>(null);
	// The calls for what is shown now, and which that is: an answer for one shown before (another component) is not this one's.
	const now = useRef({ calls, shown });
	now.current = { calls, shown };
	const [busy, setBusy] = useState<BranchControls<C>['busy']>(null);
	const [error, setError] = useState<string | null>(null);
	const nothing = same(change, empty);

	useEffect(() => {
		setBranch(null);
		setError(null);
		if (shown === null) return;
		return askOnce(now.current.calls.current, (r) => {
			if (!r.ok || r.value === null) return;
			setBranch(r.value);
			if (nothing) setChange(r.value.saved);
		});
		// Only when another is shown: the change being tried is the person's after that.
	}, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

	const waiting = Boolean(branch?.pullRequest) && branch?.pullRequest?.chromatic === null;
	useEffect(() => {
		if (!waiting) return;
		// Another shown empties the branch, so `waiting` ends and this stops before it is answered.
		return askWhile(
			now.current.calls.current,
			(r) => !r.ok || r.value?.pullRequest?.chromatic === null,
			(r) => r.ok && r.value && setBranch(r.value),
			{ every: CHROMATIC_EVERY_MS, for: CHROMATIC_FOR_MS },
		);
	}, [waiting]);

	const run = useCallback(async (what: 'saving' | 'proposing', act: () => Promise<Result<ChangeBranch<C>>>) => {
		const asked = now.current.shown;
		setBusy(what);
		setError(null);
		const r = await act();
		setBusy(null);
		if (now.current.shown !== asked) return;
		if (r.ok) setBranch(r.value);
		else setError(r.error);
	}, []);

	return {
		branch,
		unsaved: branch === null ? !nothing : !same(change, branch.saved),
		busy,
		error,
		save: () => void run('saving', () => calls.save(change)),
		propose: () => void run('proposing', () => calls.propose()),
		// Only once it is forgotten: a branch still kept would come back the next time.
		startOver: () =>
			void calls.forget().then((r) => {
				if (!r.ok) return setError(r.error);
				setBranch(null);
				setError(null);
				setChange(empty);
			}),
	};
};
