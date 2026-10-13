import type { CommentAnchor } from '../shared/contract';
import { describe, doc, hoverOutline, underlying } from './helpers';

/** Where the click landed, as `readPick` takes it. */
type Picked = CommentAnchor & { at: { x: number; y: number }; box: { x: number; y: number; width: number; height: number } };

/**
 * Pin mode. Resolves with where the next click landed, or null if the person presses Escape or the app cancels. The
 * click is swallowed, so placing a pin never also follows a link or presses a button.
 *
 * The person is placing a pin, not choosing an element, so nothing is highlighted. The element underneath is still
 * recorded, with the click's position inside it, because that is what lets the pin stay in the right place when the
 * window is resized or the page reflows.
 */
export const pick = (): Promise<Picked | null> =>
	new Promise((resolve) => {
		const style = doc.createElement('style');
		style.setAttribute('data-fd', 'pick');
		style.textContent = 'html, html * { cursor: crosshair !important }';
		doc.head.appendChild(style);

		// What the pin will attach to is shown before the click: the element under the pointer is outlined and named. Up
		// and Down arrows climb to its container and back, for a comment about a section and not a line. What is recorded
		// is exactly what is outlined, never a guess about what was meant.
		const hover = hoverOutline();
		let stack: Element[] = [];
		const chosen = (): Element | null => stack[stack.length - 1] ?? null;
		const paint = () => {
			const el = chosen();
			if (!el) return hover.hide();
			const up = el.parentElement && el.parentElement !== doc.body && el.parentElement !== doc.documentElement;
			hover.show(el, up ? '    ↑ container' : '');
		};
		const move = (e: MouseEvent) => {
			const el = underlying(e.clientX, e.clientY);
			if (el && el.nodeType === 1 && (stack.length === 0 || stack[0] !== el)) {
				stack = [el];
				paint();
			}
		};

		const swallow = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		};
		const done = (value: Picked | null) => {
			style.remove();
			hover.remove();
			doc.removeEventListener('click', click, true);
			doc.removeEventListener('mousedown', swallow, true);
			doc.removeEventListener('mouseup', swallow, true);
			doc.removeEventListener('keydown', key, true);
			doc.removeEventListener('mousemove', move, true);
			window.removeEventListener('scroll', paint, true);
			window.__fdCancelPick = undefined;
			resolve(value);
		};
		const click = (e: MouseEvent) => {
			swallow(e);
			// The element that is outlined, which is the one the person chose. A click that arrives with nothing outlined yet
			// (no pointer move came first) takes the element under it.
			let el = chosen();
			if (!el || !el.isConnected) {
				el = e.target as Element | null;
				// A click on one of this app's own layers lands on the page beneath it.
				if (el && el.closest && el.closest('[data-fd-layer]')) el = underlying(e.clientX, e.clientY);
			}
			if (!el || el.nodeType !== 1) return done(null);
			// Where the click landed in the page, so the app can put the comment box beside the pin; and the element's own
			// box, so the picture can frame the element and not a fixed square around the click.
			const r = el.getBoundingClientRect();
			done({
				...describe(el, e.clientX, e.clientY),
				at: { x: e.clientX, y: e.clientY },
				box: { x: r.left, y: r.top, width: r.width, height: r.height },
			});
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === 'Escape') return done(null);
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				swallow(e);
				if (e.key === 'ArrowUp') {
					const p = chosen()?.parentElement;
					if (p && p !== doc.body && p !== doc.documentElement) {
						stack.push(p);
						paint();
					}
				} else if (stack.length > 1) {
					stack.pop();
					paint();
				}
			}
		};
		window.__fdCancelPick = () => done(null);
		doc.addEventListener('click', click, true);
		doc.addEventListener('mousedown', swallow, true);
		doc.addEventListener('mouseup', swallow, true);
		doc.addEventListener('keydown', key, true);
		doc.addEventListener('mousemove', move, true);
		window.addEventListener('scroll', paint, true);
	});
