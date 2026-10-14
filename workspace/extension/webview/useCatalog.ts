import { useCallback, useEffect, useRef, useState } from 'react';
import type { Catalog } from '../../src/shared/contract';
import { workspace } from './host';
import { vscode } from './vscode';

/** The design system as the panel reads it: its catalog (null while it is first read), its name, and what went wrong. */
export interface CatalogRead {
	catalog: Catalog | null;
	/** The design system shown, by the core's id for it, and what it is called. */
	id: string | null;
	name: string | null;
	error: string | null;
	syncing: boolean;
}

/**
 * The design system the core shows (the one VS Code found, `showFound`), read as the app's tab reads it (`useDesignSystem`):
 * once `enabled`, at once from what its clone has, then again once GitHub has been asked for changes; after that only on
 * `sync`. Read afresh when another is found (`root`). Its name is the core's, as connecting it would name it.
 */
export const useCatalog = (enabled: boolean, root: string | null): CatalogRead & { sync: () => Promise<void> } => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [shown, setShown] = useState<{ id: string; name: string } | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	// The root it was last read for: another found is read afresh, the same one is not read again when shown again.
	const readFor = useRef<string | null>(null);

	const ask = useCallback(async (refresh: boolean): Promise<Catalog | null> => {
		const r = await workspace().designSystemCatalog(refresh);
		if (!r.ok) {
			setError(r.error);
			return null;
		}
		setError(null);
		setCatalog(r.value);
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

	useEffect(() => {
		if (!enabled || root === null || readFor.current === root) return;
		readFor.current = root;
		setCatalog(null);
		setError(null);
		void workspace()
			.designSystems()
			.then((r) => setShown(r.ok ? (r.value.systems.find((s) => s.id === r.value.current) ?? null) : null));
		void ask(false).then((first) => {
			// The first answer is what the clone already has; the second is after GitHub was asked for changes.
			if (first?.state === 'ready' && first.update === 'updating') void sync();
		});
	}, [enabled, root, ask, sync]);

	return { catalog, id: shown?.id ?? null, name: shown?.name ?? null, error, syncing, sync };
};

/**
 * The design system shown, as a design system's tab reads it: once, when it opens, after saying it is ready (so the
 * extension tells it the change being tried). Null while it is read; what went wrong, if it could not be.
 */
export const useTabCatalog = (): { catalog: Catalog | null; error: string | null } => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		vscode().postMessage({ type: 'ready' });
		void workspace()
			.designSystemCatalog(false)
			.then((r) => (r.ok ? setCatalog(r.value) : setError(r.error)));
	}, []);
	return { catalog, error };
};
