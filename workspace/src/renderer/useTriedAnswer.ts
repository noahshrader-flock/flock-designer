import { useEffect, useRef, useState } from 'react';
import type { Result } from '../shared/contract';
import { askWhile } from './askWhile';

/** What every answer worked out while a change is tried can be: none with no change, building until it is, failed. */
type Worked = { state: 'none' } | { state: 'building' } | { state: 'failed'; error: string } | { state: string };

/**
 * An answer worked out in the background while a change is tried (what a token change reaches, Phase 3; where the values
 * tried on a component are written, Phase 4): asked whenever the change changes, by what it is (`asked`, never which array
 * holds it), then again while it is drawn; none while nothing is tried. A failure is said as its answer. The same in the
 * app and in VS Code.
 */
export const useTriedAnswer = <A extends Worked>(asked: string, nothing: boolean, ask: () => Promise<Result<A>>): A => {
	const [answer, setAnswer] = useState<A>({ state: 'none' } as A);
	// The newest way to ask, for the change being asked about: the effect runs only when the change does.
	const asking = useRef(ask);
	asking.current = ask;
	useEffect(() => {
		if (nothing) return void setAnswer({ state: 'none' } as A);
		setAnswer({ state: 'building' } as A);
		return askWhile(
			async (): Promise<A> => {
				const r = await asking.current();
				return r.ok ? r.value : ({ state: 'failed', error: r.error } as A);
			},
			(next) => next.state === 'building',
			setAnswer,
		);
	}, [asked, nothing]);
	return answer;
};
