import { describe, expect, it, vi } from 'vitest';
import { coalesce } from '../extension/src/coalesce';

/** What happens several times in a moment (a save, a review opened, a comment written) is done once: one read of the projects. */
describe('coalesce', () => {
	it('runs once for a burst, after it, and again for a later one', () => {
		vi.useFakeTimers();
		const run = vi.fn();
		const soon = coalesce(run, 1500);
		soon();
		soon();
		vi.advanceTimersByTime(1000);
		soon();
		expect(run).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1500);
		expect(run).toHaveBeenCalledTimes(1);
		soon();
		vi.advanceTimersByTime(1500);
		expect(run).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});
});
