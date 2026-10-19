import type { TriedValue } from '../../src/shared/contract';
import type { ValueTrials as Trials } from '../src/messages';

const NONE: TriedValue[] = [];

/** One component's values tried on this commit: none when they were tried on another, whose instances are named otherwise. */
export const triedOn = (trials: Trials, file: string, commit: string | null): TriedValue[] => {
	const kept = trials[file];
	return commit !== null && kept?.commit === commit ? kept.values : NONE;
};
