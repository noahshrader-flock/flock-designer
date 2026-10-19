import { MESSAGE_PREFIX } from '../shared/pinMessage';
import { sanitizeAnchor } from '../shared/anchor';
import type { CommentAnchor, MarkerRequest, MarkerResult, PinEvent } from '../shared/contract';

/*
 * Reading what the page agent answers. A page can say anything, so each answer is taken only in exactly the shape the
 * page code gives.
 */

/** Where a pick landed: the anchor, the point (only for placing the comment box), and the element's own box. */
export interface PickedSpot {
	anchor: CommentAnchor;
	at: { x: number; y: number };
	box: { x: number; y: number; width: number; height: number } | null;
}

/**
 * The answer to a pick: null when the pick was canceled. Throws, to be said aloud, when the spot could not be
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

/** The answer to drawing the pins: how each pin asked for was placed, and nothing else. */
export const readMarkers = (raw: unknown, items: MarkerRequest[]): MarkerResult[] => {
	const wanted = new Set(items.map((i) => i.id));
	return (Array.isArray(raw) ? raw : []).flatMap((r): MarkerResult[] => {
		// A page can answer anything in the list, `null` included, so an entry is read only when it is an object.
		const rec = (typeof r === 'object' && r !== null ? r : {}) as { id?: unknown; state?: unknown };
		return typeof rec.id === 'number' && wanted.has(rec.id) && typeof rec.state === 'string' && MARKER_STATES.has(rec.state)
			? [{ id: rec.id, state: rec.state as MarkerResult['state'] }]
			: [];
	});
};

/**
 * A pin's report, from the page agent. It counts only if it carries the secret its pins were drawn with and has
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
