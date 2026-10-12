import { describe, expect, it } from 'vitest';
import { coalescing, singleFlight } from '../src/main/services/concurrency';

const later = () => {
	let done!: (v: string) => void;
	let failed!: (e: Error) => void;
	const promise = new Promise<string>((res, rej) => ((done = res), (failed = rej)));
	return { promise, done, failed };
};

describe('one run for a key, its answer shared', () => {
	it('gives a second caller the first run, and starts afresh once it is done', async () => {
		const flight = singleFlight<string, string>();
		let started = 0;
		const first = later();
		const a = flight.run('k', () => (started++, first.promise));
		const b = flight.run('k', () => (started++, Promise.resolve('other')));
		expect(flight.has('k')).toBe(true);
		first.done('one');
		expect(await Promise.all([a, b])).toEqual(['one', 'one']);
		expect(flight.has('k')).toBe(false);
		expect(await flight.run('k', () => (started++, Promise.resolve('two')))).toBe('two');
		expect(started).toBe(2);
	});

	it('never keeps a failure: the next caller tries again', async () => {
		const flight = singleFlight<string, string>();
		await expect(flight.run('k', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
		expect(flight.size).toBe(0);
		expect(await flight.run('k', () => Promise.resolve('back'))).toBe('back');
	});

	it('runs different keys side by side', async () => {
		const flight = singleFlight<string, string>();
		const a = flight.run('a', () => Promise.resolve('A'));
		const b = flight.run('b', () => Promise.resolve('B'));
		expect(flight.size).toBe(2);
		expect(await Promise.all([a, b])).toEqual(['A', 'B']);
	});
});

describe('one run at a time, and one more if asked meanwhile', () => {
	it('runs once more for however many asks arrive during a run, and resolves them all when it is done', async () => {
		const gates = [later(), later()];
		let runs = 0;
		const go = coalescing(async () => {
			await gates[runs++]?.promise;
		});
		const first = go();
		expect(go.running).toBe(true);
		const second = go();
		const third = go();
		gates[0]!.done('');
		await Promise.resolve();
		gates[1]!.done('');
		await Promise.all([first, second, third]);
		expect(runs).toBe(2);
		expect(go.running).toBe(false);
	});

	it('keeps going after a run that fails, and says the failure to whoever asked for that run', async () => {
		let runs = 0;
		const go = coalescing(async () => {
			runs++;
			if (runs === 1) throw new Error('first failed');
		});
		await expect(go()).rejects.toThrow('first failed');
		await go();
		expect(runs).toBe(2);
	});
});
