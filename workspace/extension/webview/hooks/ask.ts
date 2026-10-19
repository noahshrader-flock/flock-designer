/** How often an answer still being drawn is asked for again, and for how long at most, unless a poll says otherwise. */
export const ASK_EVERY_MS = 3000;
export const ASK_FOR_MS = 30 * 60_000;

/**
 * Asks once and gives the answer to `got`: the one way a page reads something for an effect. Returns what stops it, for the
 * effect's clean-up, after which the answer is dropped, so an answer to what was asked before (another thing shown, or a page
 * left) is never shown.
 */
export const askOnce = <T>(ask: () => Promise<T>, got: (answer: T) => void): (() => void) => askWhile(ask, () => false, got);

/**
 * Asks once, gives the answer to `got`, and asks again `every` few seconds while `again` says it is still coming: one way
 * for every panel that waits. It stops at the first answer that is not, or after `for`, so nothing is asked forever.
 * Returns what stops it, for an effect's clean-up, after which no answer is given.
 */
export const askWhile = <T>(
	ask: () => Promise<T>,
	again: (answer: T) => boolean,
	got: (answer: T) => void,
	{ every = ASK_EVERY_MS, for: within = ASK_FOR_MS }: { every?: number; for?: number } = {},
): (() => void) => {
	const until = Date.now() + within;
	let live = true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const next = async () => {
		const answer = await ask();
		if (!live) return;
		got(answer);
		if (again(answer) && Date.now() + every <= until) timer = setTimeout(() => void next(), every);
	};
	void next();
	return () => {
		live = false;
		clearTimeout(timer);
	};
};
