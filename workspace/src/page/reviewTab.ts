/**
 * The review tab's own script, in VS Code (`extension/src/review.ts`, which bundles this into its page): it frames a
 * prototype's review page and carries messages between it and the extension, and tells it VS Code's theme.
 * Nothing from anywhere else (the prototype's page in the bar, a frame it makes) goes anywhere.
 */
import { type EditorTheme, THEME_KINDS, isThemeColor } from '../shared/reviewRelay';

declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };

/** Started once the tab's frame is on the page, for the review page served at `page` (its origin). */
export const startReviewTab = (page: string): void => {
	const vscode = acquireVsCodeApi();
	const frame = document.querySelector('iframe') as HTMLIFrameElement;
	const toPage = (message: unknown) => frame.contentWindow?.postMessage(message, page);
	// VS Code's theme: its kind (the body's class; high contrast light is also high contrast, so it is looked for first) and
	// its colour variables. Told to the page on hello and on every change, since the bar's frame is on another origin,
	// which VS Code's variables do not reach.
	const theme = (): EditorTheme => {
		const c = document.body.classList;
		const kind = [...THEME_KINDS].reverse().find((k) => c.contains(k)) ?? 'vscode-light';
		const style = document.documentElement.style;
		// Only what the page takes (`isThemeColor`): one it would refuse would lose it the whole theme.
		const colors = Object.fromEntries(
			[...Array(style.length).keys()]
				.map((i) => style.item(i))
				.map((name) => [name, style.getPropertyValue(name).trim()] as const)
				.filter(([name, value]) => isThemeColor(name, value)),
		);
		return { kind, colors };
	};
	const tellScheme = () => toPage({ dsnr: 'scheme', theme: theme() });
	frame.addEventListener('load', () => {
		toPage({ dsnr: 'hello' });
		tellScheme();
	});
	// VS Code changes the body's class and the page's variables for another theme.
	const watch = new MutationObserver(tellScheme);
	watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
	watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
	// Only the bar may ask the extension, and only VS Code answers it: its host frame posts on this tab's own origin, which no
	// frame inside it has (the bar and the prototype's page are this machine's, any frame they make theirs or none). VS Code
	// makes window.parent this window itself, so the origin is what says who sent it.
	window.addEventListener('message', (e) => {
		if (e.source === frame.contentWindow && e.origin === page) vscode.postMessage(e.data);
		else if (e.origin === location.origin) toPage(e.data);
	});
};
