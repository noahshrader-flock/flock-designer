import { errorText } from '../../../shared/result';

/**
 * A slow answer (seconds to a minute of drawing) worked out in the background for the newest key only. Any other key
 * answers null and is worked out after the one under way, skipping keys asked for in between. A failure is returned once,
 * then worked out again on the next ask.
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
