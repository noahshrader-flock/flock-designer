import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { TokenEdit, TriedValue } from '../../src/shared/contract';
import type { Theme } from '../../src/shared/prototypeTheme';
import { sameChange } from '../../src/shared/tokens';
import { SHARED_START, type SharedName, type SharedValues } from '../src/messages';
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
	/** Keeps a value the page changed at once, before the extension says it back, so changes made in a row build on each other. */
	keep: <K extends SharedName>(name: K, value: SharedValues[K]) => void;
	/** What is kept now, for a change worked out from it. */
	now: () => SharedValues;
}

/** When a value told is the one held, so nothing that reads it is done again: a change to the tokens in another order is the same change. */
const SAME: { [K in SharedName]?: (a: SharedValues[K], b: SharedValues[K]) => boolean } = { tokenEdits: sameChange };

const SharedContext = createContext<Held>({ values: SHARED_START, keep: () => undefined, now: () => SHARED_START });

export const SharedProvider = ({ children }: { children: ReactNode }) => {
	const [values, setValues] = useState<SharedValues>(SHARED_START);
	const latest = useRef(values);
	const keep = useCallback(<K extends SharedName>(name: K, value: SharedValues[K]) => {
		if ((SAME[name] as ((a: SharedValues[K], b: SharedValues[K]) => boolean) | undefined)?.(value, latest.current[name])) return;
		latest.current = { ...latest.current, [name]: value };
		setValues(latest.current);
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
	const { values, keep, now } = useContext(SharedContext);
	const set = useCallback(
		(next: TokenEdit[]) => {
			if (sameChange(next, now().tokenEdits)) return;
			keep('tokenEdits', next);
			void asks().setTokenEdits(next);
		},
		[keep, now],
	);
	return [values.tokenEdits, set];
};

/** The mode components are shown in, and choosing another, as the token edits are changed. */
export const useMode = (): [Theme, (mode: Theme) => void] => {
	const { values, keep } = useContext(SharedContext);
	const choose = useCallback(
		(next: Theme) => {
			keep('mode', next);
			void asks().setMode(next);
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
			const { [file]: _gone, ...rest } = was;
			keep('valueTrials', tried.length === 0 ? rest : { ...rest, [file]: { commit, values: tried } });
			void asks().setValueTrial(file, commit, tried);
		},
		[keep, now],
	);
	return useMemo(() => ({ trials: values.valueTrials, change }), [values.valueTrials, change]);
};
