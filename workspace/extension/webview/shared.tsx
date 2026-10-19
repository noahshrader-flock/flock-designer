import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { TokenEdit, TriedValue } from '../../src/shared/contract';
import type { Theme } from '../../src/shared/prototypeTheme';
import { SHARED_START, type SharedName, type SharedValues, sameShared, withTrial } from '../src/messages';
import { asks, onHost } from './host';
import { triedOn } from './valueTrials';
import { vscode } from './vscode';

/**
 * The values every DSNR page shows the same, as the extension keeps them (`SharedValues`, its `Shared`): heard as they
 * change, and all of them once the page says it is ready, which this says, once it listens. One provider, at the root of
 * every page (`main.tsx`); one hook for each value (`useShared`).
 */
interface Held {
	values: SharedValues;
	/**
	 * Keeps a value the page changed at once, before the extension says it back, so changes made in a row build on each
	 * other; whether it was another value than the one held.
	 */
	keep: <K extends SharedName>(name: K, value: SharedValues[K]) => boolean;
	/** What is kept now, for a change worked out from it. */
	now: () => SharedValues;
}

const SharedContext = createContext<Held>({ values: SHARED_START, keep: () => false, now: () => SHARED_START });

export const SharedProvider = ({ children }: { children: ReactNode }) => {
	const [values, setValues] = useState<SharedValues>(SHARED_START);
	const latest = useRef(values);
	const keep = useCallback(<K extends SharedName>(name: K, value: SharedValues[K]) => {
		// The one held again (a change to the tokens in another order): nothing that reads it is done again.
		if (sameShared(name, value, latest.current[name])) return false;
		latest.current = { ...latest.current, [name]: value };
		setValues(latest.current);
		return true;
	}, []);
	useEffect(() => {
		const stop = onHost((m) => m.type === 'shared' && keep(m.name, m.value));
		// Said once the page listens, so nothing it is told is sent before it can be heard.
		vscode().postMessage({ type: 'ready' });
		return stop;
	}, [keep]);
	const held = useMemo(() => ({ values, keep, now: () => latest.current }), [values, keep]);
	return <SharedContext.Provider value={held}>{children}</SharedContext.Provider>;
};

/** A value every page shows the same. */
export const useShared = <K extends SharedName>(name: K): SharedValues[K] => useContext(SharedContext).values[name];

/** The change to the tokens being tried, and changing it: kept here at once, and told to the extension, which tells every page. */
export const useTokenEdits = (): [TokenEdit[], (edits: TokenEdit[]) => void] => {
	const { values, keep } = useContext(SharedContext);
	const set = useCallback(
		(next: TokenEdit[]) => {
			if (keep('tokenEdits', next)) void asks().setTokenEdits(next);
		},
		[keep],
	);
	return [values.tokenEdits, set];
};

/** The mode components are shown in, and choosing another, as the token edits are changed. */
export const useMode = (): [Theme, (mode: Theme) => void] => {
	const { values, keep } = useContext(SharedContext);
	const choose = useCallback(
		(next: Theme) => {
			if (keep('mode', next)) void asks().setMode(next);
		},
		[keep],
	);
	return [values.mode, choose];
};

/** The values tried on every component, and how one component's are changed, from what is kept now. */
export interface ValueTrials {
	trials: SharedValues['valueTrials'];
	change: (file: string, commit: string, next: (was: TriedValue[]) => TriedValue[]) => void;
}

/** The values tried on every component, and changing one's, as the token edits are changed. */
export const useValueTrials = (): ValueTrials => {
	const { values, keep, now } = useContext(SharedContext);
	const change = useCallback<ValueTrials['change']>(
		(file, commit, next) => {
			const was = now().valueTrials;
			const tried = next(triedOn(was, file, commit));
			if (keep('valueTrials', withTrial(was, file, commit, tried))) void asks().setValueTrial(file, commit, tried);
		},
		[keep, now],
	);
	return useMemo(() => ({ trials: values.valueTrials, change }), [values.valueTrials, change]);
};
