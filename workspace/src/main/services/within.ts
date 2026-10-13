/** A page's answer, or null after `ms`, or when it fails: a page out of sight may never answer. */
export const within = <T>(ms: number, p: Promise<T>): Promise<T | null> =>
	Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
