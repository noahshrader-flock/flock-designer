import { type CSSProperties, useCallback, useEffect, useRef } from 'react';
import { PREVIEW_TRY } from '../../src/shared/catalog';
import type { TriedValue } from '../../src/shared/contract';
import { useFrameHeight } from './hooks/useFrameHeight';

/**
 * A page of the design system's preview, live, in a frame of its own: the library's code runs there, on this machine's own
 * server, an origin that is not the page's, so nothing in it can reach DSNR. Only its height is taken (`--frame-height`).
 * It is told the values tried (`tried`) whenever they change and whenever it loads, so it always has them.
 */
export const StoryFrame = ({ src, title, tried = [] }: { src: string; title: string; tried?: TriedValue[] }) => {
	const frame = useRef<HTMLIFrameElement>(null);
	const height = useFrameHeight(frame);
	const origin = new URL(src, location.href).origin;
	const now = useRef(tried);
	now.current = tried;
	const tell = useCallback(() => frame.current?.contentWindow?.postMessage({ [PREVIEW_TRY]: now.current }, origin), [origin]);
	// Said again whenever what is tried changes (by what it is, not which array holds it), and when the page loads.
	const told = JSON.stringify(tried);
	useEffect(tell, [told, tell]);
	return (
		<iframe
			ref={frame}
			src={src}
			title={title}
			onLoad={tell}
			sandbox="allow-scripts allow-same-origin"
			className="story-frame"
			style={{ '--frame-height': `${height}px` } as CSSProperties}
		/>
	);
};
