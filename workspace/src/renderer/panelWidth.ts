/**
 * How wide a side panel may be, and the width each one remembers.
 *
 * The floor is what a panel's own controls need to stay usable. The ceiling is a share of the window, so a narrow
 * window cannot be left with a sliver of what the panel sits beside, and an absolute width, which is the panel's own.
 */
export const PANEL_MIN = 250;
const PANEL_MAX_SHARE = 0.6;

/** A panel's own: where its width is remembered, the width it starts at, and the widest it gets. */
export interface PanelWidths {
	key: string;
	initial: number;
	ceiling: number;
}

/** The comments panel on a prototype's review screen. */
export const COMMENTS_PANEL: PanelWidths = { key: 'dsnr.panelWidth', initial: 380, ceiling: 760 };
/** The tokens panel on a component's page: wider, since its rows of swatches need the room (decision 21). */
export const TOKENS_PANEL: PanelWidths = { key: 'dsnr.tokensPanelWidth', initial: 420, ceiling: 960 };

export const panelMax = (windowWidth: number, panel: PanelWidths): number =>
	Math.max(PANEL_MIN, Math.min(panel.ceiling, Math.round(windowWidth * PANEL_MAX_SHARE)));

export const clampPanelWidth = (width: number, windowWidth: number, panel: PanelWidths): number =>
	Number.isFinite(width) ? Math.min(panelMax(windowWidth, panel), Math.max(PANEL_MIN, Math.round(width))) : panel.initial;

/** How far a keyboard arrow moves the divider. */
export const PANEL_STEP = 16;

/** A per-person convenience, never a requirement: storage may be blocked or empty. */
export const loadPanelWidth = (windowWidth: number, panel: PanelWidths): number => {
	try {
		const saved = Number(localStorage.getItem(panel.key));
		return saved > 0 ? clampPanelWidth(saved, windowWidth, panel) : panel.initial;
	} catch {
		return panel.initial;
	}
};

export const savePanelWidth = (width: number, panel: PanelWidths): void => {
	try {
		localStorage.setItem(panel.key, String(width));
	} catch {
		// Not remembering the width is fine.
	}
};
