import type { PreviewPage } from '../../src/main/ipc';

const ELSEWHERE = 'In VS Code a prototype opens in a review tab: run DSNR: Open a prototype for review.';
const refuse = async (): Promise<never> => {
	throw new Error(ELSEWHERE);
};

/**
 * The preview in VS Code: there is no native view over the window here (ELECTRON_MIGRATION_PLAN §1.4, decision 3), so
 * what would open one says where a prototype opens instead, and what would close or move one does nothing.
 */
export const noPreview: PreviewPage = {
	open: refuse,
	close: () => undefined,
	currentUrl: () => null,
	hold: () => undefined,
	snapshot: async () => null,
	setBounds: () => undefined,
	pick: refuse,
	cancelPick: async () => undefined,
	showMarkers: refuse,
	focusMarker: async () => undefined,
};
