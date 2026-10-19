/**
 * One run per key at a time, shared with everyone who asks meanwhile, and forgotten once settled (failure included), so
 * the next caller tries again rather than getting an old failure for good.
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

/**
 * One run at a time, and exactly one more for however many ask while it runs, so nothing asked for is missed and nothing
 * runs twice at once (publishing, a site deploy).
 */
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

/**
 * One run per key at a time, every one run in the order asked, each caller getting its own answer: for work that must not
 * overlap its kind (a build of the previews and the drawing of it, which the next would replace).
 */
export const inTurns = <K>() => {
	const last = new Map<K, Promise<unknown>>();
	return <T>(key: K, work: () => Promise<T>): Promise<T> => {
		const turn = (last.get(key) ?? Promise.resolve()).then(work, work);
		// The next waits on this one whatever it ends in; only the last is kept, so nothing is held once all have run.
		const settled = turn.then(
			() => undefined,
			() => undefined,
		);
		last.set(key, settled);
		void settled.then(() => last.get(key) === settled && last.delete(key));
		return turn;
	};
};

/**
 * Turns by key, as `inTurns`, held from when one is given until it is given back: for work that ends after the call that
 * starts it (a build kept open until it is closed). Each waits for the turn before it to be given back.
 */
export const heldTurns = <K>() => {
	const turns = inTurns<K>();
	return (key: K): Promise<() => void> => new Promise((given) => void turns(key, () => new Promise<void>((back) => given(back))));
};
