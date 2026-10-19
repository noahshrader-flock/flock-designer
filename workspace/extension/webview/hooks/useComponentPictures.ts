import { useEffect, useState } from 'react';
import type { ComponentPictures } from '../../../src/shared/contract';
import { askWhile } from './ask';
import { workspace } from '../host';

/**
 * The pictures of the shown design system's components, by story file, while `shown`: asked again every few seconds while a
 * pass is drawing, keeping those already there, and again for another `commit`. `drawing` until the first answer says
 * otherwise, so a card or a row waits for its picture rather than saying it has none.
 */
export const useComponentPictures = (shown: boolean, commit: string | null): ComponentPictures => {
	const [pictures, setPictures] = useState<ComponentPictures>({ drawing: true, pictures: {}, issues: {} });
	useEffect(() => {
		if (!shown) return;
		// One that failed keeps the pictures there, and is not asked again.
		return askWhile(
			() => workspace().componentPictures(),
			(r) => r.ok && r.value.drawing,
			(r) => {
				if (r.ok) setPictures(r.value);
			},
		);
	}, [shown, commit]);
	return pictures;
};
