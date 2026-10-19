/**
 * How the panel is registered: kept alive while another tab is in front, or VS Code throws a hidden view away and the
 * page redoes its first reads every time it comes back, losing its scroll, its search and any dialog. It costs the
 * page's memory while hidden.
 */
export const PANEL_VIEW_OPTIONS = { webviewOptions: { retainContextWhenHidden: true } } as const;
