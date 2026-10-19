export const REFRESH_MS = 60_000;
export const IDLE_MS = 5 * 60_000;

export const USE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;

// Each look is a call to GitHub, so a window left open with nobody at it looks every few minutes, not every minute.
export const dueForCheck = ({ now, lastActive, lastChecked }: { now: number; lastActive: number; lastChecked: number }): boolean =>
	// A second's slack: a timer can fire a moment early, and missing by that would skip a whole interval.
	now - lastChecked + 1_000 >= (now - lastActive > IDLE_MS ? IDLE_MS : REFRESH_MS);
