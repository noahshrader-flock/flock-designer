import { describe, expect, it } from 'vitest';
import { coalescing, coalescingByKey, inTurns, singleFlight } from '../src/main/services/concurrency';

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
		first.done('one');
		expect(await Promise.all([a, b])).toEqual(['one', 'one']);
		expect(await flight.run('k', () => (started++, Promise.resolve('two')))).toBe('two');
		expect(started).toBe(2);
	});

	it('never keeps a failure: the next caller tries again', async () => {
		const flight = singleFlight<string, string>();
		await expect(flight.run('k', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
		expect(await flight.run('k', () => Promise.resolve('back'))).toBe('back');
	});

	it('runs different keys side by side', async () => {
		const flight = singleFlight<string, string>();
		const a = flight.run('a', () => Promise.resolve('A'));
		const b = flight.run('b', () => Promise.resolve('B'));
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

describe('one run at a time for each key', () => {
	it('runs a key once more for however many ask meanwhile, other keys beside it, and counts only what is running', async () => {
		const byKey = coalescingByKey<string>();
		const gates = [later(), later()];
		let runs = 0;
		const gate = (i: number) => gates[i] as ReturnType<typeof later>;
		const workA = async () => void (await gate(runs++).promise);
		const other = later();
		const asked = [byKey.run('a', workA), byKey.run('a', workA), byKey.run('a', workA)];
		const b = byKey.run('b', async () => void (await other.promise));
		expect([byKey.has('a'), byKey.has('b'), byKey.size]).toEqual([true, true, 2]);
		other.done('');
		await b;
		expect([byKey.has('b'), byKey.size]).toEqual([false, 1]);
		gate(0).done('');
		gate(1).done('');
		await Promise.all(asked);
		expect(runs).toBe(2);
		expect(byKey.size).toBe(0);
	});
});

describe('in turns', () => {
	it('runs one at a time for a key, each in the order asked, every one answered, a failure keeping no one waiting', async () => {
		const turn = inTurns<string>();
		const happened: string[] = [];
		let release: () => void = () => undefined;
		const held = new Promise<void>((go) => (release = go));
		const first = turn('written', async () => {
			happened.push('first starts');
			await held;
			happened.push('first ends');
			throw new Error('first failed');
		});
		const second = turn('written', async () => (happened.push('second'), 2));
		const other = turn('reach', async () => (happened.push('other'), 3));
		await other;
		expect(happened).toEqual(['first starts', 'other']);
		release();
		await expect(first).rejects.toThrow('first failed');
		expect(await second).toBe(2);
		expect(happened).toEqual(['first starts', 'other', 'first ends', 'second']);
	});
});
