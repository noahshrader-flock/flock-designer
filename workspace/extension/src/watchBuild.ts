/**
 * Watching a prototype that Claude Code builds, since DSNR does not run that agent and so is not told when it is done. The
 * prototype's source and page are read every `pollMs`; once the newest write is newer than the hand-over (`since`) and has
 * stood still for `settleMs`, it is saved (`save`, which builds the page from the source) and `onSaved` says so, so the list is
 * read again and the picture on the card is drawn. A later change is saved again, a write that cannot be saved (the build was
 * still going) is tried three times and then left to the next change, and the watching ends at `giveUpMs` or when `isLive` says.
 */
export const watchBuild = async ({
	read,
	save,
	onSaved,
	since,
	now,
	sleep,
	pollMs,
	settleMs,
	giveUpMs,
	isLive,
}: {
	read: () => Promise<{ sourceAt: number | null; pageAt: number | null }>;
	/** Saves what was built; whether it could. */
	save: () => Promise<boolean>;
	onSaved: () => void;
	since: number;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	pollMs: number;
	settleMs: number;
	giveUpMs: number;
	isLive: () => boolean;
}): Promise<void> => {
	const start = now();
	let saved: number | null = null;
	const tried = new Map<number, number>();
	while (isLive() && now() - start < giveUpMs) {
		// A read that fails is the next poll's to try again.
		const written = await read().catch(() => null);
		const latest = written === null ? null : Math.max(written.sourceAt ?? 0, written.pageAt ?? 0);
		if (latest !== null && latest > since && latest !== saved && now() - latest >= settleMs && (tried.get(latest) ?? 0) < 3) {
			tried.set(latest, (tried.get(latest) ?? 0) + 1);
			if (await save().catch(() => false)) {
				saved = latest;
				onSaved();
			}
		}
		await sleep(pollMs);
	}
};
