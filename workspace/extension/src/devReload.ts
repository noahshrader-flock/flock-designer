/** What a rebuilt file in `dist/` means when running from source: reload the panel, restart the host, or nothing. */
export const whatChanged = (name: string | null): 'page' | 'host' | null =>
	name === 'webview.js' || name === 'webview.css' ? 'page' : name === 'extension.js' ? 'host' : null;

/** `act`, once, when calls have stopped for `ms`: a build writes several files at once. */
export const afterQuiet = (ms: number, act: () => void): (() => void) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(act, ms);
	};
};
