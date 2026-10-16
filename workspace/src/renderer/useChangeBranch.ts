import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeBranch, Result } from '../shared/contract';

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

/** What one kind of change's branch is asked with: the window's calls for it. */
export interface BranchCalls<C> {
	current: () => Promise<Result<ChangeBranch<C> | null>>;
	save: (change: C) => Promise<Result<ChangeBranch<C>>>;
	propose: () => Promise<Result<ChangeBranch<C>>>;
	forget: () => Promise<Result<null>>;
}

/**
 * The branch a change is kept on (a change to the tokens, T4 and T5; a component's values, Phase 4), the same for either
 * kind. Asked for whenever `shown` is another (a design system, a component); a change the app was closed with is put back
 * when none is being tried. Once proposed, it looks for Chromatic's build until the library's CI has linked one.
 */
export const useChangeBranch = <C>({
	shown,
	change,
	setChange,
	same,
	empty,
	calls,
}: {
	shown: string | null;
	change: C;
	setChange: (change: C) => void;
	/** Whether two changes are the same change, whatever their order. */
	same: (a: C, b: C) => boolean;
	empty: C;
	calls: BranchCalls<C>;
}): BranchControls<C> => {
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
		let live = true;
		void now.current.calls.current().then((r) => {
			if (!live || !r.ok || r.value === null) return;
			setBranch(r.value);
			if (nothing) setChange(r.value.saved);
		});
		return () => {
			live = false;
		};
		// Only when another is shown: the change being tried is the person's after that.
	}, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

	const waiting = Boolean(branch?.pullRequest) && branch?.pullRequest?.chromatic === null;
	useEffect(() => {
		if (!waiting) return;
		const started = Date.now();
		const timer = setInterval(() => {
			if (Date.now() - started > CHROMATIC_FOR_MS) return clearInterval(timer);
			const asked = now.current.shown;
			void now.current.calls.current().then((r) => r.ok && r.value && now.current.shown === asked && setBranch(r.value));
		}, CHROMATIC_EVERY_MS);
		return () => clearInterval(timer);
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
