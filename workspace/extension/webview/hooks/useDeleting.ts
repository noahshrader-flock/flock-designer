import { useEffect, useState } from 'react';
import type { Prototype } from '../../../src/shared/domain/prototypes';
import { workspace } from '../host';

/**
 * The prototypes being deleted: from the press until the list no longer has them, so a card says so the whole time it is
 * going. One refused is no longer being deleted, and `onRefused` is told why.
 */
export const useDeleting = (prototypes: Prototype[] | null, reload: () => void, onRefused: (prototypeId: string, error: string) => void) => {
	const [deleting, setDeleting] = useState<string[]>([]);
	useEffect(() => {
		if (prototypes !== null) setDeleting((now) => now.filter((id) => prototypes.some((p) => p.id === id)));
	}, [prototypes]);
	const remove = async (prototypeId: string, typed: string): Promise<void> => {
		setDeleting((now) => [...now, prototypeId]);
		const r = await workspace().deletePrototype(prototypeId, typed);
		if (r.ok) return reload();
		setDeleting((now) => now.filter((id) => id !== prototypeId));
		onRefused(prototypeId, r.error);
	};
	return { deleting, remove };
};
