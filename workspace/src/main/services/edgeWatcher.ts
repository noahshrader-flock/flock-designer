import type { PageBounds } from '../../shared/contract';

/**
 * Notices when the pointer rests near the right edge of the preview.
 *
 * The preview is a native view above the window's own UI, so the pointer over it
 * is delivered to the preview, never to the app: a hover zone drawn in the app
 * could not see it. The main process can ask the system where the pointer is, so
 * it does, and says when the pointer has stayed in the zone.
 *
 * A short dwell is required because the same strip is where the page's own
 * scrollbar is. Brushing past it, or reaching for the scrollbar, must not throw a
 * panel over the page.
 */

export interface Point {
	x: number;
	y: number;
}

/** Is the pointer, in window coordinates, inside the strip at the right of the preview? */
export const inRightEdge = (pointer: Point, view: PageBounds, zone: number): boolean =>
	view.width > 0 &&
	pointer.y >= view.y &&
	pointer.y <= view.y + view.height &&
	pointer.x >= view.x + view.width - zone &&
	pointer.x <= view.x + view.width;

export interface EdgeDeps {
	/** The pointer in window coordinates, or null if it is outside the window. */
	pointer: () => Point | null;
	view: () => PageBounds;
	now: () => number;
	onChange: (near: boolean) => void;
}

export class EdgeWatcher {
	private since: number | null = null;
	private near = false;

	constructor(
		private readonly deps: EdgeDeps,
		private readonly zone = 40,
		private readonly dwellMs = 350,
	) {}

	/** Called on a timer. Reports only when the answer changes. */
	tick(): void {
		const p = this.deps.pointer();
		const inside = p !== null && inRightEdge(p, this.deps.view(), this.zone);
		if (!inside) {
			this.since = null;
			this.set(false);
			return;
		}
		this.since ??= this.deps.now();
		if (this.deps.now() - this.since >= this.dwellMs) this.set(true);
	}

	private set(near: boolean): void {
		if (near === this.near) return;
		this.near = near;
		this.deps.onChange(near);
	}
}
