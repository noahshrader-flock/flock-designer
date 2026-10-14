import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryPreview, TokenEdit } from '../shared/contract';

/**
 * A component's stories, as its page shows them: built from the design system's branch once per commit, and built again
 * with the change to the tokens being tried (`edits`, T3). The stories shown stay while a change builds (`trying`); a
 * change that cannot be tried leaves them as they were and says why (`refused`). Only the answer to the newest ask is
 * kept. The same in the app and in VS Code.
 */
export const useStoryPreview = (commit: string, edits: TokenEdit[]) => {
	const [preview, setPreview] = useState<StoryPreview | { state: 'building' }>({ state: 'building' });
	const [trying, setTrying] = useState(false);
	const [refused, setRefused] = useState<string | null>(null);
	const asked = useRef(0);

	const build = useCallback(async (change: TokenEdit[], afresh: boolean) => {
		const ask = ++asked.current;
		if (afresh) setPreview({ state: 'building' });
		setTrying(true);
		const r = await window.workspace.storyPreview(change);
		if (ask !== asked.current) return;
		const next: StoryPreview = r.ok ? r.value : { state: 'failed', error: r.error };
		setTrying(false);
		const keep = change.length > 0 && next.state === 'failed';
		setRefused(keep ? next.error : null);
		setPreview((shown) => (keep && shown.state === 'ready' ? shown : next));
	}, []);
	// Afresh for a commit not shown yet; a change to the tokens is built over the stories shown.
	const shownCommit = useRef<string | null>(null);
	useEffect(() => {
		const afresh = shownCommit.current !== commit;
		shownCommit.current = commit;
		void build(edits, afresh);
	}, [build, commit, edits]);

	return { preview, trying, refused, retry: () => void build(edits, true) };
};
