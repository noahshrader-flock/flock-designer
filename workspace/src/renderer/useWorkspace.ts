import { useCallback, useState } from 'react';
import type { Result } from '../shared/contract';

/**
 * Runs one bridge call and keeps its outcome.
 *
 * Every operation can fail for an ordinary reason -- a dirty tree, a missing
 * descriptor, an agent that is not installed -- and the contract returns those
 * as values. This keeps the message so the screen can show it, instead of the
 * component deciding that a failure means "nothing happened".
 */
export const useCall = <T>() => {
	const [value, setValue] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const call = useCallback(async (fn: () => Promise<Result<T>>): Promise<T | null> => {
		setBusy(true);
		setError(null);
		try {
			const result = await fn();
			if (result.ok) {
				setValue(result.value);
				return result.value;
			}
			setError(result.error);
			return null;
		} finally {
			setBusy(false);
		}
	}, []);

	return { value, error, busy, call, setValue };
};
