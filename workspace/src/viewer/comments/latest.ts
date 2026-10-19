/**
 * Runs one thing at a time, and never loses a request made while it was running ("already busy, do nothing" drops
 * work). Requests made mid-run get exactly one run afterwards, and a caller's promise resolves when a run that *began
 * after it asked* has finished, so awaiting it means the answer includes what it wanted.
 */
export const latest = (work: () => Promise<void>): (() => Promise<void>) => {
	let running: Promise<void> | null = null;
	let again: Promise<void> | null = null;
	let wake: (() => void) | null = null;

	const drain = async (): Promise<void> => {
		// Whoever is waiting on the run about to happen. Taken before the work starts, so anything that
		// asks during it is a newer request and waits for a turn after this one.
		let release: (() => void) | null = null;
		for (;;) {
			await work().catch(() => undefined);
			// Released only now, after the run finished: awaiting the promise means the work is done.
			release?.();
			if (!wake) return;
			release = wake;
			wake = null;
			again = null;
		}
	};

	return () => {
		if (!running) {
			running = drain().finally(() => {
				running = null;
			});
			return running;
		}
		// A run is going. Everyone who asks meanwhile waits on the same single extra run.
		again ??= new Promise<void>((resolve) => {
			wake = resolve;
		});
		return again;
	};
};
