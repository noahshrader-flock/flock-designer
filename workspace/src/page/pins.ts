import type { MarkerRequest, MarkerResult } from '../shared/contract';
import { INK, asState, collapse, describe, hoverOutline, pageState, place, route, underlying } from './helpers';
import { MESSAGE_PREFIX } from '../shared/pinMessage';

interface Placed {
	id: number;
	number: number;
	draft: boolean;
	movable: boolean;
	el: Element;
	offset: { x: number; y: number };
	/** Where it was dropped, while the app saves it; null when it sits on its element. */
	pos: { x: number; y: number } | null;
	marker?: HTMLElement;
}

/**
 * Finds each comment's element and draws a numbered pin on it. Returns, per comment, how it was placed:
 *
 * - `found`: the selector still matches exactly one element;
 * - `moved`: it does not, but one element still starts with the text that was beside the comment, so the pin follows the
 *   text;
 * - `missing`: neither; the comment stays, as a page-level comment;
 * - `elsewhere`: it belongs to a different page of the preview;
 * - `otherState`: it belongs to this page but another state of it (`?state=error`), where the element may not exist or
 *   may be a different thing, so it is not drawn.
 *
 * A pin can be clicked (the app highlights its comment) and, if it is the viewer's own, dragged (the app saves where it
 * was dropped). Calling this again replaces the pins; calling it with nothing clears them.
 */
export const drawPins = (items: MarkerRequest[], nonce: string): MarkerResult[] => {
	window.__fdMarkers?.stop();
	// The pins' own layer, not the first of the app's layers: comment mode keeps an outline on the page too, and a redraw
	// that took that one left the old pins behind (a deleted comment's pin stayed on the page).
	document.querySelector('[data-fd-layer="pins"]')?.remove();
	// To the page agent when there is one (the published site, VS Code), else the console, which the app listens to.
	const say = (msg: Record<string, unknown>) => {
		const text = MESSAGE_PREFIX + JSON.stringify({ ...msg, n: nonce });
		if (window.__fdReport) window.__fdReport(text);
		else console.debug(text);
	};
	const results: MarkerResult[] = [];
	const placed: Placed[] = [];
	const current = route();
	for (const item of items) {
		const a = item.anchor;
		if (place(a.route) !== current) {
			results.push({ id: item.id, state: 'elsewhere' });
			continue;
		}
		// Comments from before the state was recorded have none, and are shown wherever their element is.
		if (a.state !== undefined && asState(a.state) !== pageState()) {
			results.push({ id: item.id, state: 'otherState' });
			continue;
		}
		let el: Element | null = null;
		let state: MarkerResult['state'] = 'found';
		try {
			const hits = document.querySelectorAll(a.selector);
			if (hits.length === 1) el = hits[0] ?? null;
		} catch {
			// A selector the page cannot read is one that matches nothing.
		}
		// The selector did not match, so follow the text instead. The stored text is a prefix cut at 80 characters, often
		// mid-word, and the page may have changed a little since; so this takes the smallest element whose text *begins
		// like* the stored text, rather than demanding the whole prefix still match. A comment that lands roughly in the
		// right place is worth far more than one that disappears, which is what an exact match gave whenever a single
		// character moved.
		if (!el && a.nearbyText.length >= 3) {
			const want = a.nearbyText;
			// Enough to identify the element, short enough to survive an edit further along the line.
			const head = want.slice(0, Math.max(12, Math.min(40, want.length)));
			let best: Element | null = null;
			let bestLen = Infinity;
			for (const candidate of document.body ? document.body.querySelectorAll('*') : []) {
				const t = collapse(candidate.textContent);
				if (t.length === 0) continue;
				// Either side may be the longer: the stored text is a prefix of the live text, or the element's text was
				// shortened since. The shortest element that still matches is the innermost one.
				const hit = t.indexOf(want) === 0 || want.indexOf(t) === 0 || t.indexOf(head) === 0;
				if (hit && t.length < bestLen) {
					best = candidate;
					bestLen = t.length;
				}
			}
			if (best) {
				el = best;
				state = 'moved';
			}
		}
		if (!el) {
			results.push({ id: item.id, state: 'missing' });
			continue;
		}
		placed.push({ id: item.id, number: item.number, draft: item.id < 0, movable: !!item.movable, el, offset: a.offset || { x: 0, y: 0 }, pos: null });
		results.push({ id: item.id, state });
	}
	if (placed.length === 0) {
		window.__fdMarkers = undefined;
		return results;
	}

	const layer = document.createElement('div');
	layer.setAttribute('data-fd-layer', 'pins');
	layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';

	const positionPins = () => {
		for (const p of placed) {
			let x: number;
			let y: number;
			let hidden = false;
			if (p.pos) ({ x, y } = p.pos);
			else {
				const r = p.el.getBoundingClientRect();
				x = r.left + r.width * p.offset.x;
				y = r.top + r.height * p.offset.y;
				hidden = r.width === 0 && r.height === 0;
			}
			const m = p.marker as HTMLElement;
			m.style.left = x + 'px';
			m.style.top = y + 'px';
			m.style.display = hidden ? 'none' : 'block';
		}
	};

	// A teardrop pin whose tip is the point that was clicked. The wrapper has no size and sits exactly on that point; the
	// pin hangs above it.
	for (const p of placed) {
		const m = document.createElement('div');
		m.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
		const pin = document.createElement('div');
		pin.style.cssText = `position:absolute;left:-14px;top:-33px;width:28px;height:28px;border-radius:50% 50% 50% 0;background:${p.draft ? INK.draft : INK.pin};border:2px solid ${INK.on};box-shadow:0 2px 6px ${INK.shadow};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:${p.movable ? 'grab' : 'pointer'}`;
		const label = document.createElement('span');
		label.textContent = String(p.number);
		label.style.cssText = `transform:rotate(45deg);color:${INK.on};font:700 12px/1 sans-serif;pointer-events:none`;
		pin.appendChild(label);
		m.appendChild(pin);
		p.marker = m;
		layer.appendChild(m);

		// Click selects; dragging (only for the viewer's own pins) moves. Nothing here reaches the page's own handlers.
		pin.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			const sx = e.clientX;
			const sy = e.clientY;
			let dragging = false;
			let hover: ReturnType<typeof hoverOutline> | null = null;
			if (pin.setPointerCapture && e.pointerId !== undefined) {
				try {
					pin.setPointerCapture(e.pointerId);
				} catch {
					// A pointer the page no longer has: the drag still follows the pin's own events.
				}
			}
			const move = (ev: PointerEvent) => {
				ev.stopPropagation();
				if (!p.movable) return;
				if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
				dragging = true;
				p.pos = { x: ev.clientX, y: ev.clientY };
				pin.style.cursor = 'grabbing';
				positionPins();
				// Dropping re-attaches the pin to whatever is under it, so show what that is while it is being dragged: the
				// same outline, from the same code, as when a pin is first placed. It exists only for the length of the drag.
				hover ??= hoverOutline();
				hover.show(underlying(ev.clientX, ev.clientY), '');
			};
			const up = (ev: PointerEvent) => {
				ev.stopPropagation();
				pin.removeEventListener('pointermove', move);
				pin.removeEventListener('pointerup', up);
				hover?.remove();
				hover = null;
				if (pin.releasePointerCapture && e.pointerId !== undefined) {
					try {
						pin.releasePointerCapture(e.pointerId);
					} catch {
						// Already released by the page.
					}
				}
				pin.style.cursor = p.movable ? 'grab' : 'pointer';
				if (!dragging) return say({ t: 'click', id: p.id });
				const target = underlying(ev.clientX, ev.clientY);
				if (!target) {
					p.pos = null;
					return positionPins();
				}
				// The pin stays where it was dropped until the app redraws it from the saved comment.
				say({ t: 'move', id: p.id, anchor: describe(target, ev.clientX, ev.clientY) });
			};
			pin.addEventListener('pointermove', move);
			pin.addEventListener('pointerup', up);
		});
	}
	document.documentElement.appendChild(layer);
	positionPins();
	window.addEventListener('scroll', positionPins, true);
	window.addEventListener('resize', positionPins);
	const timer = setInterval(positionPins, 400);
	window.__fdMarkers = {
		stop: () => {
			window.removeEventListener('scroll', positionPins, true);
			window.removeEventListener('resize', positionPins);
			clearInterval(timer);
		},
		focus: (id) => {
			for (const p of placed) {
				if (p.id !== id) continue;
				p.el.scrollIntoView({ block: 'center', inline: 'nearest' });
				const m = p.marker?.firstChild as HTMLElement;
				m.animate([{ transform: 'rotate(-45deg) scale(1)' }, { transform: 'rotate(-45deg) scale(1.6)' }, { transform: 'rotate(-45deg) scale(1)' }], {
					duration: 700,
				});
				positionPins();
			}
		},
	};
	return results;
};

/**
 * Hides or shows the app's own layers (the pins, and the outline while one is being placed), and resolves once the page
 * has painted that. A picture of the spot is taken with them hidden, so it shows the thing that was clicked and not an
 * earlier pin.
 */
export const setLayersVisible = (visible: boolean): Promise<true> => {
	for (const layer of document.querySelectorAll<HTMLElement>('[data-fd-layer]')) layer.style.visibility = visible ? 'visible' : 'hidden';
	return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))));
};
