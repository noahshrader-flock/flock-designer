import { describe, expect, it, vi } from 'vitest';
import { afterQuiet, whatChanged } from '../extension/src/devReload';

describe('what a rebuilt file means', () => {
	it.each([
		['webview.js', 'page'],
		['webview.css', 'page'],
		['extension.js', 'host'],
		['webview.js.map', null],
		['codicon.ttf', null],
		[null, null],
	] as const)('%s → %s', (name, want) => {
		expect(whatChanged(name)).toBe(want);
	});
});

describe('a burst of changes', () => {
	it('is acted on once, after it goes quiet: a build writes several files', () => {
		vi.useFakeTimers();
		try {
			const act = vi.fn();
			const later = afterQuiet(150, act);
			later();
			vi.advanceTimersByTime(100);
			later();
			vi.advanceTimersByTime(100);
			expect(act).not.toHaveBeenCalled();
			vi.advanceTimersByTime(60);
			expect(act).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});
});
