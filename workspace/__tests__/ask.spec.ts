import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASK_EVERY_MS, ASK_FOR_MS, askOnce, askWhile } from '../extension/webview/hooks/ask';

describe('asking again while an answer is drawn', () => {
	beforeEach(() => void vi.useFakeTimers());
	afterEach(() => void vi.useRealTimers());

	/** Answers in turn, each a promise that has settled. */
	const answering = (...answers: string[]) => {
		let n = 0;
		return vi.fn(async () => answers[Math.min(n++, answers.length - 1)] as string);
	};

	it('asks once, then again every few seconds while it is drawn, and stops at the first that is not', async () => {
		const ask = answering('building', 'building', 'ready');
		const got: string[] = [];
		askWhile(
			ask,
			(a) => a === 'building',
			(a) => got.push(a),
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(got).toEqual(['building']);
		await vi.advanceTimersByTimeAsync(ASK_EVERY_MS - 1);
		expect(ask).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await vi.advanceTimersByTimeAsync(ASK_EVERY_MS);
		expect(got).toEqual(['building', 'building', 'ready']);
		await vi.advanceTimersByTimeAsync(ASK_EVERY_MS * 3);
		expect(ask).toHaveBeenCalledTimes(3);
	});

	it('gives nothing once stopped, neither the answer on its way nor any later', async () => {
		const ask = answering('building');
		const got: string[] = [];
		const stop = askWhile(
			ask,
			() => true,
			(a) => got.push(a),
		);
		stop();
		await vi.advanceTimersByTimeAsync(ASK_EVERY_MS * 3);
		expect(got).toEqual([]);
		expect(ask).toHaveBeenCalledTimes(1);
	});

	it('does not ask again once stopped between asks', async () => {
		const ask = answering('building');
		const stop = askWhile(
			ask,
			() => true,
			() => undefined,
		);
		await vi.advanceTimersByTimeAsync(0);
		stop();
		await vi.advanceTimersByTimeAsync(ASK_EVERY_MS * 3);
		expect(ask).toHaveBeenCalledTimes(1);
	});

	it('stops once it has asked for as long as it may, however long the answer takes to come', async () => {
		const ask = answering('building');
		askWhile(
			ask,
			() => true,
			() => undefined,
		);
		await vi.advanceTimersByTimeAsync(ASK_FOR_MS * 2);
		expect(ask).toHaveBeenCalledTimes(ASK_FOR_MS / ASK_EVERY_MS + 1);
	});

	it('asks as often and for as long as a poll says', async () => {
		const ask = answering('building');
		askWhile(
			ask,
			() => true,
			() => undefined,
			{ every: 1000, for: 5000 },
		);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(ask).toHaveBeenCalledTimes(6);
	});

	it('asks once for an effect, and drops the answer when the effect is cleaned up first', async () => {
		const got: string[] = [];
		askOnce(answering('read'), (a) => got.push(a));
		const stop = askOnce(answering('stale'), (a) => got.push(a));
		stop();
		await vi.advanceTimersByTimeAsync(ASK_EVERY_MS * 3);
		expect(got).toEqual(['read']);
	});
});
