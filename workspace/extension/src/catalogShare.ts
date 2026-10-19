import type { Catalog, WorkspaceApi } from '../../src/shared/contract';
import type { Shared } from './sharedValues';

/**
 * The design system shown, read by the extension once for every page (`CatalogState`), so the panel and each design
 * system's tab show the same commit, and an open tab follows a Sync (QUALITY_PASS finding 4): at once from what its clone
 * has, then again once GitHub has been asked for changes (`start`); again on Sync (`sync`); and again whenever another
 * commit of it is shown (Preview this branch). Only the latest read is shown: an answer to one asked before it is dropped,
 * so a slow answer never puts an older commit back. `onRead` is told each catalog read, for what is kept of it (the change
 * being tried).
 */
export class CatalogShare {
	/** Each read's turn: only the latest asked is shown. */
	private turn = 0;

	constructor(
		private readonly deps: {
			api: Pick<WorkspaceApi, 'designSystemCatalog' | 'designSystems' | 'onLibraryShown'>;
			shared: Shared<'catalog'>;
			onRead: (catalog: Catalog) => void;
		},
	) {
		deps.api.onLibraryShown(() => void this.read(false));
	}

	/** Read afresh for the design system shown now, the first or another found: what its clone has, then what GitHub has. */
	async start(): Promise<void> {
		const turn = ++this.turn;
		const systems = await this.deps.api.designSystems();
		if (turn !== this.turn) return;
		const shown = systems.ok ? (systems.value.systems.find((s) => s.id === systems.value.current) ?? null) : null;
		this.deps.shared.set({ system: shown && { id: shown.id, name: shown.name }, catalog: null, error: null, syncing: false });
		if (shown === null) return;
		const first = await this.read(false);
		if (first?.state === 'ready' && first.update === 'updating') await this.sync();
	}

	/** Read again, asking GitHub for changes first: what is shown stays until the answer, said to be syncing. */
	async sync(): Promise<void> {
		this.deps.shared.set({ ...this.deps.shared.current(), syncing: true });
		await this.read(true);
	}

	private async read(refresh: boolean): Promise<Catalog | null> {
		const turn = ++this.turn;
		const r = await this.deps.api.designSystemCatalog(refresh);
		if (turn !== this.turn) return null;
		const now = this.deps.shared.current();
		if (!r.ok) {
			this.deps.shared.set({ ...now, error: r.error, syncing: false });
			return null;
		}
		this.deps.shared.set({ ...now, catalog: r.value, error: null, syncing: false });
		this.deps.onRead(r.value);
		return r.value;
	}
}
