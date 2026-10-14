import { useCallback, useRef, useState } from 'react';
import type { Catalog } from '../shared/contract';

/**
 * The design system shown, read as the app's tab and VS Code's panel both read it: `firstRead` at once from what its clone
 * has, then again once GitHub has been asked for changes; `sync` after that. `onRead` is told each catalog read, for what
 * is kept of it (the change being tried: `editsKept`).
 */
export const useCatalogRead = (onRead: (catalog: Catalog) => void = () => undefined) => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	// The caller's latest, so what it keeps is read from what it has when the answer comes.
	const told = useRef(onRead);
	told.current = onRead;

	const ask = useCallback(async (refresh: boolean): Promise<Catalog | null> => {
		const r = await window.workspace.designSystemCatalog(refresh);
		if (!r.ok) {
			setError(r.error);
			return null;
		}
		setError(null);
		setCatalog(r.value);
		told.current(r.value);
		return r.value;
	}, []);

	const sync = useCallback(async () => {
		setSyncing(true);
		try {
			await ask(true);
		} finally {
			setSyncing(false);
		}
	}, [ask]);

	// The first answer is what the clone already has; the second is after GitHub was asked for changes.
	const firstRead = useCallback(async () => {
		const first = await ask(false);
		if (first?.state === 'ready' && first.update === 'updating') void sync();
	}, [ask, sync]);

	/** Forgets what was read, for another design system shown. */
	const forget = useCallback(() => {
		setCatalog(null);
		setError(null);
	}, []);

	return { catalog, error, setError, syncing, sync, firstRead, forget };
};
