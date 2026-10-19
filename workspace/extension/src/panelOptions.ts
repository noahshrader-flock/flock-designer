/** Kept alive while hidden: otherwise VS Code throws the view away and the page loses its scroll, search and any dialog. */
export const PANEL_VIEW_OPTIONS = { webviewOptions: { retainContextWhenHidden: true } } as const;
