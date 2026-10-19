import { describe, expect, it, vi } from 'vitest';
import { watchBuild } from '../extension/src/watchBuild';

const world = (answers: ('saved' | 'waiting' | Error)[] = []) => {
	let now = 1_000_000;
	const saveBuilt = vi.fn(async () => {
		const next = answers.shift() ?? 'waiting';
		if (next instanceof Error) throw next;
		return next;
	});
	const saved = vi.fn();
	const gaveUp = vi.fn();
	const sleep = vi.fn(async (ms: number) => void (now += ms));
	const run = (over: Partial<Parameters<typeof watchBuild>[0]> = {}) =>
		watchBuild({ saveBuilt, onSaved: saved, onGaveUp: gaveUp, now: () => now, sleep, pollMs: 1000, giveUpMs: 10_000, isLive: () => true, ...over });
	return { run, saveBuilt, saved, gaveUp };
};

describe('watching a prototype Claude Code builds', () => {
	it('says each build the core saved, once, and nothing while there is none', async () => {
		const w = world(['waiting', 'saved', 'waiting', 'waiting', 'saved']);
		await w.run();
		expect(w.saved).toHaveBeenCalledTimes(2);
	});

	it('asked to watch for one result, ends at it', async () => {
		const w = world(['waiting', 'saved', 'saved']);
		await w.run({ once: true });
		expect(w.saveBuilt).toHaveBeenCalledTimes(2);
		expect(w.saved).toHaveBeenCalledTimes(1);
	});

	it('asks until it gives up, and not after the window has gone', async () => {
		const w = world();
		await w.run();
		expect(w.saveBuilt).toHaveBeenCalledTimes(10);
		const gone = world();
		await gone.run({ isLive: () => false });
		expect(gone.saveBuilt).not.toHaveBeenCalled();
	});

	it('stops after three saves running that failed, and says so with the last error: no build of theirs is saved after', async () => {
		const failing = world([new Error('first'), new Error('second'), new Error('third'), 'saved']);
		await failing.run();
		expect(failing.saveBuilt).toHaveBeenCalledTimes(3);
		expect(failing.saved).not.toHaveBeenCalled();
		expect(failing.gaveUp).toHaveBeenCalledExactlyOnceWith(new Error('third'));
	});

	it('starts the count again after one that works, and says nothing when it did not give up or the window has gone', async () => {
		const recovering = world([new Error('x'), new Error('x'), 'saved', new Error('x'), new Error('x'), 'saved']);
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
			// The window closes while the third save fails: there is nobody left to tell.
			saveBuilt: async () => {
				if (++tries === 3) live = false;
				throw new Error('x');
			},
		});
		expect(closing.gaveUp).not.toHaveBeenCalled();
	});
});
