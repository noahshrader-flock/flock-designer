/**
 * Two ways the app shares work between callers, written once.
 *
 * `singleFlight`: one run per key at a time, its answer given to everyone who asks meanwhile, and forgotten once it has
 * settled, failure included, so the next caller tries again rather than being handed an old failure for good.
 *
 * `coalescing`: one run at a time, and exactly one more for however many ask while it runs, so nothing asked for during
 * a run is missed and nothing runs twice at once (publishing, a site deploy).
 */

export const singleFlight = <K, T>() => {
	const running = new Map<K, Promise<T>>();
	return {
		run(key: K, start: () => Promise<T>): Promise<T> {
			const have = running.get(key);
			if (have) return have;
			const started = start().finally(() => {
				if (running.get(key) === started) running.delete(key);
			});
			running.set(key, started);
			return started;
		},
	};
};

export type Coalescing = (() => Promise<void>) & { readonly running: boolean };

export const coalescing = (run: () => Promise<void>): Coalescing => {
	let current: Promise<void> | null = null;
	let again = false;
	const go = () => {
		if (current) {
			again = true;
			return current;
		}
		current = (async () => {
			try {
				// A run that fails still leaves the one asked for after it to run; what the last run said is what is told.
				let failure: { error: unknown } | null = null;
				do {
					again = false;
					try {
						await run();
						failure = null;
					} catch (error) {
						failure = { error };
					}
				} while (again);
				if (failure) throw failure.error;
			} finally {
				current = null;
			}
		})();
		return current;
	};
	return Object.defineProperty(go, 'running', { get: () => current !== null }) as Coalescing;
};

/**
 * `coalescing` for each key: one deploy of a page at a time, and one more if asked again meanwhile. A key runs the work it
 * was first given; asking again asks for that work again.
 */
export const coalescingByKey = <K>() => {
	const runs = new Map<K, Coalescing>();
	return {
		run(key: K, work: () => Promise<void>): Promise<void> {
			let go = runs.get(key);
			if (!go) runs.set(key, (go = coalescing(work)));
			return go();
		},
		has: (key: K): boolean => runs.get(key)?.running === true,
		get size(): number {
			return [...runs.values()].filter((go) => go.running).length;
		},
	};
};
