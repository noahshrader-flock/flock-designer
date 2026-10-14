import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedDesignSystems, Result, TokenEdit } from '../shared/contract';
import { editsKept } from '../shared/tokens';
import { useCatalogRead } from './useCatalogRead';

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
	const [edits, setEdits] = useState<TokenEdit[]>([]);
	const { catalog, error, setError, syncing, sync, firstRead, forget } = useCatalogRead((read) => setEdits((all) => editsKept(all, read)));
	// The design systems connected, and which is shown; and whether another is being connected.
	const [systems, setSystems] = useState<ConnectedDesignSystems>({ systems: [], current: null });
	const [adding, setAdding] = useState(false);
	// How many times another has been shown: a view keyed by it starts over for each (its search, its closed groups).
	const [generation, setGeneration] = useState(0);
	const started = useRef(false);

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
		forget();
		setEdits([]);
		await listSystems();
		await firstRead();
	}, [onChanged, listSystems, firstRead, forget]);

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
