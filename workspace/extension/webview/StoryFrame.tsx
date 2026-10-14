import { useRef } from 'react';
import { useFrameHeight } from '../../src/renderer/useFrameHeight';

/**
 * A page of the design system's preview, live, in a frame of its own (a story file, or a type specimen), as the app's
 * `StoryFrame` frames one: the library's code runs there, served from this machine's own server, an origin that is not
 * the page's, so nothing in it can reach DSNR. The only thing taken from it is its height, and only from this frame.
 */
export const StoryFrame = ({ src, title }: { src: string; title: string }) => {
	const frame = useRef<HTMLIFrameElement>(null);
	const height = useFrameHeight(frame);
	return <iframe ref={frame} src={src} title={title} sandbox="allow-scripts allow-same-origin" className="story-frame" style={{ height }} />;
};
