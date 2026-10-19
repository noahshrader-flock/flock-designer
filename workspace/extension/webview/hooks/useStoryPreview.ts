import { useEffect, useRef, useState } from 'react';
import type { StoryPreview, TokenEdit } from '../../../src/shared/contract';
import { workspace } from '../host';
import { askOnce } from './ask';

/** The stories shown stay while a change builds (`trying`); only the answer to the newest ask is kept. */
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
