import { useEffect, useState } from 'react';
import type { ComponentPictures } from '../../../src/shared/contract';
import { askWhile } from './ask';
import { workspace } from '../host';

/**
 * The pictures of the shown design system's components (P5), by story file, while `shown` (the list or the grid is on screen):
 * asked once, then again every few seconds while a pass is drawing, so each set appears as it is ready. The pictures
 * already there are kept meanwhile, never cleared. Asked again for another `commit` (a sync that moved the library).
 * `drawing` until the first answer says otherwise, so a card or a row waits for its picture rather than saying it has none.
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
