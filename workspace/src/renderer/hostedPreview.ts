import { useEffect, useState } from 'react';

/**
 * A shared preview takes minutes to build, and a reviewer can open the iteration while it is
 * still coming. Rather than a browser error page, the window says so and keeps checking.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolves true as soon as `check` says yes, false if nobody is looking any more. */
export const waitUntilUp = async (check: () => Promise<boolean>, isLive: () => boolean, pollMs = 10_000): Promise<boolean> => {
	while (isLive()) {
		if (await check()) return true;
		await sleep(pollMs);
	}
	return false;
};

export type HostedState = 'idle' | 'waiting' | 'up';

/** `url` null means there is no hosted preview to wait for. `openAnyway` is for a check that cannot be trusted (a VPN, say). */
export const useHostedPreview = (url: string | null): { state: HostedState; openAnyway: () => void } => {
	const [state, setState] = useState<HostedState>('idle');

	useEffect(() => {
		if (!url) return setState('idle');
		let live = true;
		setState('waiting');
		void waitUntilUp(
			async () => {
				const r = await window.workspace.previewReachable(url);
				return r.ok && r.value;
			},
			() => live,
		).then((up) => {
			if (live && up) setState('up');
		});
		return () => {
			live = false;
		};
	}, [url]);

	return { state, openAnyway: () => setState('up') };
};
