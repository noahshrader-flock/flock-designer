import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ValueTrials as Trials } from '../src/messages';
import { onHost } from './host';
import { type ValueTrials, triedOn } from './valueTrials';
import { vscode } from './vscode';

/**
 * The values tried on every component (the changes being tried, DESIGN_SYSTEM.md), as the extension keeps them
 * (`ValueTrial`), so the panel and every component's tab see the same: told whenever they change, and once the page says it
 * is ready. Trying a component's tells the extension, which tells every page; what is tried here is kept at once, so
 * several tried in a row each build on the last. Called once, where a page starts; its parts read it (`useValueTrials`).
 */
export const useValueTrialsChoice = (): ValueTrials => {
	const [trials, setTrials] = useState<Trials>({});
	const now = useRef(trials);
	const keep = useCallback((next: Trials) => {
		now.current = next;
		setTrials(next);
	}, []);
	useEffect(() => onHost((m) => m.type === 'value-trials' && keep(m.trials)), [keep]);
	const change = useCallback<ValueTrials['change']>(
		(file, commit, next) => {
			const values = next(triedOn(now.current, file, commit));
			const { [file]: _gone, ...rest } = now.current;
			keep(values.length === 0 ? rest : { ...rest, [file]: { commit, values } });
			vscode().postMessage({ type: 'value-trial', file, commit, values });
		},
		[keep],
	);
	return useMemo(() => ({ trials, change }), [trials, change]);
};
