/**
 * While DSGN runs from its source (VS Code's Development mode), what a rebuilt file in `dist/` means: the page's files
 * reload the panel, the extension's own file restarts the extension host, and everything else (source maps, fonts) means
 * nothing. Plain logic, so it is tested without VS Code.
 */
export const whatChanged = (name: string | null): 'page' | 'host' | null =>
	name === 'webview.js' || name === 'webview.css' ? 'page' : name === 'extension.js' ? 'host' : null;

/** `act`, once, when calls to what this returns have stopped for `ms`: a build writes several files at once. */
export const afterQuiet = (ms: number, act: () => void): (() => void) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(act, ms);
	};
};
