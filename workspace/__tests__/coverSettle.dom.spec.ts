import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settleScript } from '../src/core/services/projectCovers';

/**
 * When a prototype's page is ready for its picture: fonts ready, no animation that ends still running, and the page
 * unchanged for a while, or the cap. Run here in a page of its own, as the hidden
 * window runs it, with small numbers so the test is quick.
 */

const run = (quiet: number, cap: number): Promise<{ capped: boolean }> =>
	// The same text the window is given, run as the window runs it.
	(0, eval)(settleScript(quiet, cap)) as Promise<{ capped: boolean }>;

let animations: Array<{ playState: string; effect: { getTiming: () => { iterations: number } } }>;
let timers: ReturnType<typeof setInterval>[];
beforeEach(() => {
	animations = [];
	timers = [];
	Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
	document.getAnimations = () => animations as never;
	document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
	for (const t of timers) clearInterval(t);
});

describe('settleScript', () => {
	it('is settled once nothing has changed for the quiet time', async () => {
		const started = Date.now();
		expect(await run(60, 2000)).toEqual({ capped: false });
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it('waits for a page that is still changing, then settles once it stops', async () => {
		let n = 0;
		const t = setInterval(() => {
			if (n++ < 4) document.getElementById('root')!.textContent = `step ${n}`;
		}, 30);
		timers.push(t);
		const started = Date.now();
		expect(await run(80, 3000)).toEqual({ capped: false });
		// Not before the last change and its quiet time.
		expect(Date.now() - started).toBeGreaterThanOrEqual(150);
	});

	it('says it was capped when the page never stops changing: that picture is not kept', async () => {
		timers.push(setInterval(() => (document.getElementById('root')!.textContent = String(Math.random())), 20));
		expect(await run(100, 400)).toEqual({ capped: true });
	});

	it('waits for an animation that ends, and not for one that loops forever', async () => {
		animations = [{ playState: 'running', effect: { getTiming: () => ({ iterations: Number.POSITIVE_INFINITY }) } }];
		expect(await run(50, 2000)).toEqual({ capped: false });
		animations = [{ playState: 'running', effect: { getTiming: () => ({ iterations: 1 }) } }];
		expect(await run(50, 300)).toEqual({ capped: true });
	});
});
