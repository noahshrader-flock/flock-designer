import type { Catalog, WorkspaceApi } from '../../src/shared/contract';
import type { Shared } from './sharedValues';

/**
 * Read once for every page so the panel and each tab show the same commit. Only the latest read is shown, so a slow
 * answer never puts an older commit back.
 */
export class CatalogShare {
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

	/** What is shown stays, marked syncing, until GitHub answers. */
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
