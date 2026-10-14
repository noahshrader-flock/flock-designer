import { useRef } from 'react';
import { useFrameHeight } from './useFrameHeight';

/**
 * A page of the design system's preview, live, in a frame of its own (a story file, or a type specimen): the library's code
 * runs there and nowhere else. The frame has the local server's origin, which is not the window's, so nothing in it can
 * reach the app (DESIGN_SYSTEM_PLAN.md, P1); its own origin is needed because the library reads `document.cookie` as it
 * loads. The only thing taken from it is its height, and only from this frame.
 */
export const StoryFrame = ({ src, title }: { src: string; title: string }) => {
	const frame = useRef<HTMLIFrameElement>(null);
	const height = useFrameHeight(frame);
	return (
		<iframe ref={frame} src={src} title={title} sandbox="allow-scripts allow-same-origin" className="block w-full border-0" style={{ height }} />
	);
};
