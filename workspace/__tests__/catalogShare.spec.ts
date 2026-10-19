import { describe, expect, it, vi } from 'vitest';
import { CatalogShare } from '../extension/src/catalogShare';
import { SHARED_START } from '../extension/src/messages';
import { Shared } from '../extension/src/sharedValues';
import type { Catalog, Result } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * The design system shown, read by the extension once for every page (QUALITY_PASS finding 4), so the panel and every tab
 * show the same commit and follow a Sync: what its clone has, then what GitHub has; again on Sync and on another branch
 * shown; and only the latest read shown.
 */

const ready = (commit: string, update: 'updating' | 'unchanged' = 'unchanged') =>
	({ state: 'ready', commit, update, showing: null }) as unknown as Catalog;
const FUI = { id: 'acme/ui', name: 'Acme UI' };

const world = () => {
	const answers: ((r: Result<Catalog>) => void)[] = [];
	const asked: boolean[] = [];
	let shown: () => void = () => undefined;
	const api = {
		designSystems: vi.fn(async () => ok({ systems: [{ ...FUI, repository: 'acme/ui', root: '/ui', folder: '', branch: 'main' }], current: FUI.id })),
		designSystemCatalog: vi.fn((refresh: boolean) => {
			asked.push(refresh);
			return new Promise<Result<Catalog>>((r) => answers.push(r));
		}),
		onLibraryShown: vi.fn((l: () => void) => ((shown = l), () => undefined)),
	};
	const post = vi.fn();
	const shared = new Shared('catalog', SHARED_START.catalog, post);
	const read = vi.fn();
	const share = new CatalogShare({ api: api as never, shared, onRead: read });
	/** The answer to the read asked `n`th, from the first. */
	const answer = async (n: number, r: Result<Catalog>) => {
		answers[n]?.(r);
		await new Promise((r2) => setTimeout(r2, 0));
	};
	return { share, shared, asked, answer, read, libraryShown: () => shown() };
};

describe('the design system, read once for every page', () => {
	it('is read from what its clone has, then again once GitHub has been asked, saying it is syncing meanwhile', async () => {
		const w = world();
		const started = w.share.start();
		await new Promise((r) => setTimeout(r, 0));
		expect(w.shared.current().system).toEqual(FUI);
		await w.answer(0, ok(ready('a1', 'updating')));
		expect(w.shared.current()).toMatchObject({ catalog: { commit: 'a1' }, syncing: true });
		await w.answer(1, ok(ready('b2')));
		await started;
		expect(w.asked).toEqual([false, true]);
		expect(w.shared.current()).toMatchObject({ catalog: { commit: 'b2' }, syncing: false, error: null });
		expect(w.read).toHaveBeenCalledTimes(2);
	});

	it('shows only the latest read: a slow answer to one asked before never puts an older commit back', async () => {
		const w = world();
		void w.share.start();
		await new Promise((r) => setTimeout(r, 0));
		// Synced while the first read is still out.
		void w.share.sync();
		await w.answer(1, ok(ready('new')));
		await w.answer(0, ok(ready('old')));
		expect(w.shared.current().catalog).toMatchObject({ commit: 'new' });
		expect(w.read).toHaveBeenCalledTimes(1);
	});

	it('is read again when another commit of it is shown, and says what went wrong, keeping what it shows', async () => {
		const w = world();
		void w.share.start();
		await new Promise((r) => setTimeout(r, 0));
		await w.answer(0, ok(ready('a1')));
		w.libraryShown();
		expect(w.asked).toEqual([false, false]);
		await w.answer(1, { ok: false, error: 'git could not read it.' });
		expect(w.shared.current()).toMatchObject({ catalog: { commit: 'a1' }, error: 'git could not read it.' });
	});
});
