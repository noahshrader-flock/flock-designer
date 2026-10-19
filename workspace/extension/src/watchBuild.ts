/** Polls, because DSNR does not run Claude Code and is not told when its build is done. `saveBuilt` saves each build once. */
export const watchBuild = async ({
	saveBuilt,
	onSaved,
	now,
	sleep,
	pollMs,
	giveUpMs,
	isLive,
}: {
	saveBuilt: () => Promise<'saved' | 'waiting'>;
	onSaved: () => void;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	pollMs: number;
	giveUpMs: number;
	isLive: () => boolean;
}): Promise<void> => {
	const start = now();
	let failed = 0;
	while (isLive() && now() - start < giveUpMs && failed < 3) {
		const saved = await saveBuilt().then(
			(r) => ((failed = 0), r),
			() => ((failed += 1), 'waiting' as const),
		);
		if (saved === 'saved') onSaved();
		await sleep(pollMs);
	}
};
