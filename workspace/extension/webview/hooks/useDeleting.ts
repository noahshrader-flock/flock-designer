import { useEffect, useState } from 'react';
import type { Project } from '../../../src/shared/domain/projects';
import { workspace } from '../host';

/**
 * The projects being deleted: from the press until the list no longer has them, so a card says so the whole time it is
 * going. One refused is no longer being deleted, and `onRefused` is told why.
 */
export const useDeleting = (projects: Project[] | null, reload: () => void, onRefused: (projectId: string, error: string) => void) => {
	const [deleting, setDeleting] = useState<string[]>([]);
	useEffect(() => {
		if (projects !== null) setDeleting((now) => now.filter((id) => projects.some((p) => p.id === id)));
	}, [projects]);
	const remove = async (projectId: string, typed: string): Promise<void> => {
		setDeleting((now) => [...now, projectId]);
		const r = await workspace().deleteProject(projectId, typed);
		if (r.ok) return reload();
		setDeleting((now) => now.filter((id) => id !== projectId));
		onRefused(projectId, r.error);
	};
	return { deleting, remove };
};
