import { useEffect, useRef, useState } from 'react';
import type { Result } from '../../../src/shared/contract';
import { askWhile } from './askWhile';

/** What every answer worked out while a change is tried can be: none with no change, building until it is, failed. */
type Worked = { state: 'none' } | { state: 'building' } | { state: 'failed'; error: string } | { state: string };

/**
 * An answer worked out in the background while a change is tried (what a token change reaches, Phase 3; where the values
 * tried on a component are written, Phase 4): asked whenever the change changes, by what it is (`asked`, never which array
 * holds it), then again while it is drawn; none while nothing is tried. A failure is said as its answer. The same in the
 * app and in VS Code.
 */
export const useTriedAnswer = <A extends Worked>(
	asked: string,
	nothing: boolean,
	ask: () => Promise<Result<A>>,
	/** Whether an answer is still being worked out, so it is asked for again: `building`, unless said otherwise. */
	working: (answer: A) => boolean = (answer) => answer.state === 'building',
): A => {
	const [answer, setAnswer] = useState<A>({ state: 'none' } as A);
	// The newest way to ask, for the change being asked about: the effect runs only when the change does.
	const asking = useRef({ ask, working });
	asking.current = { ask, working };
	useEffect(() => {
		if (nothing) return void setAnswer({ state: 'none' } as A);
		setAnswer({ state: 'building' } as A);
		return askWhile(
			async (): Promise<A> => {
				const r = await asking.current.ask();
				return r.ok ? r.value : ({ state: 'failed', error: r.error } as A);
			},
			(next) => asking.current.working(next),
			setAnswer,
		);
	}, [asked, nothing]);
	return answer;
};
