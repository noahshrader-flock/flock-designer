import { errorText } from '../../../shared/result';

/**
 * An answer worked out in the background for the newest thing asked for alone, and kept for it: what a change being tried
 * reaches (Phase 3), and where a value of a component's own is written (Phase 4), each a few seconds to a minute of
 * drawing. Asking for what is kept answers it; asking for anything else answers null (still being worked out) and has it
 * worked out once the one under way is done, never anything asked for in between. One that failed is said once, and
 * worked out again on the next ask.
 */
export const newestAnswer = <A extends { state: string }>(failed: (error: string) => A) => {
	let kept: { key: string; answer: A } | null = null;
	let wanted: { key: string; work: () => Promise<A> } | null = null;
	let working = false;
	const workNewest = async (): Promise<void> => {
		working = true;
		try {
			while (wanted !== null && wanted.key !== kept?.key) {
				const { key, work } = wanted;
				// Started inside a promise, so one that throws before it has one is said as failed too.
				kept = {
					key,
					answer: await Promise.resolve()
						.then(work)
						.catch((err: unknown) => failed(errorText(err))),
				};
			}
		} finally {
			working = false;
		}
	};
	return (key: string, work: () => Promise<A>): A | null => {
		if (kept?.key === key) {
			const { answer } = kept;
			if (answer.state === 'failed') kept = null;
			return answer;
		}
		wanted = { key, work };
		if (!working) void workNewest();
		return null;
	};
};
