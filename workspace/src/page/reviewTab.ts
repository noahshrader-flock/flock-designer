/**
 * The review tab's own script, in VS Code (`extension/src/review.ts`, which bundles this into its page): it frames a
 * prototype's review page and carries messages between it and the extension, and tells it whether VS Code is dark.
 * Nothing from anywhere else (the prototype's page in the bar, a frame it makes) goes anywhere.
 */
declare const acquireVsCodeApi: () => { postMessage(message: unknown): void };

/** Started once the tab's frame is on the page, for the review page served at `page` (its origin). */
export const startReviewTab = (page: string): void => {
	const vscode = acquireVsCodeApi();
	const frame = document.querySelector('iframe') as HTMLIFrameElement;
	const toPage = (message: unknown) => frame.contentWindow?.postMessage(message, page);
	// Whether VS Code is dark, from the classes it puts on this page's body (high contrast included): told to the page once it
	// has said hello, and whenever the theme changes, so its bar follows the editor.
	const isDark = () => {
		const c = document.body.classList;
		return c.contains('vscode-dark') || (c.contains('vscode-high-contrast') && !c.contains('vscode-high-contrast-light'));
	};
	const tellScheme = () => toPage({ dsnr: 'scheme', dark: isDark() });
	frame.addEventListener('load', () => {
		toPage({ dsnr: 'hello' });
		tellScheme();
	});
	new MutationObserver(tellScheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
	// Only the bar may ask the extension, and only VS Code answers it: its host frame posts on this tab's own origin, which no
	// frame inside it has (the bar and the prototype's page are this machine's, any frame they make theirs or none). VS Code
	// makes window.parent this window itself, so the origin is what says who sent it.
	window.addEventListener('message', (e) => {
		if (e.source === frame.contentWindow && e.origin === page) vscode.postMessage(e.data);
		else if (e.origin === location.origin) toPage(e.data);
	});
};
