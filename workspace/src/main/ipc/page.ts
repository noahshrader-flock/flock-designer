import { assertPreviewUrl, sanitizeAnchor } from '../../shared/anchor';
import { type MarkerRequest, PAGE_HOLD_REASONS, type PageHoldReason } from '../../shared/contract';
import { asRecord } from '../../shared/json';
import { arg, handle } from '../handle';
import type { IpcDeps } from '../ipc';

/**
 * The preview: the page view, its pins, and picking a place on it.
 */
export const registerPage = (d: IpcDeps): void => {
	const { nothing, page, ports, prototypeServer } = d;

	// A prototype is one page: the app's own server says which addresses are its, never the window.
	handle('pageOpen', [arg.url], async (url) => nothing(await page.open(String(url), { singlePage: prototypeServer.owns(String(url)) })));
	handle('pageClose', [], () => nothing(page.close()));
	// The page the preview is on, in the person's own browser. The address comes from the preview itself, never
	// from the window, and goes through the same check as opening one: this app's own web addresses only.
	handle('openPreviewInBrowser', [], async () => {
		const url = page.currentUrl();
		if (url === null) throw new Error('There is no preview open to show in a browser.');
		await ports.openExternal(assertPreviewUrl(url));
		return null;
	});
	handle('pageSetBounds', [arg.unknown], (sent) => {
		const b = asRecord(sent);
		return nothing(page.setBounds({ x: Number(b.x), y: Number(b.y), width: Number(b.width), height: Number(b.height) }));
	});
	handle('pageSnapshot', [], () => page.snapshot());
	handle('pageHold', [arg.name, arg.flag], (reason, held) => {
		if (!(PAGE_HOLD_REASONS as readonly string[]).includes(reason)) throw new Error('That is not a reason to hide the preview.');
		return nothing(page.hold(reason as PageHoldReason, held === true));
	});
	handle('pagePick', [], () => page.pick());
	handle('pageCancelPick', [], async () => nothing(await page.cancelPick()));
	handle('pageShowMarkers', [arg.unknown], (items) => {
		const clean = (Array.isArray(items) ? items : []).slice(0, 200).flatMap((i): MarkerRequest[] => {
			const anchor = sanitizeAnchor(i?.anchor);
			return anchor && Number.isInteger(i.id) && Number.isInteger(i.number)
				? [{ id: i.id, number: i.number, anchor, movable: i.movable === true }]
				: [];
		});
		return page.showMarkers(clean);
	});
	handle('pageFocusMarker', [arg.commentId], async (id) => nothing(await page.focusMarker(Number(id))));
};
