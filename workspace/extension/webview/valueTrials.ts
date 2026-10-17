import { createContext, useContext } from 'react';
import type { TriedValue } from '../../src/shared/contract';
import type { ValueTrials as Trials } from '../src/messages';

/**
 * The values tried on every component, as the extension keeps them (`ValueTrial`, CHANGES_PLAN Phase 2), and trying one
 * component's on a commit, from what it had to what it has now: what a page's parts read (`useValueTrials`), given where
 * the page starts (`useValueTrialsChoice`).
 */
export interface ValueTrials {
	trials: Trials;
	change: (file: string, commit: string, next: (was: TriedValue[]) => TriedValue[]) => void;
}

const ValueTrialsContext = createContext<ValueTrials>({ trials: {}, change: () => undefined });

export const ValueTrialsProvider = ValueTrialsContext.Provider;
export const useValueTrials = (): ValueTrials => useContext(ValueTrialsContext);

/** None tried: the one list, so a component with none is the same none every time it is asked. */
const NONE: TriedValue[] = [];

/** One component's values tried on this commit: none when they were tried on another, whose instances are named otherwise. */
export const triedOn = (trials: Trials, file: string, commit: string | null): TriedValue[] => {
	const kept = trials[file];
	return commit !== null && kept?.commit === commit ? kept.values : NONE;
};
