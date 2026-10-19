import { hasExactly } from './validate';

/**
 * The bar never reaches into the page, which can be served from another address. A page is untrusted: each side reads
 * only exact shapes, and the page tells only with the bar's hello secret.
 */

export const PAGE_CALLS = ['hello', 'pick', 'cancel-pick', 'draw-pins', 'focus'] as const;
export type PageCall = (typeof PAGE_CALLS)[number];

export interface PageAsk {
	dsnr: 'page-ask';
	/** Answered by it; the hello's is 0. */
	id: number;
	call: PageCall;
	args: unknown[];
}

export type PageTell =
	| { dsnr: 'page-ready'; n: string; route: string }
	| { dsnr: 'page-route'; n: string; route: string }
	| { dsnr: 'page-answer'; n: string; id: number; value: unknown }
	| { dsnr: 'page-pin'; n: string; text: string };

/** More is not what the bar or the page code would send. */
const MOST = { nonce: 200, route: 2000, pin: 20_000 };
const CALLS = new Set<string>(PAGE_CALLS);

const text = (v: unknown, most: number): v is string => typeof v === 'string' && v.length <= most;

export const readPageAsk = (raw: unknown): PageAsk | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.dsnr !== 'page-ask' || !hasExactly(m, ['dsnr', 'id', 'call', 'args'])) return null;
	if (!Number.isSafeInteger(m.id) || (m.id as number) < 0 || typeof m.call !== 'string' || !CALLS.has(m.call) || !Array.isArray(m.args)) return null;
	if (m.call === 'hello' && !(text(m.args[0], MOST.nonce) && m.args[0] !== '' && m.args.length === 1)) return null;
	return { dsnr: 'page-ask', id: m.id as number, call: m.call as PageCall, args: m.args };
};

export const readPageTell = (raw: unknown, nonce: string): PageTell | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.n !== nonce) return null;
	if ((m.dsnr === 'page-ready' || m.dsnr === 'page-route') && hasExactly(m, ['dsnr', 'n', 'route']) && text(m.route, MOST.route))
		return { dsnr: m.dsnr, n: nonce, route: m.route };
	if (m.dsnr === 'page-answer' && hasExactly(m, ['dsnr', 'n', 'id', 'value']) && Number.isSafeInteger(m.id))
		return { dsnr: 'page-answer', n: nonce, id: m.id as number, value: m.value };
	if (m.dsnr === 'page-pin' && hasExactly(m, ['dsnr', 'n', 'text']) && text(m.text, MOST.pin)) return { dsnr: 'page-pin', n: nonce, text: m.text };
	return null;
};
