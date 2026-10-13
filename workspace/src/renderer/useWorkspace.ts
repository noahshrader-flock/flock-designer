import { useEffect, useRef, useState } from 'react';
import type { RepositoryList, Result } from '../shared/contract';

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
		let live = true;
		setState((s) => ({ value: again ? s.value : null, error: null, loading: true }));
		void read().then((r) => {
			if (live) setState((s) => (r.ok ? { value: r.value, error: null, loading: false } : { value: s.value, error: r.error, loading: false }));
		});
		return () => {
			live = false;
		};
		// What is read is said by `deps`, as with an effect's own: `read` is a new function on every render.
	}, [enabled, asked, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
	return { ...state, reload: () => setAsked((n) => n + 1) };
};

/**
 * The repositories the signed-in person can see, as New and Connect choose from: read once a session and shared by both,
 * so neither waits for GitHub again, and read again after a clone (`refresh`, which puts one here) and whenever the sign-in
 * changes. Kept per app connection, so each test's fake app starts with none.
 */
const listed = new WeakMap<object, Promise<Result<RepositoryList>>>();
const listRepositories = (): Promise<Result<RepositoryList>> => {
	const api = window.workspace;
	const known = listed.get(api);
	if (known) return known;
	const asking = api.listRepositories().then((r) => {
		// A failure is not kept: the next screen to ask asks again.
		if (!r.ok) listed.delete(api);
		return r;
	});
	listed.set(api, asking);
	return asking;
};
export const useRepositories = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const list = useWorkspace(listRepositories, [], { enabled });
	const { reload } = list;
	useEffect(
		() =>
			window.workspace.onSignInChanged(() => {
				listed.delete(window.workspace);
				reload();
			}),
		[], // eslint-disable-line react-hooks/exhaustive-deps
	);
	return {
		...list,
		refresh: () => {
			listed.delete(window.workspace);
			reload();
		},
	};
};
