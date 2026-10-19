/** How often an answer still being drawn is asked for again, and for how long at most, unless a poll says otherwise. */
export const ASK_EVERY_MS = 3000;
export const ASK_FOR_MS = 30 * 60_000;

/** Returns what stops it, for the effect's clean-up, after which the answer is dropped, so an answer to an earlier ask is never shown. */
export const askOnce = <T>(ask: () => Promise<T>, got: (answer: T) => void): (() => void) => askWhile(ask, () => false, got);

/** Stops at the first answer `again` says is not still coming, or after `for`, so nothing is asked forever; what it returns stops it too. */
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
