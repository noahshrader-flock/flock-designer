import { describe, expect, it } from 'vitest';
import { IDLE_MS, IDLE_REFRESH_MS, REFRESH_MS, dueForCheck } from '../src/renderer/comments/refresh';

/**
 * How often an open iteration looks for new comments: about once a minute while someone is there, and only every few
 * minutes once nobody has touched it for a while (each check is a call to GitHub). Coming back checks at once, as before.
 */
describe('looking for new comments', () => {
	const at = 1_000_000_000;

	it('checks every minute while someone is using it', () => {
		expect(dueForCheck({ now: at, lastActive: at - 10_000, lastChecked: at - REFRESH_MS })).toBe(true);
		// A timer that fires a moment early still counts.
		expect(dueForCheck({ now: at, lastActive: at - 10_000, lastChecked: at - REFRESH_MS + 50 })).toBe(true);
		expect(dueForCheck({ now: at, lastActive: at - 10_000, lastChecked: at - REFRESH_MS + 5_000 })).toBe(false);
	});

	it('checks only every few minutes once nobody has touched it for a while', () => {
		const away = at - IDLE_MS - 1;
		expect(dueForCheck({ now: at, lastActive: away, lastChecked: at - REFRESH_MS })).toBe(false);
		expect(dueForCheck({ now: at, lastActive: away, lastChecked: at - IDLE_REFRESH_MS })).toBe(true);
	});
});
