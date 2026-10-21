/**
 * When a page is ready to be read or pictured: what it draws has stopped changing, and nothing it is waiting on (a
 * simulated request, a transition) is still to come. Used for covers, the accessibility scan and probe, and the build's pictures.
 */
const QUIET_MS = 500;
const CAP_MS = 8000;
/** A timer longer than this is not waited for: a toast's hide timer is not the page loading. */
const TIMER_WAIT_MS = 3000;

/**
 * Run in a page before its own scripts, so `settleScript` can tell a page that is quiet from one waiting on a timer (a
 * simulated request): the one-shot timers set to fire soon are kept in `__dsnrTimers` until they fire or are cleared.
 */
export const timerWatchScript = (): string => `(() => {
	const pending = new Set();
	const set = window.setTimeout.bind(window);
	const clear = window.clearTimeout.bind(window);
	window.__dsnrTimers = pending;
	window.setTimeout = (fn, delay, ...args) => {
		if (typeof fn !== 'function') return set(fn, delay, ...args);
		const id = set((...a) => { pending.delete(id); return fn(...a); }, delay, ...args);
		if (!(delay > ${TIMER_WAIT_MS})) pending.add(id);
		return id;
	};
	window.clearTimeout = (id) => { pending.delete(id); clear(id); };
})()`;

/**
 * Settled once nothing has changed for the quiet time and no timer set to fire soon is waiting (see `timerWatchScript`). A
 * looping animation does not hold it up: it is part of the page. A page that never settles is `capped`: a cover is
 * not kept from it, rather than a wrong one.
 */
export const settleScript = (quietMs = QUIET_MS, capMs = CAP_MS): string => `new Promise((resolve) => {
	const started = performance.now();
	let changed = started;
	const watching = new MutationObserver(() => { changed = performance.now(); });
	watching.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
	const ending = () => (document.getAnimations ? document.getAnimations() : []).some((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity);
	const waiting = () => (window.__dsnrTimers ? window.__dsnrTimers.size > 0 : false);
	const look = () => {
		const now = performance.now();
		const capped = now - started >= ${Number(capMs)};
		if (capped || (now - changed >= ${Number(quietMs)} && !ending() && !waiting())) {
			watching.disconnect();
			resolve({ capped });
		} else setTimeout(look, 50);
	};
	(document.fonts ? document.fonts.ready : Promise.resolve()).then(look, look);
})`;
