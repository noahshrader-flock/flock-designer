import type { MarkerRequest, MarkerResult } from '../shared/contract';
import { INK } from '../shared/pageInk';
import { asState, collapse, describe, pageState, place, route, shiftOutline, underlying } from './helpers';
import { MESSAGE_PREFIX } from '../shared/pinMessage';
import { AVATAR_XS_PX, initialOf, isAvatarUrl } from '../shared/avatar';

interface Placed {
	id: number;
	author: string;
	avatarUrl: string | null;
	draft: boolean;
	movable: boolean;
	el: Element;
	offset: { x: number; y: number };
	/** Where it was dropped, while the app saves it; null when it sits on its element. */
	pos: { x: number; y: number } | null;
	marker?: HTMLElement;
}

// The picture is drawn only from the host's own address (`isAvatarUrl`), whoever asked, and never sends where the page is.
const faceOf = (p: Placed): HTMLElement | null => {
	if (p.draft) return null;
	const size = AVATAR_XS_PX;
	const face = document.createElement('span');
	face.style.cssText = `position:relative;transform:rotate(45deg);width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:${INK.on};color:${INK.pin};font:700 11px/1 sans-serif;pointer-events:none`;
	const letter = document.createElement('span');
	letter.textContent = initialOf(p.author);
	face.appendChild(letter);
	if (isAvatarUrl(p.avatarUrl)) {
		const picture = document.createElement('img');
		picture.alt = '';
		picture.referrerPolicy = 'no-referrer';
		picture.draggable = false;
		picture.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
		picture.addEventListener('error', () => picture.remove());
		picture.src = p.avatarUrl;
		face.appendChild(picture);
	}
	return face;
};

/**
 * `moved` when only its text was found again, `missing` when neither selector nor text was, `otherState` for another state
 * of this page, where the element may be a different thing. Calling it again replaces the pins; with nothing, clears them.
 */
export const drawPins = (items: MarkerRequest[], nonce: string): MarkerResult[] => {
	window.__fdMarkers?.stop();
	// The pins' own layer, not the first of DSNR's: comment mode keeps an outline layer too, and removing that would leave the
	// old pins behind.
	document.querySelector('[data-fd-layer="pins"]')?.remove();
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
		// The stored text is cut at 80 characters and the page may have changed a little: a pin roughly in the right place
		// beats one that disappears whenever a single character moves.
		if (!el && a.nearbyText.length >= 3) {
			const want = a.nearbyText;
			// Enough to identify the element, short enough to survive an edit further along the line.
			const head = want.slice(0, Math.max(12, Math.min(40, want.length)));
			let best: Element | null = null;
			let bestLen = Infinity;
			for (const candidate of document.body ? document.body.querySelectorAll('*') : []) {
				const t = collapse(candidate.textContent);
				if (t.length === 0) continue;
				// Either side may be the longer, as the element's text may have been shortened since. The shortest match is the
				// innermost one.
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
		placed.push({
			id: item.id,
			author: item.author,
			avatarUrl: item.avatarUrl,
			draft: item.id < 0,
			movable: !!item.movable,
			el,
			offset: a.offset || { x: 0, y: 0 },
			pos: null,
		});
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

	// The wrapper has no size and sits exactly on the clicked point; the pin's tip hangs from it.
	for (const p of placed) {
		const m = document.createElement('div');
		m.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
		const pin = document.createElement('div');
		pin.style.cssText = `position:absolute;left:-14px;top:-33px;width:28px;height:28px;border-radius:50% 50% 50% 0;background:${p.draft ? INK.draft : INK.pin};border:2px solid ${INK.on};box-shadow:0 2px 6px ${INK.shadow};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:${p.movable ? 'grab' : 'pointer'}`;
		const face = faceOf(p);
		if (face) pin.appendChild(face);
		if (!p.draft) pin.title = p.author;
		m.appendChild(pin);
		p.marker = m;
		layer.appendChild(m);

		// Nothing here may reach the page's own handlers.
		pin.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			const sx = e.clientX;
			const sy = e.clientY;
			let dragging = false;
			let hover: ReturnType<typeof shiftOutline> | null = null;
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
				hover ??= shiftOutline();
				hover.show(underlying(ev.clientX, ev.clientY), '', ev.shiftKey);
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

/** Resolves once the page has painted the change, so a picture taken after it shows no pin. */
export const setLayersVisible = (visible: boolean): Promise<true> => {
	for (const layer of document.querySelectorAll<HTMLElement>('[data-fd-layer]')) layer.style.visibility = visible ? 'visible' : 'hidden';
	return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))));
};
