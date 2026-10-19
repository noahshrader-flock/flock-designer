/** Newest first by `dateOf`, the undated last, and `then` between two of one date, so an order never shuffles. */
export const byNewest =
	<T>(dateOf: (t: T) => string | null, then: (a: T, b: T) => number) =>
	(a: T, b: T): number => {
		const da = dateOf(a);
		const db = dateOf(b);
		if (da !== null && db !== null && da !== db) return Date.parse(db) - Date.parse(da);
		if ((da === null) !== (db === null)) return da === null ? 1 : -1;
		return then(a, b);
	};
