/**
 * Light or dark, for the published page's bar: the computer's setting when it is in a browser, VS Code's when DSNR's review tab
 * frames it (the tab says, `listenForDsnr`). Dark is the `dark` class, which the kit's theme outside VS Code reads (`ui/theme.css`), and the
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

import { type EditorTheme, THEME_KINDS } from '../shared/reviewRelay';

/**
 * Shows the page as `dark` or light. `overEditor` is a page VS Code frames: its background is taken off, so what is behind its
 * bar is the editor's own, as the bar is quiet (`Toolbar quiet`). In a browser the page keeps its own background.
 */
export const applyScheme = (doc: Document, dark: boolean, overEditor: boolean): void => {
	doc.documentElement.classList.toggle('dark', dark);
	doc.documentElement.style.colorScheme = dark ? 'dark' : 'light';
	doc.body.style.background = overEditor ? 'transparent' : '';
};

/**
 * Draws the page in VS Code's theme, as the review tab passes it on (`listenForDsnr`): its colours set on the page, before
 * the theme the kit has for outside VS Code (`ui/theme.css`), and its kind's class on the body, which the kit's high
 * contrast rules read. `null` takes them off again: the page is then in that theme's light or dark.
 */
export const applyEditorTheme = (doc: Document, theme: EditorTheme | null): void => {
	const style = doc.documentElement.style;
	for (const name of [...Array(style.length).keys()].map((i) => style.item(i)).filter((n) => n.startsWith('--vscode-'))) style.removeProperty(name);
	for (const [name, value] of Object.entries(theme?.colors ?? {})) style.setProperty(name, value);
	doc.body.classList.remove(...THEME_KINDS);
	if (theme) doc.body.classList.add(theme.kind, ...(theme.kind === 'vscode-high-contrast-light' ? ['vscode-high-contrast'] : []));
};
