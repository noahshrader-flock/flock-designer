/**
 * The app's way to check a page for accessibility (`CheckPage`): axe-core in a hidden window, held as every page of
 * someone else's code is (`sandboxedPage.ts`), in each of the page's states. Electron's, so the shell gives it to the core
 * (`electronPorts.ts`); what is done with what it finds is `accessibilityCheck.ts`.
 */
import axe from 'axe-core';
import type { AxeRun } from '../../shared/accessibility';
import { withState } from '../../shared/prototypeStates';
import { type CheckPage, axeFound, axeRun } from './accessibilityCheck';
import { hiddenWindow, within } from './sandboxedPage';

/** The windows' session, their own and in memory; their size, a desktop's; how long a state may take. */
const SESSION = 'dsnr-accessibility';
const WINDOW = { width: 1280, height: 900 };
const STATE_MS = 20_000;
/** How long the page is given to settle after it has loaded, before axe reads it. */
const SETTLE_MS = 300;

/** What runs in a prototype's page: once it has settled, axe-core itself, then a run over the whole page. */
const runAxe = (tags: string[]): string => `(async () => {
	await document.fonts.ready;
	await new Promise((r) => setTimeout(r, ${SETTLE_MS}));
	${axe.source}
	return await ${axeRun('document', tags)};
})()`;

export const checkInWindow: CheckPage = async (url, states, tags) => {
	const win = hiddenWindow(SESSION, new URL(url).origin, WINDOW);
	try {
		const runs: AxeRun[] = [];
		const wc = win.webContents;
		for (const state of states.length ? states : [null]) {
			const said = state ?? 'default';
			const loaded = await within(
				STATE_MS,
				wc.loadURL(withState(url, state)).then(() => true),
			);
			if (loaded === null) throw new Error(`The page did not load in its ${said} state, so it could not be checked.`);
			const found: unknown = await within(STATE_MS, wc.executeJavaScript(runAxe(tags)));
			if (!axeFound(found)) throw new Error(`The accessibility check did not finish in the page's ${said} state.`);
			runs.push({ state: said, ...found });
		}
		return runs;
	} finally {
		win.destroy();
	}
};
