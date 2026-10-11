/**
 * How the app holds a page of someone else's code (a prototype, a component library's stories): in a sandbox with no
 * preload and no Node, in a session of its own that is gone on quit, granted no permission, opening no window, and kept
 * to its own origin. A page shown to the person (`pageView.ts`) and one drawn out of sight (`storyMeasure.ts`, the
 * accessibility check, `accessibilityCheck.ts`, and a prototype's picture, `coverWindow.ts`) are held the same way, by this.
 */
import { BrowserWindow, type WebContents, type WebPreferences } from 'electron';

/** A page's settings: nothing exposed to it, in `partition` (no `persist:` prefix, so in memory only). */
export const sandboxedPreferences = (partition: string): WebPreferences => ({
	sandbox: true,
	contextIsolation: true,
	nodeIntegration: false,
	webSecurity: true,
	partition,
});

/**
 * Grants a page nothing and keeps it to `origin()`: a window it opens, or a link that would leave, goes to `elsewhere`
 * (the person's browser, for a page they see) or nowhere.
 */
export const keepToOrigin = (wc: WebContents, origin: () => string, elsewhere: (url: string) => void = () => undefined): void => {
	wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
	wc.setWindowOpenHandler(({ url }) => {
		elsewhere(url);
		return { action: 'deny' };
	});
	wc.on('will-navigate', (event, target) => {
		if (new URL(target).origin !== origin()) {
			event.preventDefault();
			elsewhere(target);
		}
	});
};

/**
 * A window nobody sees, holding a page as a shown one is held, in `partition`, kept to `origin`; not throttled for being
 * out of sight, or a page it holds would not draw.
 */
export const hiddenWindow = (partition: string, origin: string, size: { width: number; height: number }): BrowserWindow => {
	const win = new BrowserWindow({ show: false, ...size, webPreferences: { ...sandboxedPreferences(partition), backgroundThrottling: false } });
	keepToOrigin(win.webContents, () => origin);
	return win;
};

/** A page's answer, or null after `ms`, or when it fails: a page out of sight may never answer. */
export const within = <T>(ms: number, p: Promise<T>): Promise<T | null> =>
	Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/**
 * Sets a hidden window's `prefers-color-scheme` for its pages, for that window alone, so the app's own appearance is never
 * changed. The mode is set on a page: on a window that has none, the command never answers, so a blank one is loaded first;
 * it holds for the pages after. False when it was not set within `ms`.
 */
export const setColorScheme = async (wc: WebContents, mode: 'light' | 'dark', ms: number): Promise<boolean> => {
	await wc.loadURL('about:blank');
	wc.debugger.attach('1.3');
	return (await within(ms, wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] }))) !== null;
};
