import { describe, expect, it, vi } from 'vitest';
import { watchBuild } from '../extension/src/watchBuild';

/**
 * A prototype that Claude Code builds is saved by DSNR when the build is done: its source and page are watched, and once they
 * have stopped changing for a while they are saved, and the list is told, so the picture on its card is drawn without anyone
 * opening it. Time is the test's own.
 */

const world = (more: { saves?: boolean[] } = {}) => {
	let now = 1_000_000;
	let progress: { sourceAt: number | null; pageAt: number | null } = { sourceAt: null, pageAt: null };
	const saves = [...(more.saves ?? [])];
	const save = vi.fn(async () => saves.length === 0 || saves.shift()!);
	const saved = vi.fn();
	const sleep = vi.fn(async (ms: number) => void (now += ms));
	const run = (over: Partial<Parameters<typeof watchBuild>[0]> = {}) =>
		watchBuild({
			read: async () => progress,
			save,
			onSaved: saved,
			since: now,
			now: () => now,
			sleep,
			pollMs: 1000,
			settleMs: 5000,
			giveUpMs: 60_000,
			isLive: () => true,
			...over,
		});
	return { run, save, saved, sleep, at: (to: typeof progress) => void (progress = to), clock: () => now, tick: (ms: number) => void (now += ms) };
};

describe('watching a prototype Claude Code builds', () => {
	it('saves it once its page has stopped changing, and says so, once', async () => {
		const w = world();
		const since = w.clock();
		w.sleep.mockImplementation(async (ms: number) => {
			w.tick(ms);
			// The agent writes its source at 2s and builds its page at 4s; it is quiet after.
			if (w.clock() === since + 2000) w.at({ sourceAt: w.clock(), pageAt: null });
			if (w.clock() === since + 4000) w.at({ sourceAt: since + 2000, pageAt: w.clock() });
		});
		await w.run({ since });
		expect(w.save).toHaveBeenCalledTimes(1);
		expect(w.saved).toHaveBeenCalledTimes(1);
		// Not before it had settled: the last write was at 4s, and it settles 5s later.
		expect(w.clock()).toBeGreaterThanOrEqual(since + 9000);
	});

	it('saves again when the agent changes it later, and not when nothing changed', async () => {
		const w = world();
		const since = w.clock();
		w.sleep.mockImplementation(async (ms: number) => {
			w.tick(ms);
			if (w.clock() === since + 1000) w.at({ sourceAt: w.clock(), pageAt: w.clock() });
			if (w.clock() === since + 20_000) w.at({ sourceAt: w.clock(), pageAt: w.clock() });
		});
		await w.run({ since, giveUpMs: 40_000 });
		expect(w.save).toHaveBeenCalledTimes(2);
		expect(w.saved).toHaveBeenCalledTimes(2);
	});

	it('ignores what was there before the build was handed over', async () => {
		const w = world();
		const since = w.clock();
		w.at({ sourceAt: since - 60_000, pageAt: since - 60_000 });
		await w.run({ since, giveUpMs: 20_000 });
		expect(w.save).not.toHaveBeenCalled();
	});

	it('tries again when saving fails (the build was still going), and gives up on that write after three tries, not forever', async () => {
		const failing = world({ saves: [false, false, false, false, false, false] });
		const since = failing.clock();
		failing.at({ sourceAt: since + 10, pageAt: null });
		await failing.run({ since, giveUpMs: 60_000 });
		expect(failing.save).toHaveBeenCalledTimes(3);
		expect(failing.saved).not.toHaveBeenCalled();
		const later = world({ saves: [false] });
		const from = later.clock();
		later.at({ sourceAt: from + 10, pageAt: null });
		await later.run({ since: from, giveUpMs: 30_000 });
		expect(later.save).toHaveBeenCalledTimes(2);
		expect(later.saved).toHaveBeenCalledTimes(1);
	});

	it('stops when it is told to, and at its limit when nothing ever came', async () => {
		const gone = world();
		await gone.run({ isLive: () => false });
		expect(gone.sleep).not.toHaveBeenCalled();
		const never = world();
		const from = never.clock();
		await never.run({ since: from, giveUpMs: 10_000 });
		expect(never.clock() - from).toBeLessThanOrEqual(11_000);
		expect(never.save).not.toHaveBeenCalled();
	});

	it('does not stop on a read that fails: the next poll reads again', async () => {
		const w = world();
		const since = w.clock();
		let reads = 0;
		await w.run({
			since,
			giveUpMs: 20_000,
			read: async () => {
				if (++reads === 1) throw new Error('busy');
				return { sourceAt: since + 10, pageAt: null };
			},
		});
		expect(w.saved).toHaveBeenCalledTimes(1);
	});
});
