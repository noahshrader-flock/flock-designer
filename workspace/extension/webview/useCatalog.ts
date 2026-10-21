import type { Catalog } from '../../src/shared/contract';
import { asks } from './host';
import { useShared } from './shared';

interface CatalogRead {
	catalog: Catalog | null;
	id: string | null;
	name: string | null;
	error: string | null;
	syncing: boolean;
}

/** Asks GitHub for changes first; every page is told what it reads. */
export const syncDesignSystem = (): void => void asks().syncDesignSystem();

/** Read once by the extension for every page (`CatalogShare`), so the panel and every tab show the same commit. */
export const useCatalog = (): CatalogRead => {
	const { system, catalog, error, syncing } = useShared('catalog');
	return { catalog, id: system?.id ?? null, name: system?.name ?? null, error, syncing };
};

export const useTabCatalog = (): { ready: Extract<Catalog, { state: 'ready' }>; note: null } | { ready: null; note: TabNoteOf } => {
	const { catalog, error } = useShared('catalog');
	const ready = catalog?.state === 'ready' ? catalog : null;
	const retry = syncDesignSystem;
	if (error !== null) return { ready: null, note: { says: error, onRetry: retry } };
	if (ready !== null) return { ready, note: null };
	return catalog === null
		? { ready: null, note: { says: 'Reading the design system…', onRetry: null, waiting: true } }
		: { ready: null, note: { says: 'The design system cannot be read here: the DSNR panel says why.', onRetry: retry } };
};

interface TabNoteOf {
	says: string;
	onRetry: (() => void) | null;
	waiting?: boolean;
}
