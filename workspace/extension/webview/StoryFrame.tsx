import { useEffect, useRef, useState } from 'react';
import { PREVIEW_HEIGHT } from '../../src/shared/catalog';

/** The tallest a frame grows to; past that it scrolls inside. A page saying more is not believed. */
const MAX_FRAME = 4000;

/**
 * A page of the design system's preview, live, in a frame of its own (a story file, or a type specimen), as the app's
 * `StoryFrame` frames one: the library's code runs there, served from this machine's own server, an origin that is not
 * the page's, so nothing in it can reach DSNR. The only thing taken from it is its height, and only from this frame.
 */
export const StoryFrame = ({ src, title }: { src: string; title: string }) => {
	const frame = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(120);
	useEffect(() => {
		const heard = (e: MessageEvent) => {
			if (e.source !== frame.current?.contentWindow) return;
			const h = (e.data as Record<string, unknown> | null)?.[PREVIEW_HEIGHT];
			if (typeof h === 'number' && Number.isFinite(h)) setHeight(Math.min(Math.max(Math.ceil(h), 40), MAX_FRAME));
		};
		window.addEventListener('message', heard);
		return () => window.removeEventListener('message', heard);
	}, []);
	return <iframe ref={frame} src={src} title={title} sandbox="allow-scripts allow-same-origin" className="story-frame" style={{ height }} />;
};
