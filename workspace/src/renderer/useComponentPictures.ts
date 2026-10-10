import { useEffect, useState } from 'react';
import type { ComponentPictures } from '../shared/contract';

/** How often the grid asks again while a pass that may replace its pictures is drawing. */
const ASK_EVERY_MS = 3000;

/**
 * The pictures of the shown design system's components (P5), by story file, while `shown` (the grid is on screen):
 * asked once, then again every few seconds while a pass is drawing, so each set appears as it is ready. The pictures
 * already there are kept meanwhile, never cleared. Asked again for another `commit` (a sync that moved the library).
 * `drawing` until the first answer says otherwise, so a card waits for its picture rather than saying it has none.
 */
export const useComponentPictures = (shown: boolean, commit: string | null): ComponentPictures => {
	const [pictures, setPictures] = useState<ComponentPictures>({ drawing: true, pictures: {}, issues: {} });
	useEffect(() => {
		if (!shown) return;
		let live = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const ask = async () => {
			const r = await window.workspace.componentPictures();
			if (!live || !r.ok) return;
			setPictures(r.value);
			if (r.value.drawing) timer = setTimeout(() => void ask(), ASK_EVERY_MS);
		};
		void ask();
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [shown, commit]);
	return pictures;
};
