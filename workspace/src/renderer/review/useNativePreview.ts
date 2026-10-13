import { useEffect, useRef, useState } from 'react';
import { useOverlaps } from '../overlays';

/**
 * The native preview on the review screen: kept on its slot, and stepping aside for whatever is drawn over it.
 *
 * The preview is a native view, always drawn *above* the window's own content, so nothing of the window can be laid
 * over it. While the comment box is open, another section shows, or a tooltip, menu, dialog or sheet lands on it (they
 * register themselves, see overlays.ts), the preview is swapped for a picture of itself and that is drawn instead.
 * `ready` says when the box can be shown; `snapshot` is the picture, while there is one.
 */
export const useNativePreview = ({
	opened,
	hidden,
	composing,
	drawMarkers,
}: {
	/** The page is open in the native view. */
	opened: boolean;
	/** Another section is showing over this screen. */
	hidden: boolean;
	/** A comment is being written, in the box beside its pin. */
	composing: boolean;
	/** Draws the pins, so the picture has the one just placed. */
	drawMarkers: () => Promise<unknown>;
}) => {
	const slot = useRef<HTMLDivElement>(null);
	const [ready, setReady] = useState(false);
	const [snapshot, setSnapshot] = useState<string | null>(null);

	// Keep the native view on its slot, through window resizes and layout changes.
	useEffect(() => {
		if (!opened || !slot.current) return;
		const el = slot.current;
		const sync = () => {
			const r = el.getBoundingClientRect();
			void window.workspace.pageSetBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
		};
		sync();
		// Layout above the slot can move it without resizing it; a light poll catches that.
		const poll = setInterval(sync, 300);
		const observer = new ResizeObserver(sync);
		observer.observe(el);
		window.addEventListener('resize', sync);
		window.addEventListener('scroll', sync, true);
		return () => {
			clearInterval(poll);
			observer.disconnect();
			window.removeEventListener('resize', sync);
			window.removeEventListener('scroll', sync, true);
		};
	}, [opened]);

	const overlapped = useOverlaps(slot);
	const frozen = composing || hidden || overlapped;
	/**
	 * Frozen: the preview is swapped for a picture of itself. Thawed: the live view comes back.
	 *
	 * The order matters. Markers are drawn first so the picture includes the pin; the picture is on screen before the live
	 * view is hidden, so there is no flash of empty window; and a run counter drops the result of a freeze that was
	 * overtaken by the box closing again.
	 */
	const run = useRef(0);
	useEffect(() => {
		const mine = ++run.current;
		if (!frozen) {
			setReady(false);
			void window.workspace.pageHold('popover', false);
			const t = setTimeout(() => {
				if (mine === run.current) setSnapshot(null);
			}, 120);
			return () => clearTimeout(t);
		}
		if (!opened) {
			setReady(true); // nothing to freeze
			return;
		}
		void (async () => {
			await drawMarkers();
			const snap = await window.workspace.pageSnapshot();
			if (mine !== run.current) return;
			setSnapshot(snap.ok ? snap.value : null);
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			if (mine !== run.current) return;
			// Even with no picture the box has to be visible, so the preview still steps aside.
			await window.workspace.pageHold('popover', true);
			if (mine !== run.current) return;
			setReady(true);
		})();
	}, [frozen, opened]); // eslint-disable-line react-hooks/exhaustive-deps

	// Letting go on the way out matters: the holds live in the main process, and a preview left hidden would stay hidden
	// for the next iteration too. Dragging the sidebar's divider holds it for the drag (`ResizablePanel` says when).
	useEffect(
		() => () => {
			void window.workspace.pageHold('popover', false);
			void window.workspace.pageHold('resize', false);
		},
		[],
	);

	return { slot, ready, snapshot };
};
