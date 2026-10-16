import { useEffect, useState } from 'react';
import type { ChangeReach, TokenEdit } from '../shared/contract';
import { askWhile } from './askWhile';

/**
 * What the token change being tried reaches (Phase 3 of adjusting a component): asked whenever the change changes, then
 * again while it is drawn; none while there is no change. A failure is said as its answer. The same in the app and in
 * VS Code.
 */
export const useChangeReach = (edits: TokenEdit[]): ChangeReach => {
	const [answer, setAnswer] = useState<ChangeReach>({ state: 'none' });
	// By what the change is, not which array holds it.
	const change = JSON.stringify(edits);
	useEffect(() => {
		const asked = JSON.parse(change) as TokenEdit[];
		if (asked.length === 0) return void setAnswer({ state: 'none' });
		setAnswer({ state: 'building' });
		return askWhile(
			async (): Promise<ChangeReach> => {
				const r = await window.workspace.changeReach(asked);
				return r.ok ? r.value : { state: 'failed', error: r.error };
			},
			(next) => next.state === 'building',
			setAnswer,
		);
	}, [change]);
	return answer;
};
