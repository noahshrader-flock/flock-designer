import { useEffect, useRef, useState } from 'react';
import type { ChangeBranchOf, HandedChange, Result } from '../../../src/shared/contract';
import { handedTo } from '../../../src/shared/handedTo';
import { workspace } from '../host';
import { askOnce, askWhile } from './ask';

/** As long as Claude Code may still be working on it; after that it is read again when Changes is opened again. */
const READ_EVERY_MS = 5_000;
const READ_FOR_MS = 2 * 60 * 60_000;

export interface HandOverControls {
	branch: ChangeBranchOf<'handOver'> | null;
	handed: string | null;
	busy: 'handing' | 'proposing' | 'showing' | null;
	error: string | null;
	processChanges: () => void;
	/** Proposes its branch; one the rules flag only when `confirmed`, which the person says on purpose. */
	propose: (confirmed: boolean) => void;
	/** The branch and any pull request stay. */
	startOver: () => void;
	preview: (on: boolean) => void;
}

/** Its branch is DSNR's reading of git, never what Claude Code says: read again while `watch`, until it is proposed. */
export const useHandOver = ({
	shown,
	file,
	change,
	watch,
}: {
	shown: string | null;
	file: string | null;
	change: HandedChange;
	watch: boolean;
}): HandOverControls => {
	const [branch, setBranch] = useState<ChangeBranchOf<'handOver'> | null>(null);
	const [handed, setHanded] = useState<string | null>(null);
	const [busy, setBusy] = useState<HandOverControls['busy']>(null);
	const [error, setError] = useState<string | null>(null);
	// What is shown now, and how many times it was set afresh: an answer asked before (another unit, or before Start over) is dropped.
	const now = useRef({ file, epoch: 0 });
	now.current.file = file;
	// Read again when it is handed over, so its branch is seen at once.
	const [handings, setHandings] = useState(0);
	const read = () => workspace().changeBranch('handOver', now.current.file);

	useEffect(() => {
		now.current.epoch += 1;
		setBranch(null);
		setHanded(null);
		setError(null);
	}, [shown]);

	useEffect(() => {
		if (shown === null) return;
		return askOnce(read, (r) => r.ok && setBranch(r.value));
	}, [shown, handings]);

	const waiting = watch && branch !== null && branch.pullRequest === null;
	useEffect(() => {
		if (!waiting) return;
		return askWhile(
			read,
			(r) => !r.ok || r.value?.pullRequest === null,
			(r) => r.ok && setBranch(r.value),
			{ every: READ_EVERY_MS, for: READ_FOR_MS },
		);
	}, [waiting]);

	const run = async <T>(what: NonNullable<HandOverControls['busy']>, act: () => Promise<Result<T>>, then: (value: T) => void) => {
		const { epoch } = now.current;
		setBusy(what);
		setError(null);
		const r = await act();
		setBusy(null);
		if (now.current.epoch !== epoch) return;
		if (r.ok) then(r.value);
		else setError(r.error);
	};

	return {
		branch,
		handed,
		busy,
		error,
		processChanges: () =>
			void run(
				'handing',
				() => workspace().handOverChanges(file, change),
				(over) => {
					setHanded(handedTo(over, 'This hand-over'));
					setHandings((n) => n + 1);
				},
			),
		// At the commit read here: one Claude Code committed since is refused, to be looked at first.
		propose: (confirmed) => {
			const tip = branch?.review.state === 'ready' ? branch.review.tip : null;
			if (tip !== null) void run('proposing', () => workspace().proposeChange('handOver', file, { tip, confirmed }), setBranch);
		},
		// Every page is told what is shown, and reads the library again: nothing is kept here.
		preview: (on) =>
			void run(
				'showing',
				() => (on ? workspace().showHandOver(file) : workspace().showLibraryBranch()),
				() => undefined,
			),
		// Only once it is forgotten: a hand-over still kept would come back the next time it is read. Not for another shown since.
		startOver: () => {
			const { epoch } = now.current;
			void workspace()
				.forgetChange('handOver', file)
				.then((r) => {
					if (now.current.epoch !== epoch) return;
					if (!r.ok) return setError(r.error);
					now.current.epoch += 1;
					setBranch(null);
					setHanded(null);
					setError(null);
				});
		},
	};
};
