import { useEffect, useRef, useState } from 'react';
import { useCatalogRead } from '../../src/renderer/useCatalogRead';
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
 * The design system the core shows (the one VS Code found, `showFound`), read as the app's tab reads it (`useCatalogRead`):
 * once `enabled`, at once from what its clone has, then again once GitHub has been asked for changes; after that only on
 * `sync`. Read afresh when another is found (`root`), and again when another commit of it is shown (`onLibraryShown`).
 * Its name is the core's, as connecting it would name it. `onRead` is told each catalog read, for what is kept of the
 * change being tried.
 */
export const useCatalog = (
	enabled: boolean,
	root: string | null,
	onRead: (catalog: Catalog) => void,
): CatalogRead & { sync: () => Promise<void> } => {
	const { catalog, error, syncing, sync, firstRead, forget, reread } = useCatalogRead(onRead);
	const [shown, setShown] = useState<{ id: string; name: string } | null>(null);
	// The root it was last read for: another found is read afresh, the same one is not read again when shown again.
	const readFor = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled || root === null || readFor.current === root) return;
		readFor.current = root;
		forget();
		void workspace()
			.designSystems()
			.then((r) => setShown(r.ok ? (r.value.systems.find((s) => s.id === r.value.current) ?? null) : null));
		void firstRead();
	}, [enabled, root, firstRead, forget]);

	// Read again whenever another commit of it is shown (Preview this branch), as every page is.
	useEffect(() => (enabled ? workspace().onLibraryShown(reread) : undefined), [enabled, reread]);

	return { catalog, id: shown?.id ?? null, name: shown?.name ?? null, error, syncing, sync };
};

/**
 * The design system shown, as a design system's tab reads it: once, when it opens, after saying it is ready (so the
 * extension tells it the change being tried), again on the note's Try again, and when another commit of it is shown.
 * `ready` once it is read and can be shown; else `note`, what the tab says instead: that it is being read, what went
 * wrong, or that it cannot be read (the panel says why).
 */
export const useTabCatalog = (): {
	ready: Extract<Catalog, { state: 'ready' }> | null;
	note: TabNoteOf | null;
} => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [asks, setAsks] = useState(0);
	useEffect(() => vscode().postMessage({ type: 'ready' }), []);
	// Read again whenever another commit of it is shown (Preview this branch).
	useEffect(() => workspace().onLibraryShown(() => setAsks((n) => n + 1)), []);
	useEffect(() => {
		setError(null);
		void workspace()
			.designSystemCatalog(false)
			.then((r) => (r.ok ? setCatalog(r.value) : setError(r.error)));
	}, [asks]);
	const ready = catalog?.state === 'ready' ? catalog : null;
	const retry = () => setAsks((n) => n + 1);
	const note =
		error !== null
			? { says: error, onRetry: retry }
			: catalog === null
				? { says: 'Reading the design system…', onRetry: null }
				: ready === null
					? { says: 'The design system cannot be read here: the DSNR panel says why.', onRetry: retry }
					: null;
	return { ready, note };
};

/** What a tab says instead of its design system, and how to read it again when that can help. */
export interface TabNoteOf {
	says: string;
	onRetry: (() => void) | null;
}
