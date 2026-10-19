// The floor is what a panel's own controls need. The ceiling is also a share of the window, so a narrow window is not left
// with a sliver of what the panel sits beside.
export const PANEL_MIN = 250;
const PANEL_MAX_SHARE = 0.6;

export interface PanelWidths {
	key: string;
	initial: number;
	ceiling: number;
}

export const COMMENTS_PANEL: PanelWidths = { key: 'dsnr.panelWidth', initial: 380, ceiling: 760 };
export const panelMax = (windowWidth: number, panel: PanelWidths): number =>
	Math.max(PANEL_MIN, Math.min(panel.ceiling, Math.round(windowWidth * PANEL_MAX_SHARE)));

export const clampPanelWidth = (width: number, windowWidth: number, panel: PanelWidths): number =>
	Number.isFinite(width) ? Math.min(panelMax(windowWidth, panel), Math.max(PANEL_MIN, Math.round(width))) : panel.initial;

export const PANEL_STEP = 16;

// Storage may be blocked or empty.
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
