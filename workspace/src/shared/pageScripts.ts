import PAGE from '../page/index?page';
import { MESSAGE_PREFIX } from './pinMessage';
import { sanitizeAnchor } from './anchor';
import type { CommentAnchor, MarkerRequest, MarkerResult, PinEvent } from './contract';

/**
 * What the app runs *inside* a preview page, as the text of a script: the page code (`src/page`), bundled once, then the
 * one call each needs, all in a function of its own so nothing of it is left on the page's window but the hooks it is
 * called by (`src/page/window.d.ts`).
 *
 * Text, not functions: a script is run in another process, so it is sent as source. Each script returns its result to
 * the app. The page is given no function to call; the one thing a pin needs to say back ("I was clicked", "I was moved")
 * goes out as a console message carrying a per-preview secret, which the app listens for and validates. The page can see
 * these scripts and could tamper with them or forge a message, which is why everything that comes back is validated, and
 * why the worst a forged message can do is move or select a pin that exists.
 */
const run = (call: string): string => `(function () {\n${PAGE}\nreturn __fdPage.${call};\n})()`;

/** Pin mode: resolves with where the next click landed, or null when the person presses Escape or the app cancels. */
export const PICK_SCRIPT = run('pick()');

/** Hides or shows the app's own layers, and resolves once the page has painted that (a picture is taken meanwhile). */
export const layerVisibleScript = (visible: boolean): string => run(`setLayersVisible(${visible ? 'true' : 'false'})`);

export const CANCEL_PICK_SCRIPT = 'window.__fdCancelPick && window.__fdCancelPick()';

/** Draws a numbered pin on each comment's element, and returns how each was placed (`drawPins`). */
export const resolveScript = (items: MarkerRequest[], nonce: string): string => run(`drawPins(${JSON.stringify(items)}, ${JSON.stringify(nonce)})`);

export const focusScript = (id: number): string => `window.__fdMarkers && window.__fdMarkers.focus(${Number.isInteger(id) ? id : -1})`;

export const ROUTE_SCRIPT = 'location.pathname + location.hash';

/**
 * Put before any script run on a prototype: it is one page, so a comment is placed by what follows its #, not by the
 * address it happens to be served at. The same comment then has its pin in the app and on the published site.
 */
export const SINGLE_PAGE = 'window.__fdSinglePage = true;';

/*
 * Reading what the scripts answer. A page can say anything, so each answer is taken only in exactly the shape the
 * scripts give: the same readers for every driver (the app's preview, the published site's frame), so they agree.
 */

/** Where a pick landed: the anchor, the point (only for placing the comment box), and the element's own box. */
export interface PickedSpot {
	anchor: CommentAnchor;
	at: { x: number; y: number };
	box: { x: number; y: number; width: number; height: number } | null;
}

/**
 * The answer to PICK_SCRIPT: null when the pick was canceled. Throws, to be said aloud, when the spot could not be
 * pinned: a click that silently did nothing is indistinguishable from a comment that was lost.
 */
export const readPick = (raw: unknown): PickedSpot | null => {
	if (raw === null || raw === undefined) return null;
	const anchor = sanitizeAnchor(raw);
	if (!anchor) throw new Error('That spot could not be pinned. Try clicking somewhere else on the page.');
	const at = (raw as { at?: { x?: unknown; y?: unknown } }).at;
	// Only used to place a box, so a nonsense value just means the box goes in a corner.
	const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100_000, v)) : 0);
	// The element's own box, from the page: only numbers, only if it is a real size.
	const b = (raw as { box?: Record<string, unknown> }).box;
	const box =
		b &&
		[b.x, b.y, b.width, b.height].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
		(b.width as number) > 0 &&
		(b.height as number) > 0
			? { x: b.x as number, y: b.y as number, width: b.width as number, height: b.height as number }
			: null;
	return { anchor, at: { x: n(at?.x), y: n(at?.y) }, box };
};

const MARKER_STATES = new Set(['found', 'moved', 'missing', 'elsewhere', 'otherState']);

/** The answer to resolveScript: how each pin asked for was placed, and nothing else. */
export const readMarkers = (raw: unknown, items: MarkerRequest[]): MarkerResult[] => {
	const wanted = new Set(items.map((i) => i.id));
	return (Array.isArray(raw) ? raw : []).flatMap((r): MarkerResult[] => {
		const rec = r as { id?: unknown; state?: unknown };
		return typeof rec.id === 'number' && wanted.has(rec.id) && typeof rec.state === 'string' && MARKER_STATES.has(rec.state)
			? [{ id: rec.id, state: rec.state as MarkerResult['state'] }]
			: [];
	});
};

/**
 * A pin's report, from the page's console. It counts only if it carries the secret its pins were drawn with and has
 * exactly the shape of a click or a move.
 */
export const readPinMessage = (message: string, nonce: string): PinEvent | null => {
	if (!message.startsWith(MESSAGE_PREFIX)) return null;
	let m: { n?: unknown; t?: unknown; id?: unknown; anchor?: unknown };
	try {
		m = JSON.parse(message.slice(MESSAGE_PREFIX.length));
	} catch {
		return null;
	}
	if (m.n !== nonce || typeof m.id !== 'number' || !Number.isInteger(m.id)) return null;
	if (m.t === 'click') return { kind: 'click', id: m.id };
	if (m.t === 'move') {
		const anchor = sanitizeAnchor(m.anchor);
		return anchor ? { kind: 'move', id: m.id, anchor } : null;
	}
	return null;
};
