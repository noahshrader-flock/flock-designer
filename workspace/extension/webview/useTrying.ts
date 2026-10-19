import { useMemo, useState } from 'react';
import { type TriedValue, triedId } from '../../src/shared/contract';
import type { Trying } from './ComponentValues';
import { workspace } from './host';
import type { ValueTrials } from './shared';
import { triedOn } from './valueTrials';

/** A value that follows a token is written by the agent as it is tried, since only the agent can write one. */
export const useTrying = ({ trials, change }: ValueTrials, file: string, commit: string | null): Trying => {
	const values = triedOn(trials, file, commit);
	const tried = useMemo(() => new Map(values.map((t) => [triedId(t), t])), [values]);
	const [writes, setWrites] = useState(0);
	const [writeError, setWriteError] = useState<string | null>(null);
	const onWrite = (value: TriedValue) =>
		void workspace()
			.writeValue(file, value)
			.then((r) => {
				setWriteError(r.ok ? null : r.error);
				setWrites((n) => n + 1);
			});
	const set = (next: (was: TriedValue[]) => TriedValue[]) => commit !== null && change(file, commit, next);
	return {
		tried,
		onTry: (id, value) => {
			// In its place when it was tried before, so the list keeps its order; last when it is new.
			set((was) =>
				value === null
					? was.filter((t) => triedId(t) !== id)
					: was.some((t) => triedId(t) === id)
						? was.map((t) => (triedId(t) === id ? value : t))
						: [...was, value],
			);
			if (value?.follows !== undefined) onWrite(value);
		},
		onAll: (all) => set(() => all),
		onWrite,
		writes,
		writeError,
	};
};
