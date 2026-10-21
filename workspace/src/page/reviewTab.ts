// Nothing from anywhere but the bar and VS Code (not the prototype's page, not a frame it makes) is passed on.
import { type EditorTheme, THEME_KINDS, isListening, isThemeColor } from '../shared/reviewRelay';

declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };

/** `page` is the review page's origin; call once the tab's frame is on the page. */
export const startReviewTab = (page: string): void => {
	const vscode = acquireVsCodeApi();
	const frame = document.querySelector('iframe') as HTMLIFrameElement;
	const toPage = (message: unknown) => frame.contentWindow?.postMessage(message, page);
	// High contrast light also has the high contrast class, so it is looked for first. The theme is posted because VS Code's
	// variables do not reach the bar's frame, which is on another origin.
	const theme = (): EditorTheme => {
		const c = document.body.classList;
		const kind = [...THEME_KINDS].reverse().find((k) => c.contains(k)) ?? 'vscode-light';
		const style = document.documentElement.style;
		// The page refuses a whole theme with one colour it would not take (`isThemeColor`).
		const colors = Object.fromEntries(
			[...Array(style.length).keys()]
				.map((i) => style.item(i))
				.map((name) => [name, style.getPropertyValue(name).trim()] as const)
				.filter(([name, value]) => isThemeColor(name, value)),
		);
		return { kind, colors };
	};
	const tellScheme = () => toPage({ dsnr: 'scheme', theme: theme() });
	const hello = () => {
		toPage({ dsnr: 'hello' });
		tellScheme();
	};
	// As the frame loads, and whenever the bar in it says it is listening: one reloaded quickly listens after the load.
	frame.addEventListener('load', hello);
	const watch = new MutationObserver(tellScheme);
	watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
	watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
	// Only the bar may ask the extension, and only VS Code answers it: VS Code posts on this tab's own origin, which no frame
	// inside it has. VS Code makes window.parent this window itself, so the origin, not the source, says who sent it.
	window.addEventListener('message', (e) => {
		if (e.source === frame.contentWindow && e.origin === page) {
			if (isListening(e.data)) hello();
			else vscode.postMessage(e.data);
		} else if (e.origin === location.origin) toPage(e.data);
	});
};
