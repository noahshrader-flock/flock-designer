import { useEffect, useRef, useState } from 'react';
import type { StoryPreview, TokenEdit } from '../../../src/shared/contract';
import { workspace } from '../host';
import { askOnce } from './ask';

/**
 * A component's stories, as its page shows them: built from the design system's branch once per commit, and built again
 * with the change to the tokens being tried (`edits`, T3). The stories shown stay while a change builds (`trying`); a
 * change that cannot be tried leaves them as they were and says why (`refused`). Only the answer to the newest ask is
 * kept (`askOnce`).
 */
export const useStoryPreview = (commit: string, edits: TokenEdit[]) => {
	const [preview, setPreview] = useState<StoryPreview | { state: 'building' }>({ state: 'building' });
	const [trying, setTrying] = useState(false);
	const [refused, setRefused] = useState<string | null>(null);
	// Each Try again builds afresh, as a commit not shown yet does; a change to the tokens is built over the stories shown.
	const [retries, setRetries] = useState(0);
	const shown = useRef<{ commit: string | null; retries: number }>({ commit: null, retries: 0 });
	useEffect(() => {
		const afresh = shown.current.commit !== commit || shown.current.retries !== retries;
		shown.current = { commit, retries };
		if (afresh) setPreview({ state: 'building' });
		setTrying(true);
		return askOnce(
			() => workspace().storyPreview(edits),
			(r) => {
				const next: StoryPreview = r.ok ? r.value : { state: 'failed', error: r.error };
				setTrying(false);
				const keep = edits.length > 0 && next.state === 'failed';
				setRefused(keep ? next.error : null);
				setPreview((was) => (keep && was.state === 'ready' ? was : next));
			},
		);
	}, [commit, edits, retries]);

	return { preview, trying, refused, retry: () => setRetries((n) => n + 1) };
};
