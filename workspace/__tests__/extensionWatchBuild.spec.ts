import { describe, expect, it, vi } from 'vitest';
import { watchBuild } from '../extension/src/watchBuild';

/**
 * A prototype that Claude Code builds is saved by DSNR once it is built: the core is asked each time (`saveBuilt`, which
 * knows from its source and page whether there is a build to save), and the list is told when it saved, so the picture on
 * its card is drawn without anyone opening it. Time is the test's own.
 */

const world = (answers: ('saved' | 'waiting' | Error)[] = []) => {
	let now = 1_000_000;
	const saveBuilt = vi.fn(async () => {
		const next = answers.shift() ?? 'waiting';
		if (next instanceof Error) throw next;
		return next;
	});
	const saved = vi.fn();
	const sleep = vi.fn(async (ms: number) => void (now += ms));
	const run = (over: Partial<Parameters<typeof watchBuild>[0]> = {}) =>
		watchBuild({ saveBuilt, onSaved: saved, now: () => now, sleep, pollMs: 1000, giveUpMs: 10_000, isLive: () => true, ...over });
	return { run, saveBuilt, saved };
};

describe('watching a prototype Claude Code builds', () => {
	it('says each build the core saved, once, and nothing while there is none', async () => {
		const w = world(['waiting', 'saved', 'waiting', 'waiting', 'saved']);
		await w.run();
		expect(w.saved).toHaveBeenCalledTimes(2);
	});

	it('asks until it gives up, and not after the window has gone', async () => {
		const w = world();
		await w.run();
		expect(w.saveBuilt).toHaveBeenCalledTimes(10);
		const gone = world();
		await gone.run({ isLive: () => false });
		expect(gone.saveBuilt).not.toHaveBeenCalled();
	});

	it('stops after three saves running that failed, rather than trying forever; one that works in between starts the count again', async () => {
		const failing = world([new Error('x'), new Error('x'), new Error('x'), 'saved']);
		await failing.run();
		expect(failing.saveBuilt).toHaveBeenCalledTimes(3);
		expect(failing.saved).not.toHaveBeenCalled();
		const recovering = world([new Error('x'), new Error('x'), 'saved', new Error('x'), new Error('x'), 'saved']);
		await recovering.run();
		expect(recovering.saved).toHaveBeenCalledTimes(2);
	});
});
