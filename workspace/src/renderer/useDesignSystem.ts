import { useCallback, useEffect, useRef, useState } from 'react';
import type { Catalog, ConnectedDesignSystems, Result, TokenEdit } from '../shared/contract';

/**
 * The design system shown on the Design System tab, and everything done to it that is not about one view of it: the
 * catalog as read from its clone on this machine, the change being tried on its tokens, the systems connected and which is
 * shown (P4), a sync, and switching to or removing one. The tab's header, its components and its side panel all read it, so
 * none of them reads anything twice and they never disagree.
 *
 * It reads once when first shown, at once from what the clone has, then again when GitHub has been asked for changes; after
 * that only when Sync is pressed. A design system shown afresh (connected, switched to, or the one shown removed) starts
 * with no change on its tokens, and a sync keeps only the edits of tokens the library still has. `onChanged` is told when
 * another is shown, for what the screen keeps of the last one (the component it had open).
 */
export const useDesignSystem = (hidden: boolean, onChanged: () => void) => {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [edits, setEdits] = useState<TokenEdit[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	// The design systems connected, and which is shown; and whether another is being connected.
	const [systems, setSystems] = useState<ConnectedDesignSystems>({ systems: [], current: null });
	const [adding, setAdding] = useState(false);
	// How many times another has been shown: a view keyed by it starts over for each (its search, its closed groups).
	const [generation, setGeneration] = useState(0);
	const started = useRef(false);

	const ask = useCallback(async (refresh: boolean): Promise<Catalog | null> => {
		const r = await window.workspace.designSystemCatalog(refresh);
		if (!r.ok) {
			setError(r.error);
			return null;
		}
		setError(null);
		setCatalog(r.value);
		const paths = new Set(r.value.state === 'ready' ? r.value.tokens.tokens.map((t) => t.path) : []);
		setEdits((all) => (all.every((e) => paths.has(e.path)) ? all : all.filter((e) => paths.has(e.path))));
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

	const listSystems = useCallback(async () => {
		const r = await window.workspace.designSystems();
		if (r.ok) setSystems(r.value);
	}, []);

	useEffect(() => {
		if (hidden || started.current) return;
		started.current = true;
		void listSystems();
		void firstRead();
	}, [hidden, firstRead, listSystems]);

	// Another one shown (connected, switched to, or the one shown removed): read afresh, at its list.
	const showAnother = useCallback(async () => {
		setAdding(false);
		setGeneration((n) => n + 1);
		onChanged();
		setCatalog(null);
		setEdits([]);
		await listSystems();
		await firstRead();
	}, [onChanged, listSystems, firstRead]);

	// Switching to one, or removing the one shown: either way another is shown, or what went wrong is said.
	const thenShow = async (done: Promise<Result<null>>) => {
		const r = await done;
		if (r.ok) void showAnother();
		else setError(r.error);
	};

	return {
		catalog,
		edits,
		setEdits,
		error,
		syncing,
		systems,
		shown: systems.systems.find((s) => s.id === systems.current) ?? null,
		adding,
		setAdding,
		generation,
		sync,
		showAnother,
		select: (id: string) => thenShow(window.workspace.selectDesignSystem(id)),
		remove: (id: string) => thenShow(window.workspace.removeDesignSystem(id)),
	};
};

/** What the screen reads: the design system as it is shown, and what is done to it. */
export type DesignSystemState = ReturnType<typeof useDesignSystem>;
