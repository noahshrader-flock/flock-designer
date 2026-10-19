/**
 * Polls, because DSNR does not run the agent and is not told when its work is done. `found` may be true more than once
 * (each build is saved once), unless `once`, which ends the watch at the first.
 */
export const watchFor = async ({
	found,
	onFound,
	onGaveUp,
	now,
	sleep,
	pollMs,
	giveUpMs,
	isLive,
	once = false,
}: {
	found: () => Promise<boolean>;
	onFound: () => void;
	/** Asking failed three times running, with the last error: the person is told, as nothing is found for them after. */
	onGaveUp: (err: unknown) => void;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	pollMs: number;
	giveUpMs: number;
	isLive: () => boolean;
	once?: boolean;
}): Promise<void> => {
	const start = now();
	let failed = 0;
	let last: unknown = null;
	while (isLive() && now() - start < giveUpMs && failed < 3) {
		const yes = await found().then(
			(r) => ((failed = 0), r),
			(err: unknown) => ((failed += 1), (last = err), false),
		);
		if (yes) onFound();
		if (yes && once) return;
		if (failed < 3) await sleep(pollMs);
	}
	if (failed >= 3 && isLive()) onGaveUp(last);
};
