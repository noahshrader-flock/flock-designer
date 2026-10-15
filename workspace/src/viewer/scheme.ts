/**
 * Light or dark, for the published page's bar: the computer's setting when it is in a browser, VS Code's when DSNR's review tab
 * frames it (the tab says, `listenForDsnr`). Dark is the app's own `dark` class, which its whole theme reads, and the
 * colour-scheme says so to the browser as well: a framed page whose colour-scheme differs from the page around it is drawn
 * on an opaque backdrop, not see-through.
 */
const DARK = '(prefers-color-scheme: dark)';
export const systemIsDark = (win: Pick<Window, 'matchMedia'>): boolean => win.matchMedia?.(DARK).matches ?? false;

/** Told when the computer's setting changes, until the returned function is called. */
export const watchSystemScheme = (win: Pick<Window, 'matchMedia'>, onChange: (dark: boolean) => void): (() => void) => {
	const query = win.matchMedia?.(DARK);
	const changed = () => onChange(systemIsDark(win));
	query?.addEventListener('change', changed);
	return () => query?.removeEventListener('change', changed);
};

/**
 * Shows the page as `dark` or light. `overEditor` is a page VS Code frames: its background is taken off, so what is behind its
 * bar is the editor's own, as the bar is quiet (`Toolbar quiet`). In a browser the page keeps its own background.
 */
export const applyScheme = (doc: Document, dark: boolean, overEditor: boolean): void => {
	doc.documentElement.classList.toggle('dark', dark);
	doc.documentElement.style.colorScheme = dark ? 'dark' : 'light';
	doc.body.style.background = overEditor ? 'transparent' : '';
};
