import { type KeyboardEvent, type PointerEvent, type RefObject, useRef, useState } from 'react';

/** Of a box dragged to the bottom of the window, this much of its top stays in view, with its handle. */
const HANDLE_ROOM = 28;
const STEP = 16;
const BIG_STEP = 64;

const KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const clamp = (n: number, low: number, high: number): number => Math.min(Math.max(n, low), Math.max(low, high));

type Point = { x: number; y: number };
/** The box as measured (`room`), and where it would be with no offset (`base`). */
type Measured = { room: DOMRect; base: { left: number; top: number } };

/**
 * A box moved off the place it opened at, by the pointer or the arrow keys on its handle, and kept inside the window.
 * It is only this box's own state: it is not saved, so the next box opens where it always does.
 */
export const useMoved = (box: RefObject<HTMLElement | null>) => {
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [moving, setMoving] = useState(false);
	// Where the pointer and the offset were when it went down, and the box as it was then.
	const grab = useRef<(Point & Measured & { from: Point }) | null>(null);

	const measure = (from: Point): Measured | null => {
		const room = box.current?.getBoundingClientRect();
		return room ? { room, base: { left: room.left - from.x, top: room.top - from.y } } : null;
	};
	// A box may open partly out of the window (a pin near its edge): it is never pulled in, only kept from going further out.
	const within = (at: Measured, now: Point, want: Point): Point => ({
		x: clamp(want.x, Math.min(-at.base.left, now.x), Math.max(window.innerWidth - at.room.width - at.base.left, now.x)),
		y: clamp(want.y, Math.min(-at.base.top, now.y), Math.max(window.innerHeight - HANDLE_ROOM - at.base.top, now.y)),
	});

	const end = () => {
		grab.current = null;
		setMoving(false);
	};

	const handle = {
		onPointerDown: (e: PointerEvent<HTMLElement>) => {
			const at = measure(offset);
			if (!at) return;
			e.preventDefault();
			// Held by the handle, so a pointer that outruns it, or leaves the window, still carries the box.
			try {
				e.currentTarget.setPointerCapture(e.pointerId);
			} catch {
				// Moving still works without capture; it just follows the pointer less tightly.
			}
			grab.current = { x: e.clientX, y: e.clientY, from: offset, ...at };
			setMoving(true);
		},
		onPointerMove: (e: PointerEvent<HTMLElement>) => {
			const g = grab.current;
			if (g) setOffset(within(g, g.from, { x: g.from.x + e.clientX - g.x, y: g.from.y + e.clientY - g.y }));
		},
		onPointerUp: end,
		onPointerCancel: end,
		onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
			const way = KEYS[e.key];
			const at = measure(offset);
			if (!way || !at) return;
			e.preventDefault();
			const step = e.shiftKey ? BIG_STEP : STEP;
			setOffset(within(at, offset, { x: offset.x + way[0] * step, y: offset.y + way[1] * step }));
		},
	};
	return { offset, moving, handle };
};
