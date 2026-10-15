/** How often an open iteration looks for new comments while someone is using it. */
export const REFRESH_MS = 60_000;
/** After this long with nobody touching it, it looks less often. */
export const IDLE_MS = 5 * 60_000;
/** How often it looks while nobody is there. */
export const IDLE_REFRESH_MS = 5 * 60_000;

/**
 * Whether it is time to look for new comments: each look is a call to GitHub, so a window left open with nobody at it
 * looks every few minutes, not every minute. Coming back to it (focus) always looks, whatever this says.
 */
export const dueForCheck = ({ now, lastActive, lastChecked }: { now: number; lastActive: number; lastChecked: number }): boolean =>
	// A second's slack: a timer can fire a moment early, and missing by that would skip a whole interval.
	now - lastChecked + 1_000 >= (now - lastActive > IDLE_MS ? IDLE_REFRESH_MS : REFRESH_MS);
