/**
 * How the panel is registered. Kept alive while another tab is in front (Claude Code, say): a hidden side-panel view is
 * otherwise thrown away and built again, and the page goes through its first reads (what is open, the projects, the design
 * system) every time it comes back, losing its scroll, its search and any dialog with them. The design system's own tabs
 * are kept so too. It costs the page's memory while hidden.
 */
export const PANEL_VIEW_OPTIONS = { webviewOptions: { retainContextWhenHidden: true } } as const;
