import { useState } from 'react';
import type { Result } from '../../../src/shared/contract';

/**
 * A dialog's one action: `busy` while it runs (and asked again, nothing), the last error cleared before it tries again and
 * said when it fails, and `then` only once it has worked, with what it answered.
 */
export const useAction = () => {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const run = async <T>(ask: () => Promise<Result<T>>, then: (value: T) => void): Promise<void> => {
		if (busy) return;
		setBusy(true);
		setError(null);
		const r = await ask();
		setBusy(false);
		if (r.ok) then(r.value);
		else setError(r.error);
	};
	return { busy, error, run };
};
