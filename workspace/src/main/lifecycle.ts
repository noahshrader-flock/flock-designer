/**
 * The app quits when its window closes, on every platform, macOS included.
 *
 * Everything bound to a window is bound once, to the first (events it is sent, dialogs, the page view, publishing on
 * focus), and closing it stops everything the app runs. A second window from the dock would have half its wiring gone,
 * and an app left open with no window has nothing to do. So there is no `activate` handler making one.
 */
export const quitWithTheWindow = (app: { on(event: 'window-all-closed', fn: () => void): unknown; quit(): void }): void => {
	app.on('window-all-closed', () => app.quit());
};
