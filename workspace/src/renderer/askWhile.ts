/** How often an answer still being drawn is asked for again. */
export const ASK_EVERY_MS = 3000;

/**
 * Asks once, gives the answer to `got`, and asks again every few seconds while `again` says it is still being drawn (every
 * story, the pictures, a change): one way for every panel that waits on a drawing. Returns what stops it, for an effect's
 * clean-up, after which no answer is given.
 */
export const askWhile = <T>(ask: () => Promise<T>, again: (answer: T) => boolean, got: (answer: T) => void): (() => void) => {
	let live = true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const next = async () => {
		const answer = await ask();
		if (!live) return;
		got(answer);
		if (again(answer)) timer = setTimeout(() => void next(), ASK_EVERY_MS);
	};
	void next();
	return () => {
		live = false;
		clearTimeout(timer);
	};
};
