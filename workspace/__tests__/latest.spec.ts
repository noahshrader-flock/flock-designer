import { describe, expect, it } from 'vitest';
import { latest } from '../src/viewer/comments/latest';

/** A job that can be released on command, so the overlap is exact rather than a matter of timing. */
const controllable = () => {
	let runs = 0;
	const releases: Array<() => void> = [];
	const run = latest(async () => {
		runs++;
		await new Promise<void>((resolve) => releases.push(resolve));
	});
	return {
		run,
		runs: () => runs,
		release: () => releases.shift()?.(),
		pending: () => releases.length,
	};
};
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('latest', () => {
	it('runs the work when nothing is running', async () => {
		const c = controllable();
		const done = c.run();
		await settle();
		expect(c.runs()).toBe(1);
		c.release();
		await done;
	});

	it('does not start a second run while one is going', async () => {
		const c = controllable();
		void c.run();
		await settle();
		void c.run();
		await settle();
		expect(c.runs()).toBe(1);
		c.release();
		await settle();
		expect(c.runs()).toBe(2);
		c.release();
	});

	it('makes one extra run however many asked while it was going', async () => {
		const c = controllable();
		void c.run();
		await settle();
		void c.run();
		void c.run();
		void c.run();
		await settle();
		expect(c.runs()).toBe(1);
		c.release();
		await settle();
		expect(c.runs()).toBe(2);
		c.release();
		await settle();
		expect(c.runs()).toBe(2);
	});

	it('never loses a request, which is the whole point', async () => {
		// Opening a version reads on arrival and again when the preview is up. With the second dropped, the comments
		// would stay as the first read left them.
		const c = controllable();
		void c.run();
		await settle();
		const afterPreview = c.run();
		await settle();
		c.release();
		await settle();
		c.release();
		await afterPreview; // resolves only once a run that began after it asked has finished
		expect(c.runs()).toBe(2);
	});

	it('the promise given to a mid-run caller waits for a run that started after it asked', async () => {
		const seen: string[] = [];
		const c = controllable();
		void c.run();
		await settle();
		void c.run().then(() => seen.push('mid-run caller'));
		await settle();
		c.release();
		await settle();
		expect(seen).toEqual([]); // not resolved by the run that was already going
		c.release();
		await settle();
		expect(seen).toEqual(['mid-run caller']);
	});

	it('keeps going after the work throws, so one failure does not wedge it', async () => {
		let runs = 0;
		const run = latest(async () => {
			runs++;
			throw new Error('network');
		});
		await run();
		await run();
		expect(runs).toBe(2);
	});

	it('a request made after everything settled starts a fresh run', async () => {
		const c = controllable();
		const first = c.run();
		await settle();
		c.release();
		await first;
		const second = c.run();
		await settle();
		expect(c.runs()).toBe(2);
		c.release();
		await second;
	});
});
