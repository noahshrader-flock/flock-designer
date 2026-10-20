/** A page's answer, or null after `ms`, or when it fails: a page out of sight may never answer. */
export const within = <T>(ms: number, p: Promise<T>): Promise<T | null> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Cleared once answered, so a quick answer leaves no timer behind to hold the process open.
	return Promise.race([p.catch(() => null), new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]).finally(() => clearTimeout(timer));
};
