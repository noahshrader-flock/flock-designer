import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Remembers the window's size and place, so it opens the way it was left.
 *
 * Only numbers are kept, and they are checked on the way back in: a screen that has since been
 * unplugged, or a hand-edited file, can never put the window out of reach or at a useless size.
 */
export interface WindowState {
	width: number;
	height: number;
	/** Absent when the position is not worth restoring (never moved, or its screen is gone). */
	x?: number;
	y?: number;
	maximized?: boolean;
}

interface Area {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const MIN_WINDOW = { width: 900, height: 560 };

/**
 * What to open with, given what was saved and the screens there are now.
 * The size is kept within the largest screen and above a usable minimum. The position is kept only when
 * enough of the window would be on a screen to grab and move it back (its top-left corner area), else the
 * system places it.
 */
export const restoreState = (saved: unknown, screens: Area[], fallback: { width: number; height: number }): WindowState => {
	const s = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
	const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
	const biggest = screens.reduce(
		(a, b) => (b.width * b.height > a.width * a.height ? b : a),
		screens[0] ?? { x: 0, y: 0, width: 1920, height: 1080 },
	);
	const clamp = (v: number | null, lo: number, hi: number, dflt: number): number => (v === null ? dflt : Math.min(Math.max(v, lo), Math.max(lo, hi)));
	const width = clamp(num(s.width), MIN_WINDOW.width, biggest.width, fallback.width);
	const height = clamp(num(s.height), MIN_WINDOW.height, biggest.height, fallback.height);
	const x = num(s.x);
	const y = num(s.y);
	const onScreen =
		x !== null &&
		y !== null &&
		screens.some((a) => {
			// A strip of the title area, 100px wide, must lie inside some screen.
			const grabLeft = Math.max(x, a.x);
			const grabRight = Math.min(x + width, a.x + a.width);
			return grabRight - grabLeft >= 100 && y >= a.y && y < a.y + a.height - 40;
		});
	return { width, height, ...(onScreen ? { x: x as number, y: y as number } : {}), ...(s.maximized === true ? { maximized: true } : {}) };
};

export class WindowMemory {
	constructor(private readonly file: string) {}

	static defaultPath = (userData: string): string => join(userData, 'window.json');

	read(): unknown {
		try {
			return JSON.parse(readFileSync(this.file, 'utf8'));
		} catch {
			return null;
		}
	}

	write(state: WindowState): void {
		try {
			mkdirSync(dirname(this.file), { recursive: true });
			writeFileSync(this.file, JSON.stringify(state));
		} catch {
			// Not remembering is an inconvenience, never a reason to fail.
		}
	}
}
