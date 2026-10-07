import { useCallback, useEffect, useRef, useState, type Ref, type RefObject } from 'react';

/**
 * Pop-ups and the preview.
 *
 * The preview is a native view that draws above everything in the window, so a tooltip, menu, dialog or
 * sheet that lands on it is hidden behind it. Rather than every pop-up reporting itself by hand, the shared
 * ui components register the element they draw (`useOverlayRef`), and the screen that owns a preview asks
 * whether anything is over it (`useOverlaps`). A new pop-up built from those components is covered with nothing
 * further to remember. Radix mounts the content only while it is open, so registering is just mounting.
 */
const open = new Set<HTMLElement>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** The ref for a pop-up's content element: registers it while it is on screen, and still forwards the caller's own ref. */
export const useOverlayRef = <T extends HTMLElement>(forwarded?: Ref<T>) => {
	const mine = useRef<T | null>(null);
	return useCallback(
		(el: T | null) => {
			if (mine.current) open.delete(mine.current);
			mine.current = el;
			if (el) open.add(el);
			emit();
			if (typeof forwarded === 'function') forwarded(el);
			else if (forwarded) forwarded.current = el;
		},
		[forwarded],
	);
};

const meets = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Whether any open pop-up is over the target's box. A pop-up is placed a frame or two after it mounts and
 * can animate, so while one is open the box is re-read every frame; with none open nothing runs.
 */
export const useOverlaps = (target: RefObject<HTMLElement | null>): boolean => {
	const [over, setOver] = useState(false);
	useEffect(() => {
		let frame = 0;
		const check = () => {
			const box = target.current?.getBoundingClientRect();
			setOver(!!box && [...open].some((el) => meets(el.getBoundingClientRect(), box)));
		};
		const tick = () => {
			check();
			frame = open.size > 0 ? requestAnimationFrame(tick) : 0;
		};
		const changed = () => {
			check();
			if (!frame && open.size > 0) frame = requestAnimationFrame(tick);
		};
		listeners.add(changed);
		changed();
		return () => {
			listeners.delete(changed);
			cancelAnimationFrame(frame);
		};
	}, [target]);
	return over;
};
