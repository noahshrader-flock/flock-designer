/**
 * How wide the side panel may be.
 *
 * The floor is what the panel's own controls need to stay usable. The ceiling is a
 * share of the window, so a narrow window cannot be left with a sliver of preview.
 */
export const PANEL_MIN = 250;
export const PANEL_DEFAULT = 380;
const PANEL_CEILING = 760;
const PANEL_MAX_SHARE = 0.6;

export const panelMax = (windowWidth: number): number =>
	Math.max(PANEL_MIN, Math.min(PANEL_CEILING, Math.round(windowWidth * PANEL_MAX_SHARE)));

export const clampPanelWidth = (width: number, windowWidth: number): number =>
	Number.isFinite(width) ? Math.min(panelMax(windowWidth), Math.max(PANEL_MIN, Math.round(width))) : PANEL_DEFAULT;

/** How far a keyboard arrow moves the divider. */
export const PANEL_STEP = 16;

const KEY = 'dsnr.panelWidth';

/** A per-person convenience, never a requirement: storage may be blocked or empty. */
export const loadPanelWidth = (windowWidth: number): number => {
	try {
		const saved = Number(localStorage.getItem(KEY));
		return saved > 0 ? clampPanelWidth(saved, windowWidth) : PANEL_DEFAULT;
	} catch {
		return PANEL_DEFAULT;
	}
};

export const savePanelWidth = (width: number): void => {
	try {
		localStorage.setItem(KEY, String(width));
	} catch {
		// Not remembering the width is fine.
	}
};
