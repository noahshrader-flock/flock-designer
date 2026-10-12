import { type BrowserWindow, WebContentsView, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import type { MarkerRequest, MarkerResult, PageBounds, PageHoldReason, PickedPoint, PinEvent } from '../../shared/contract';
import { assertPreviewUrl } from '../../shared/anchor';
import {
	CANCEL_PICK_SCRIPT,
	PICK_SCRIPT,
	ROUTE_SCRIPT,
	SINGLE_PAGE,
	focusScript,
	layerVisibleScript,
	readMarkers,
	readPick,
	readPinMessage,
	resolveScript,
} from '../../shared/pageScripts';
import { type Box, cropRect, frameRect, jpegDataUrl, toPicture } from './picture';
import { keepToOrigin, sandboxedPreferences } from './sandboxedPage';

/**
 * A prototype's preview, shown inside the app so a comment can be placed on it.
 *
 * **The preview gets no bridge to the app.** It is its own view with no preload
 * script, no Node, a sandbox, and a throwaway session that holds nothing and is
 * granted nothing. The app reads the page by running a script in it and taking
 * the return value; the page has no function to call in the other direction.
 * That replaces the earlier rule against ever scripting a preview, which was
 * written for untrusted remote pages. A preview is the team's own prototype,
 * but it is still a web page, so the result is validated before it is used and
 * the isolation is checked in the tests below.
 */

const SESSION = 'fd-preview'; // no "persist:" prefix: in memory, gone on quit

const LOAD_ATTEMPTS = 6;
const RETRY_MS = 1000;
const SETTLE_MS = 1500;

/**
 * Whether the view is showing a real page that has finished loading, which is what a failed load may turn out
 * to have become. A failed load leaves Chromium's own error page up, which is a finished page too, so "finished"
 * alone proves nothing: the document has to be a real one, not `chrome-error:`.
 */
const realPageIsUp = async (wc: Electron.WebContents): Promise<boolean> => {
	if (wc.isDestroyed() || wc.isLoading()) return false;
	try {
		return (await wc.executeJavaScript('location.protocol', true)) !== 'chrome-error:';
	} catch {
		return false;
	}
};

/** Waits up to `ms` for that to be true. */
const settled = async (wc: Electron.WebContents, ms: number): Promise<boolean> => {
	for (let waited = 0; waited < ms; waited += 150) {
		if (await realPageIsUp(wc)) return true;
		if (wc.isDestroyed()) return false;
		await new Promise((r) => setTimeout(r, 150));
	}
	return realPageIsUp(wc);
};

export class PageView {
	private view: WebContentsView | null = null;
	private origin: string | null = null;
	private bounds: PageBounds = { x: 0, y: 0, width: 0, height: 0 };
	private picking = false;
	/** Reasons the preview is hidden right now. It shows only when this is empty. */
	private readonly holds = new Set<PageHoldReason>();

	constructor(
		private readonly window: BrowserWindow,
		private readonly onRoute: (route: string) => void,
		private readonly onPin: (event: PinEvent) => void = () => undefined,
	) {}

	/** Secret for this preview, so only the app's own pins can speak for it. Rotated on every open. */
	private nonce = randomUUID();

	/** A prototype, which is one page: every script run in it is told so (see SINGLE_PAGE). */
	private singlePage = false;

	async open(rawUrl: string, { singlePage = false }: { singlePage?: boolean } = {}): Promise<void> {
		const url = assertPreviewUrl(rawUrl);
		this.singlePage = singlePage;
		this.close();
		this.nonce = randomUUID();

		const view = new WebContentsView({ webPreferences: sandboxedPreferences(SESSION) });
		const wc = view.webContents;
		// Stay on the preview. A link elsewhere opens in the real browser.
		keepToOrigin(
			wc,
			// None yet is no origin: every navigation is held until the preview's own is known.
			() => this.origin ?? '',
			(target) => target.startsWith('https://') && void shell.openExternal(target),
		);
		const reportRoute = () => {
			void this.run<string>(ROUTE_SCRIPT).then((r) => typeof r === 'string' && this.onRoute(r.slice(0, 300)));
		};
		wc.on('console-message', (event) => this.heard(event.message));
		wc.on('did-navigate', reportRoute);
		wc.on('did-navigate-in-page', reportRoute);
		wc.on('did-finish-load', reportRoute);

		this.origin = new URL(url).origin;
		this.view = view;
		this.window.contentView.addChildView(view);
		view.setBounds(this.bounds);
		view.setVisible(this.holds.size === 0);
		await this.load(wc, url);
	}

	/**
	 * Loads a preview, and means it when it says it failed.
	 *
	 * A dev server is not ready the instant its port is: it can refuse the first attempts, or drop one while
	 * it compiles, and a page can move on during its own first load, which cancels the load Electron was
	 * waiting on and reports it as a failure even though the page is there a moment later. So a failed load
	 * is retried, and is only a failure if the page is still not there after the tries. The person never sees
	 * a failure that fixed itself, and a server that is really down is reported, in good time, with what to do.
	 */
	private async load(wc: Electron.WebContents, url: string): Promise<void> {
		const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

		let last: unknown;
		for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
			try {
				await wc.loadURL(url);
				return;
			} catch (err) {
				last = err;
				// Closed or replaced on purpose: not this load's to finish.
				if (wc.isDestroyed() || this.view?.webContents !== wc) throw err;
				// A canceled or failed navigation may have been followed by the page arriving anyway.
				if (await settled(wc, SETTLE_MS)) return;
				await sleep(RETRY_MS);
			}
		}
		const why = last instanceof Error ? last.message : String(last);
		throw new Error(
			`The preview did not load after ${LOAD_ATTEMPTS} tries (${why}). If its server is still starting, give it a moment and try again.`,
		);
	}

	/** The address the preview is showing right now, page and query included, or null if there is no preview. */
	currentUrl(): string | null {
		const wc = this.view?.webContents;
		return wc && !wc.isDestroyed() ? wc.getURL() || null : null;
	}

	close(): void {
		if (this.view) {
			this.window.contentView.removeChildView(this.view);
			this.view.webContents.close();
			this.view = null;
			this.origin = null;
			this.picking = false;
		}
	}

	/**
	 * Hides the preview for a named reason, and shows it again when the last reason
	 * lets go. Remembered across opens, so a menu that is open stays open when the
	 * preview changes. Reasons are named so that one thing letting go cannot bring
	 * the preview back while another still needs it hidden.
	 */
	hold(reason: PageHoldReason, held: boolean): void {
		if (held) this.holds.add(reason);
		else this.holds.delete(reason);
		this.view?.setVisible(this.holds.size === 0);
		// A preview that is hidden must not keep the keyboard. The click that placed a pin was
		// inside the page, so the page owns it, and typing into a box drawn by the window would
		// go to a page nobody can see. Whatever hid the preview is about to show something that
		// wants keystrokes, so the window takes them back.
		if (held) this.window.webContents.focus();
	}

	/**
	 * The preview as an image. The window draws it where the preview was and hides the real
	 * one, which is what lets a popover appear *over* the page: a native view is always drawn
	 * above the window's own content, so it cannot be covered, only swapped for a picture of
	 * itself.
	 */
	async snapshot(): Promise<string | null> {
		const wc = this.view?.webContents;
		if (!wc || wc.isDestroyed()) return null;
		// Markers were only just drawn: let the page paint them before taking the picture, or the
		// picture shows the page as it was a frame ago, without the pin that was just placed.
		await this.run('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
		const image = await wc.capturePage();
		return image.isEmpty() ? null : jpegDataUrl(image.toJPEG(85));
	}

	setBounds(b: PageBounds): void {
		const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
		this.bounds = { x: n(b.x), y: n(b.y), width: n(b.width), height: n(b.height) };
		this.view?.setBounds(this.bounds);
	}

	private async run<T>(code: string): Promise<T | undefined> {
		const wc = this.view?.webContents;
		if (!wc || wc.isDestroyed()) return undefined;
		try {
			return (await wc.executeJavaScript(this.singlePage ? SINGLE_PAGE + code : code, true)) as T;
		} catch {
			return undefined;
		}
	}

	/** Waits for one click. Null if canceled, or if the page changed under it. */
	async pick(): Promise<PickedPoint | null> {
		if (!this.view) throw new Error('There is no preview open.');
		if (this.picking) await this.cancelPick();
		this.picking = true;
		this.view.webContents.focus();
		try {
			const spot = readPick(await this.run<unknown>(PICK_SCRIPT));
			if (spot === null) return null; // canceled
			return { ...spot, picture: await this.pictureAt(spot.at, spot.box) };
		} finally {
			this.picking = false;
		}
	}

	/**
	 * A small picture of the page around a point, with the app's own pins hidden. Always the
	 * current state of the page, so it is taken the moment the click happens. Null if it cannot
	 * be taken or will not fit: a comment never fails for want of a picture.
	 */
	private async pictureAt(at: { x: number; y: number }, box: Box | null): Promise<string | null> {
		const wc = this.view?.webContents;
		if (!wc || wc.isDestroyed() || this.bounds.width === 0 || this.bounds.height === 0) return null;
		try {
			await this.run(layerVisibleScript(false));
			// Frame the element when it is known; otherwise the area around the click, as before.
			return toPicture(await wc.capturePage(box ? frameRect(box, this.bounds) : cropRect(at, this.bounds)));
		} catch {
			return null;
		} finally {
			await this.run(layerVisibleScript(true));
		}
	}

	async cancelPick(): Promise<void> {
		await this.run(CANCEL_PICK_SCRIPT);
	}

	/** Draws markers and reports how each comment was placed. Never trusts the reply's shape. */
	async showMarkers(items: MarkerRequest[]): Promise<MarkerResult[]> {
		return readMarkers(await this.run<unknown>(resolveScript(items, this.nonce)), items);
	}

	/**
	 * A pin's report, taken from the page's console. The page could write
	 * anything there, so a message counts only if it carries this preview's
	 * secret and has exactly the shape of a click or a move.
	 */
	private heard(message: string): void {
		const event = readPinMessage(message, this.nonce);
		if (event) this.onPin(event);
	}

	async focusMarker(id: number): Promise<void> {
		await this.run(focusScript(id));
	}
}
