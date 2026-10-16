import { useEffect, useState } from 'react';
import type { ChangeReach, TokenEdit } from '../shared/contract';

/** How often what a change reaches is asked for again while it is drawn. */
const ASK_EVERY_MS = 2000;

/**
 * What the token change being tried reaches (Phase 3 of adjusting a component): asked whenever the change changes, then
 * again every few seconds while it is drawn; none while there is no change. A failure is said as its answer. The same in the
 * app and in VS Code.
 */
export const useChangeReach = (edits: TokenEdit[]): ChangeReach => {
	const [answer, setAnswer] = useState<ChangeReach>({ state: 'none' });
	// By what the change is, not which array holds it.
	const change = JSON.stringify(edits);
	useEffect(() => {
		const asked = JSON.parse(change) as TokenEdit[];
		if (asked.length === 0) return void setAnswer({ state: 'none' });
		let live = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		setAnswer({ state: 'building' });
		const ask = async () => {
			const r = await window.workspace.changeReach(asked);
			if (!live) return;
			const next: ChangeReach = r.ok ? r.value : { state: 'failed', error: r.error };
			setAnswer(next);
			if (next.state === 'building') timer = setTimeout(() => void ask(), ASK_EVERY_MS);
		};
		void ask();
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [change]);
	return answer;
};
