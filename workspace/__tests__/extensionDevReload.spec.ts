import { describe, expect, it, vi } from 'vitest';
import { afterQuiet, whatChanged } from '../extension/src/devReload';

/**
 * The loop you can watch (Phase 0.3): while DSNR runs from its source, a rebuilt page reloads the panel and a rebuilt
 * extension restarts VS Code's extension host, so a saved change is on screen with no reinstall.
 */

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
		const act = vi.fn();
		const later = afterQuiet(150, act);
		later();
		vi.advanceTimersByTime(100);
		later();
		vi.advanceTimersByTime(100);
		expect(act).not.toHaveBeenCalled();
		vi.advanceTimersByTime(60);
		expect(act).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});
});
