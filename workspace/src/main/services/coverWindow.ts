/**
 * Drawing a prototype's page as its picture (`DrawCover`), in a hidden window as sandboxed as the accessibility check's
 * (no preload, no Node, a throwaway session, nothing it can open or navigate to). Always in light, whatever the machine's
 * theme, set for this window alone so the app's own appearance is never changed; at one pixel to a pixel, so a picture is
 * the same on every screen. The page is waited for until it is ready (`settleScript`); a page that never is, or that
 * painted nothing, gives no picture.
 */
import { COVER_BUDGET, COVER_STEPS, COVER_WINDOW, type DrawCover, isBlank, settleScript } from './projectCovers';
import { fitJpeg } from './picture';
import { hiddenWindow, setColorScheme, within } from './sandboxedPage';

/** The windows' session: their own, in memory only. */
const SESSION = 'dsnr-cover';
/** The most loading the page, and then its getting ready, may take: past the cap the settle itself has. */
const LOAD_MS = 15_000;
const READY_MS = 12_000;

export const coverInWindow: DrawCover = async (url) => {
	const win = hiddenWindow(SESSION, new URL(url).origin, COVER_WINDOW);
	try {
		const wc = win.webContents;
		if (!(await setColorScheme(wc, 'light', LOAD_MS))) return null;
		const scaled = await within(
			LOAD_MS,
			wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { ...COVER_WINDOW, deviceScaleFactor: 1, mobile: false }),
		);
		if (scaled === null) return null;
		if (
			(await within(
				LOAD_MS,
				wc.loadURL(url).then(() => true),
			)) === null
		)
			return null;
		const ready = (await within(READY_MS, wc.executeJavaScript(settleScript()))) as { capped?: unknown } | null;
		if (ready === null || ready.capped !== false) return null;
		const image = await wc.capturePage({ x: 0, y: 0, ...COVER_WINDOW });
		if (image.isEmpty() || isBlank(image.toBitmap())) return null;
		return fitJpeg(image, COVER_BUDGET, COVER_STEPS);
	} catch {
		return null;
	} finally {
		win.destroy();
	}
};
