// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopy } from '../src/renderer/useCopy';
import { probeHook, render, unmountAll } from './reviewHarness';
import { offenders, windowSources } from './windowSources';

/** Copying said one way, and headings one look per level: each screen's title its h1, a section h2, inside it h3. */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	vi.useRealTimers();
});

describe('copying', () => {
	it('says Copied for a moment, then not, so the next copy can say it again', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => undefined }, configurable: true });
		const probe = await probeHook(() => useCopy(() => undefined, 'It is shown above.'));
		current = probe;
		const now = probe.now;
		vi.useFakeTimers();
		await act(async () => now().copy('ABCD-1234'));
		expect(now().copied).toBe(true);
		await act(async () => void vi.advanceTimersByTime(2000));
		expect(now().copied).toBe(false);
	});

	it('says where the text is when the clipboard refuses', async () => {
		Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('denied')) }, configurable: true });
		const onError = vi.fn();
		const probe = await probeHook(() => useCopy(onError, 'It is shown above.'));
		current = probe;
		const now = probe.now;
		await act(async () => now().copy('x'));
		expect(onError).toHaveBeenCalledWith('Could not copy to the clipboard. It is shown above.');
		expect(now().copied).toBe(false);
	});

	it('is done one way: no screen writes to the clipboard itself', () => {
		expect(offenders(/clipboard\.writeText/)).toEqual([]);
	});
});

describe('headings', () => {
	it('look one way at each level: a section is text-base, what is inside one text-sm', () => {
		const wrong = windowSources().flatMap(({ path, text }) => [
			...[...text.matchAll(/<h2\b[^>]*className="([^"]*)"/g)].filter((m) => !/\btext-base\b/.test(m[1]!)).map((m) => `${path}: h2 ${m[1]}`),
			...[...text.matchAll(/<h3\b[^>]*className="([^"]*)"/g)].filter((m) => !/\btext-sm\b/.test(m[1]!)).map((m) => `${path}: h3 ${m[1]}`),
		]);
		expect(wrong).toEqual([]);
	});
});
