import { type RefObject, useEffect, useState } from 'react';
import { PREVIEW_HEIGHT } from '../../../src/shared/catalog';

/** The tallest a frame grows to; past that it scrolls inside. A page saying more is not believed. */
const MAX_FRAME = 4000;

/** Heard from that frame alone: the only thing taken from a design system's page. */
export const useFrameHeight = (frame: RefObject<HTMLIFrameElement | null>): number => {
	const [height, setHeight] = useState(120);
	useEffect(() => {
		const heard = (e: MessageEvent) => {
			if (e.source !== frame.current?.contentWindow) return;
			const h = (e.data as Record<string, unknown> | null)?.[PREVIEW_HEIGHT];
			if (typeof h === 'number' && Number.isFinite(h)) setHeight(Math.min(Math.max(Math.ceil(h), 40), MAX_FRAME));
		};
		window.addEventListener('message', heard);
		return () => window.removeEventListener('message', heard);
	}, [frame]);
	return height;
};
