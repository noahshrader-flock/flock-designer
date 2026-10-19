/**
 * Watching a prototype that Claude Code builds, since DSNR does not run that agent and so is not told when it is done:
 * every `pollMs` the core is asked to save it if it is built (`saveBuilt`, which knows from its source and page, never
 * from how long they have been still, and saves each build once), and `onSaved` says when it did, so the list is read
 * again and the picture on the card is drawn. A later build is saved again. A save that fails three times running (the
 * design repository could not be written) ends the watching, as does `giveUpMs` or `isLive`: opening the prototype saves it.
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
