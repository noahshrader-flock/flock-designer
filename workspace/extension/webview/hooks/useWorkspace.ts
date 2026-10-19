import { useCallback, useEffect, useRef, useState } from 'react';
import type { Result } from '../../../src/shared/contract';
import { askOnce } from './ask';

/**
 * One way for a screen to read something from the app: what it read (`value`), why it could not (`error`, never thrown
 * away), whether it is reading (`loading`), and `reload`. Read again when `deps` change, when what it read before is
 * forgotten, since it was for something else; kept while the same is read again. An answer that comes back after the
 * screen asked for something else, or left, is dropped. Nothing is read while `enabled` is false.
 */
export const useWorkspace = <T>(read: () => Promise<Result<T>>, deps: unknown[], { enabled = true }: { enabled?: boolean } = {}) => {
	const [state, setState] = useState<{ value: T | null; error: string | null; loading: boolean }>({ value: null, error: null, loading: enabled });
	const [asked, setAsked] = useState(0);
	const lastAsked = useRef(asked);
	useEffect(() => {
		const again = lastAsked.current !== asked;
		lastAsked.current = asked;
		if (!enabled) return setState({ value: null, error: null, loading: false });
		setState((s) => ({ value: again ? s.value : null, error: null, loading: true }));
		return askOnce(read, (r) =>
			setState((s) => (r.ok ? { value: r.value, error: null, loading: false } : { value: s.value, error: r.error, loading: false })),
		);
		// What is read is said by `deps`, as with an effect's own: `read` is a new function on every render.
	}, [enabled, asked, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
	// The same `reload` every render, so an effect can depend on it.
	const reload = useCallback(() => setAsked((n) => n + 1), []);
	return { ...state, reload };
};
