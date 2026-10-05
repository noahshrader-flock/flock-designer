import { type BrowserWindow, WebContentsView, shell } from 'electron';
import type { CommentAnchor, MarkerRequest, MarkerResult, PageBounds } from '../../shared/contract';
import { assertPreviewUrl, sanitizeAnchor } from '../../shared/anchor';
import { CANCEL_PICK_SCRIPT, PICK_SCRIPT, ROUTE_SCRIPT, focusScript, resolveScript } from './pageScripts';

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

const MARKER_STATES = new Set(['found', 'moved', 'missing', 'elsewhere']);

export class PageView {
	private view: WebContentsView | null = null;
	private origin: string | null = null;
	private bounds: PageBounds = { x: 0, y: 0, width: 0, height: 0 };
	private picking = false;

	constructor(
		private readonly window: BrowserWindow,
		private readonly onRoute: (route: string) => void,
	) {}

	async open(rawUrl: string): Promise<void> {
		const url = assertPreviewUrl(rawUrl);
		this.close();

		const view = new WebContentsView({
			webPreferences: {
				// No preload: nothing is exposed to the page.
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				webSecurity: true,
				partition: SESSION,
			},
		});
		const wc = view.webContents;
		wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

		wc.setWindowOpenHandler(({ url: target }) => {
			if (target.startsWith('https://')) void shell.openExternal(target);
			return { action: 'deny' };
		});
		// Stay on the preview. A link elsewhere opens in the real browser.
		wc.on('will-navigate', (event, target) => {
			if (new URL(target).origin !== this.origin) {
				event.preventDefault();
				if (target.startsWith('https://')) void shell.openExternal(target);
			}
		});
		const reportRoute = () => {
			void this.run<string>(ROUTE_SCRIPT).then((r) => typeof r === 'string' && this.onRoute(r.slice(0, 300)));
		};
		wc.on('did-navigate', reportRoute);
		wc.on('did-navigate-in-page', reportRoute);
		wc.on('did-finish-load', reportRoute);

		this.origin = new URL(url).origin;
		this.view = view;
		this.window.contentView.addChildView(view);
		view.setBounds(this.bounds);
		await wc.loadURL(url);
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

	setBounds(b: PageBounds): void {
		const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
		this.bounds = { x: n(b.x), y: n(b.y), width: n(b.width), height: n(b.height) };
		this.view?.setBounds(this.bounds);
	}

	private async run<T>(code: string): Promise<T | undefined> {
		const wc = this.view?.webContents;
		if (!wc || wc.isDestroyed()) return undefined;
		try {
			return (await wc.executeJavaScript(code, true)) as T;
		} catch {
			return undefined;
		}
	}

	/** Waits for one click. Null if cancelled, or if the page changed under it. */
	async pick(): Promise<CommentAnchor | null> {
		if (!this.view) throw new Error('There is no preview open.');
		if (this.picking) await this.cancelPick();
		this.picking = true;
		this.view.webContents.focus();
		try {
			const raw = await this.run<unknown>(PICK_SCRIPT);
			return sanitizeAnchor(raw);
		} finally {
			this.picking = false;
		}
	}

	async cancelPick(): Promise<void> {
		await this.run(CANCEL_PICK_SCRIPT);
	}

	/** Draws markers and reports how each comment was placed. Never trusts the reply's shape. */
	async showMarkers(items: MarkerRequest[]): Promise<MarkerResult[]> {
		const raw = await this.run<unknown>(resolveScript(items));
		const wanted = new Set(items.map((i) => i.id));
		return (Array.isArray(raw) ? raw : []).flatMap((r): MarkerResult[] => {
			const rec = r as { id?: unknown; state?: unknown };
			return typeof rec.id === 'number' && wanted.has(rec.id) && typeof rec.state === 'string' && MARKER_STATES.has(rec.state)
				? [{ id: rec.id, state: rec.state as MarkerResult['state'] }]
				: [];
		});
	}

	async focusMarker(id: number): Promise<void> {
		await this.run(focusScript(id));
	}
}
