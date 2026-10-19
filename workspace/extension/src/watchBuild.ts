/**
 * Watching a prototype Claude Code builds, since DSNR does not run that agent and is not told when it is done: every
 * `pollMs` the core saves it if it is built (`saveBuilt` knows from its source and page, and saves each build once).
 * Three failed saves running end the watching, as do `giveUpMs` and `isLive`: opening the prototype saves it too.
 */
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
