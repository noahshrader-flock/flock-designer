import { type EditorTheme, THEME_KINDS } from '../shared/reviewRelay';

// The colour-scheme is set as well as the `dark` class, since a framed page whose colour-scheme differs from the page
// around it is drawn on an opaque backdrop, not see-through.
const DARK = '(prefers-color-scheme: dark)';
export const systemIsDark = (win: Pick<Window, 'matchMedia'>): boolean => win.matchMedia?.(DARK).matches ?? false;

export const watchSystemScheme = (win: Pick<Window, 'matchMedia'>, onChange: (dark: boolean) => void): (() => void) => {
	const query = win.matchMedia?.(DARK);
	const changed = () => onChange(systemIsDark(win));
	query?.addEventListener('change', changed);
	return () => query?.removeEventListener('change', changed);
};

/** `overEditor` is a page VS Code frames: its background is taken off, so the editor's shows behind the bar (`.viewer-bar`). */
export const applyScheme = (doc: Document, dark: boolean, overEditor: boolean): void => {
	doc.documentElement.classList.toggle('dark', dark);
	doc.documentElement.style.colorScheme = dark ? 'dark' : 'light';
	doc.body.style.background = overEditor ? 'transparent' : '';
};

/** The kind's class goes on the body, which the kit's high contrast rules read. `null` takes the theme off again. */
export const applyEditorTheme = (doc: Document, theme: EditorTheme | null): void => {
	const style = doc.documentElement.style;
	for (const name of [...Array(style.length).keys()].map((i) => style.item(i)).filter((n) => n.startsWith('--vscode-'))) style.removeProperty(name);
	for (const [name, value] of Object.entries(theme?.colors ?? {})) style.setProperty(name, value);
	doc.body.classList.remove(...THEME_KINDS);
	if (theme) doc.body.classList.add(theme.kind, ...(theme.kind === 'vscode-high-contrast-light' ? ['vscode-high-contrast'] : []));
};
