import type { Catalog } from '../../src/shared/contract';
import { asks } from './host';
import { useShared } from './shared';

/** The design system as the panel shows it: its catalog (null while it is first read), its name, and what went wrong. */
export interface CatalogRead {
	catalog: Catalog | null;
	/** The design system shown, by the core's id for it, and what it is called. */
	id: string | null;
	name: string | null;
	error: string | null;
	syncing: boolean;
}

/** Reads it again, asking GitHub for changes first: every page is told what it reads. */
export const syncDesignSystem = (): void => void asks().syncDesignSystem();

/**
 * The design system shown, as the panel shows it: the extension reads it once for every page (`CatalogShare`), at once
 * from what its clone has, then again once GitHub has been asked for changes, again on a sync, and when another commit of
 * it is shown, so the panel and every tab show the same commit.
 */
export const useCatalog = (): CatalogRead => {
	const { system, catalog, error, syncing } = useShared('catalog');
	return { catalog, id: system?.id ?? null, name: system?.name ?? null, error, syncing };
};

/**
 * The design system shown, as a design system's tab shows it: the same read as every page's, so it follows a Sync made in
 * the panel. `ready` once it is read and can be shown; else `note`, what the tab says instead: that it is being read,
 * what went wrong (and Try again, which reads it again), or that it cannot be read (the panel says why).
 */
export const useTabCatalog = (): {
	ready: Extract<Catalog, { state: 'ready' }> | null;
	note: TabNoteOf | null;
} => {
	const { catalog, error } = useShared('catalog');
	const ready = catalog?.state === 'ready' ? catalog : null;
	const retry = syncDesignSystem;
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
