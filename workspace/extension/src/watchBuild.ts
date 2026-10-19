/** Polls, because DSNR does not run Claude Code and is not told when its build is done. `saveBuilt` saves each build once. */
export const watchBuild = async ({
	saveBuilt,
	onSaved,
	onGaveUp,
	now,
	sleep,
	pollMs,
	giveUpMs,
	isLive,
}: {
	saveBuilt: () => Promise<'saved' | 'waiting'>;
	onSaved: () => void;
	/** Saving failed three times running, with the last error: the person is told, as no build of theirs is saved after. */
	onGaveUp: (err: unknown) => void;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	pollMs: number;
	giveUpMs: number;
	isLive: () => boolean;
}): Promise<void> => {
	const start = now();
	let failed = 0;
	let last: unknown = null;
	while (isLive() && now() - start < giveUpMs && failed < 3) {
		const saved = await saveBuilt().then(
			(r) => ((failed = 0), r),
			(err: unknown) => ((failed += 1), (last = err), 'waiting' as const),
		);
		if (saved === 'saved') onSaved();
		if (failed < 3) await sleep(pollMs);
	}
	if (failed >= 3 && isLive()) onGaveUp(last);
};
