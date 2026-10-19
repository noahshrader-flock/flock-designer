import { describe, expect, it, vi } from 'vitest';
import { watchFor } from '../extension/src/watch';

const world = (answers: (boolean | Error)[] = []) => {
	let now = 1_000_000;
	const found = vi.fn(async () => {
		const next = answers.shift() ?? false;
		if (next instanceof Error) throw next;
		return next;
	});
	const saved = vi.fn();
	const gaveUp = vi.fn();
	const sleep = vi.fn(async (ms: number) => void (now += ms));
	const run = (over: Partial<Parameters<typeof watchFor>[0]> = {}) =>
		watchFor({ found, onFound: saved, onGaveUp: gaveUp, now: () => now, sleep, pollMs: 1000, giveUpMs: 10_000, isLive: () => true, ...over });
	return { run, found, saved, gaveUp };
};

describe('watching for what the agent did', () => {
	it('says each time it is found, and nothing while it is not', async () => {
		const w = world([false, true, false, false, true]);
		await w.run();
		expect(w.saved).toHaveBeenCalledTimes(2);
	});

	it('asked to watch for one thing, ends when it is found', async () => {
		const w = world([false, true, true]);
		await w.run({ once: true });
		expect(w.found).toHaveBeenCalledTimes(2);
		expect(w.saved).toHaveBeenCalledTimes(1);
	});

	it('asks until it gives up, and not after the window has gone', async () => {
		const w = world();
		await w.run();
		expect(w.found).toHaveBeenCalledTimes(10);
		const gone = world();
		await gone.run({ isLive: () => false });
		expect(gone.found).not.toHaveBeenCalled();
	});

	it('stops after three asks running that failed, and says so with the last error: nothing is found for them after', async () => {
		const failing = world([new Error('first'), new Error('second'), new Error('third'), true]);
		await failing.run();
		expect(failing.found).toHaveBeenCalledTimes(3);
		expect(failing.saved).not.toHaveBeenCalled();
		expect(failing.gaveUp).toHaveBeenCalledExactlyOnceWith(new Error('third'));
	});

	it('starts the count again after one that works, and says nothing when it did not give up or the window has gone', async () => {
		const recovering = world([new Error('x'), new Error('x'), true, new Error('x'), new Error('x'), true]);
		await recovering.run();
		expect(recovering.saved).toHaveBeenCalledTimes(2);
		expect(recovering.gaveUp).not.toHaveBeenCalled();
		const waited = world();
		await waited.run();
		expect(waited.gaveUp).not.toHaveBeenCalled();
		let live = true;
		let tries = 0;
		const closing = world();
		await closing.run({
			isLive: () => live,
			// The window closes while the third ask fails: there is nobody left to tell.
			found: async () => {
				if (++tries === 3) live = false;
				throw new Error('x');
			},
		});
		expect(closing.gaveUp).not.toHaveBeenCalled();
	});
});
