/**
 * How the app holds a page of someone else's code (a prototype, a component library's stories): in a sandbox with no
 * preload and no Node, in a session of its own that is gone on quit, granted no permission, opening no window, and kept
 * to its own origin. A page shown to the person (`pageView.ts`) and one drawn out of sight (`storyMeasure.ts`) are held
 * the same way, by this.
 */
import type { WebContents, WebPreferences } from 'electron';

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
