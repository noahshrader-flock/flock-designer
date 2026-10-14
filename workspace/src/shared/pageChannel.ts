/**
 * How the review bar and a prototype's page talk (REVIEW_ISOLATION_PLAN, Phase 1), on the published site and in VS Code:
 * by messages, so the bar never reaches into the page, and the page can be served from another address than the bar
 * (Phase 2) and still have its pins. The bar asks (`PageAsk`); the page's agent (`src/page/agent.ts`) answers by the
 * ask's id and reports what happens on the page (`PageTell`), each with the secret the bar gave it when it said hello.
 *
 * Each side reads the other's messages only in exactly their shape: a page is code the bar does not trust, and what it
 * says is data, read again by the readers it has always gone through (`readPick`, `readMarkers`, `readPinMessage`).
 * The Electron app does not use this: it runs the same page code from outside its own preview, in another process.
 */

/** What the bar asks: say hello (with its secret), pick a spot, cancel the pick, draw the pins, focus one, say the route. */
export const PAGE_CALLS = ['hello', 'pick', 'cancel-pick', 'draw-pins', 'focus', 'route'] as const;
export type PageCall = (typeof PAGE_CALLS)[number];

export interface PageAsk {
	dsnr: 'page-ask';
	/** Answered by it; the hello's is 0. */
	id: number;
	call: PageCall;
	args: unknown[];
}

/** What the page says: it is ready (and its route), its route moved, an answer to an ask, a pin's report. */
export type PageTell =
	| { dsnr: 'page-ready'; n: string; route: string }
	| { dsnr: 'page-route'; n: string; route: string }
	| { dsnr: 'page-answer'; n: string; id: number; value: unknown }
	| { dsnr: 'page-pin'; n: string; text: string };

/** The longest a secret, a route and a pin's report may be: more is not what the bar or the page code would send. */
const MOST = { nonce: 200, route: 2000, pin: 20_000 };
const CALLS = new Set<string>(PAGE_CALLS);

const keysAre = (m: object, keys: string[]): boolean => {
	const own = Object.keys(m).sort();
	return own.length === keys.length && [...keys].sort().every((k, i) => own[i] === k);
};
const text = (v: unknown, most: number): v is string => typeof v === 'string' && v.length <= most;

/** An ask, read as the page's agent takes it, or null. A hello carries the bar's secret. */
export const readPageAsk = (raw: unknown): PageAsk | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.dsnr !== 'page-ask' || !keysAre(m, ['dsnr', 'id', 'call', 'args'])) return null;
	if (!Number.isSafeInteger(m.id) || (m.id as number) < 0 || typeof m.call !== 'string' || !CALLS.has(m.call) || !Array.isArray(m.args)) return null;
	if (m.call === 'hello' && !(text(m.args[0], MOST.nonce) && m.args[0] !== '' && m.args.length === 1)) return null;
	return { dsnr: 'page-ask', id: m.id as number, call: m.call as PageCall, args: m.args };
};

/** What the page said, read as the bar takes it: only with the secret it was given (`nonce`), or null. */
export const readPageTell = (raw: unknown, nonce: string): PageTell | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.n !== nonce) return null;
	if ((m.dsnr === 'page-ready' || m.dsnr === 'page-route') && keysAre(m, ['dsnr', 'n', 'route']) && text(m.route, MOST.route))
		return { dsnr: m.dsnr, n: nonce, route: m.route };
	if (m.dsnr === 'page-answer' && keysAre(m, ['dsnr', 'n', 'id', 'value']) && Number.isSafeInteger(m.id))
		return { dsnr: 'page-answer', n: nonce, id: m.id as number, value: m.value };
	if (m.dsnr === 'page-pin' && keysAre(m, ['dsnr', 'n', 'text']) && text(m.text, MOST.pin)) return { dsnr: 'page-pin', n: nonce, text: m.text };
	return null;
};
