import { useEffect, useRef, useState } from 'react';
import type { Catalog, StoryPreview } from '../../../src/shared/contract';
import { drawsSpecimens } from '../../../src/shared/primitives';
import { workspace } from '../host';
import { askOnce } from './ask';

export type SpecimenPreview = StoryPreview | { state: 'asking' };

/** What a drawing that needs the design system's own CSS (a type specimen) is drawn in. */
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
