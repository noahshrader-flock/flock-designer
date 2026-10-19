/**
 * Never loses a request made while running ("already busy, do nothing" drops work): requests made mid-run get exactly one
 * run afterwards, and a caller's promise resolves when a run that began after it asked has finished.
 */
export const latest = (work: () => Promise<void>): (() => Promise<void>) => {
	let running: Promise<void> | null = null;
	let again: Promise<void> | null = null;
	let wake: (() => void) | null = null;

	const drain = async (): Promise<void> => {
		// Taken before the work starts, so anything that asks during it waits for a turn after this one.
		let release: (() => void) | null = null;
		for (;;) {
			await work().catch(() => undefined);
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
		again ??= new Promise<void>((resolve) => {
			wake = resolve;
		});
		return again;
	};
};
