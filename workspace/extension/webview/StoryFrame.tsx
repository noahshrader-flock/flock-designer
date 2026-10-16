import { type CSSProperties, useCallback, useEffect, useRef } from 'react';
import { PREVIEW_TRY } from '../../src/shared/catalog';
import type { TriedValue } from '../../src/shared/contract';
import { useFrameHeight } from '../../src/renderer/useFrameHeight';

/**
 * A page of the design system's preview, live, in a frame of its own (a story file, or a type specimen), as the app's
 * `StoryFrame` frames one: the library's code runs there, served from this machine's own server, an origin that is not
 * the page's, so nothing in it can reach DSNR. The only thing taken from it is its height, and only from this frame: said as
 * `--frame-height`, which the stylesheet makes the frame's height, or overrides where the frame fills its pane instead.
 *
 * What it is told is the values being tried on the component's instances (`tried`, Phase 2 of adjusting a component), said
 * to the page at its own origin whenever they change and whenever it loads (a new build, a new address), so the page always
 * has them, and has none once there are none.
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
