import { describe, expect, it, vi } from 'vitest';
import { quitWithTheWindow } from '../src/main/lifecycle';

/** A stand-in for Electron's `app`: what it was asked to listen for, and whether it quit. */
const standIn = () => {
	const handlers = new Map<string, () => void>();
	const app = { on: vi.fn((event: string, fn: () => void) => void handlers.set(event, fn)), quit: vi.fn() };
	return { app, handlers };
};

describe('closing the window', () => {
	it.each(['darwin', 'win32', 'linux'])('quits the app on %s, since everything it runs stopped with the window', (platform) => {
		const real = process.platform;
		Object.defineProperty(process, 'platform', { value: platform });
		try {
			const { app, handlers } = standIn();
			quitWithTheWindow(app);
			handlers.get('window-all-closed')?.();
			expect(app.quit).toHaveBeenCalledOnce();
		} finally {
			Object.defineProperty(process, 'platform', { value: real });
		}
	});

	it('never makes a second window, whose wiring would be half gone', () => {
		const { app, handlers } = standIn();
		quitWithTheWindow(app);
		expect([...handlers.keys()]).toEqual(['window-all-closed']);
	});
});
