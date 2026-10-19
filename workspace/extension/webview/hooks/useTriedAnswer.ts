import { useEffect, useRef, useState } from 'react';
import type { Result } from '../../../src/shared/contract';
import { askWhile } from './ask';

type Worked = { state: 'none' } | { state: 'building' } | { state: 'failed'; error: string } | { state: string };

/** Asked again whenever the change changes by what it is (`asked`), never by which array holds it. */
export const useTriedAnswer = <A extends Worked>(
	asked: string,
	nothing: boolean,
	ask: () => Promise<Result<A>>,
	working: (answer: A) => boolean = (answer) => answer.state === 'building',
): A => {
	const [answer, setAnswer] = useState<A>({ state: 'none' } as A);
	// The newest way to ask, for the change being asked about: the effect runs only when the change does.
	const asking = useRef({ ask, working });
	asking.current = { ask, working };
	useEffect(() => {
		setAnswer({ state: nothing ? 'none' : 'building' } as A);
		if (nothing) return;
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
