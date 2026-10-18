import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandedChange, HandoffBranch, Result } from '../../../src/shared/contract';
import { handedTo } from '../../../src/shared/handedTo';
import { workspace } from '../host';

/** How often a hand-over's branch is read from git again while it is watched, until it is proposed. */
const READ_EVERY_MS = 5_000;

/** A unit's hand-over to Claude Code (Process changes), as the window shows it, and what can be done with it. */
export interface HandoffControls {
	handoff: HandoffBranch | null;
	/** Where it went, said once it is handed over (`handedTo`), until another is shown or it is started over. */
	handed: string | null;
	busy: 'handing' | 'proposing' | 'showing' | null;
	error: string | null;
	processChanges: () => void;
	/** Proposes its branch; one the rules flag only when `confirmed`, which the person says on purpose. */
	propose: (confirmed: boolean) => void;
	/** Forgets the hand-over, so it can be handed over again or saved. The branch and any pull request stay. */
	startOver: () => void;
	/** Shows its branch in the previews in place of the library's (`on`), or the library's again (Phase 2). */
	preview: (on: boolean) => void;
}

/**
 * A unit's hand-over (the tokens, `file` none; or a component's values, by its story file), asked for whenever `shown` is
 * another. Its branch is DSNR's reading of git, never what Claude Code says: while `watch` (the panel's Changes is open), it
 * is read again as Claude Code makes and commits it, until it is proposed. `change` is what Process changes hands over.
 */
export const useHandoff = ({
	shown,
	file,
	change,
	watch,
}: {
	shown: string | null;
	file: string | null;
	change: HandedChange;
	watch: boolean;
}): HandoffControls => {
	const [handoff, setHandoff] = useState<HandoffBranch | null>(null);
	const [handed, setHanded] = useState<string | null>(null);
	const [busy, setBusy] = useState<HandoffControls['busy']>(null);
	const [error, setError] = useState<string | null>(null);
	// What is shown now, and how many times it was set afresh: an answer asked before (another unit, or before Start over) is dropped.
	const now = useRef({ file, epoch: 0 });
	now.current.file = file;

	const read = useCallback(() => {
		const { file: asked, epoch } = now.current;
		void workspace()
			.handoffBranch(asked)
			.then((r) => {
				if (r.ok && now.current.epoch === epoch) setHandoff(r.value);
			});
	}, []);

	useEffect(() => {
		now.current.epoch += 1;
		setHandoff(null);
		setHanded(null);
		setError(null);
		if (shown !== null) read();
	}, [shown, read]);

	const waiting = watch && handoff !== null && handoff.pullRequest === null;
	useEffect(() => {
		if (!waiting) return;
		const timer = setInterval(read, READ_EVERY_MS);
		return () => clearInterval(timer);
	}, [waiting, read]);

	const run = async <T>(what: NonNullable<HandoffControls['busy']>, act: () => Promise<Result<T>>, then: (value: T) => void) => {
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
		handoff,
		handed,
		busy,
		error,
		processChanges: () =>
			void run(
				'handing',
				() => workspace().handOverChanges(file, change),
				(over) => {
					setHanded(handedTo(over, 'This hand-over'));
					read();
				},
			),
		// At the commit read here: one Claude Code committed since is refused, to be looked at first.
		propose: (confirmed) => {
			const tip = handoff?.review.state === 'ready' ? handoff.review.tip : null;
			if (tip !== null) void run('proposing', () => workspace().proposeHandoff(file, tip, confirmed), setHandoff);
		},
		// Every page is told what is shown, and reads the library again: nothing is kept here.
		preview: (on) =>
			void run(
				'showing',
				() => (on ? workspace().showHandoff(file) : workspace().showLibraryBranch()),
				() => undefined,
			),
		// Only once it is forgotten: a hand-over still kept would come back the next time it is read.
		startOver: () =>
			void workspace()
				.forgetHandoff(file)
				.then((r) => {
					if (!r.ok) return setError(r.error);
					now.current.epoch += 1;
					setHandoff(null);
					setHanded(null);
					setError(null);
				}),
	};
};
