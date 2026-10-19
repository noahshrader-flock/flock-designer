import { useEffect, useRef, useState } from 'react';
import type { Catalog, StoryPreview } from '../../../src/shared/contract';
import { drawsSpecimens } from '../../../src/shared/primitives';
import { workspace } from '../host';
import { askOnce } from './ask';

/** The design system's preview build, or that it is being asked for. */
export type SpecimenPreview = StoryPreview | { state: 'asking' };

/**
 * The design system's preview build, which a drawing that needs its own CSS (a type specimen) is drawn in, in the app and
 * in VS Code: asked for only when the design system has such a primitive, once for each commit it is answered for, and only
 * while `shown`.
 */
export const useSpecimenPreview = (catalog: Catalog | null, shown: boolean): SpecimenPreview => {
	const [preview, setPreview] = useState<SpecimenPreview>({ state: 'asking' });
	const commit = catalog?.state === 'ready' && drawsSpecimens(catalog.tokens.tokens) ? catalog.commit : null;
	const answeredFor = useRef<string | null>(null);
	useEffect(() => {
		if (!shown || commit === null || answeredFor.current === commit) return;
		setPreview({ state: 'asking' });
		return askOnce(
			() => workspace().storyPreview([]),
			(r) => {
				answeredFor.current = commit;
				setPreview(r.ok && r.value !== null ? r.value : { state: 'failed', error: r.ok ? 'it gave no answer' : r.error });
			},
		);
	}, [shown, commit]);
	return preview;
};
