import type { CommentAnchor } from '../shared/contract';
import { describe, shiftOutline, underlying } from './helpers';

/** Where the click landed, as `readPick` takes it. */
type Picked = CommentAnchor & { at: { x: number; y: number }; box: { x: number; y: number; width: number; height: number } };

/**
 * Pin mode. Resolves with where the next click landed, or null if the person presses Escape or the app cancels. The
 * click is swallowed, so placing a pin never also follows a link or presses a button.
 *
 * A plain click places the pin on what is under it, with nothing outlined on the way. The element is still recorded, with
 * the click's position inside it, because that is what lets the pin stay in the right place when the window is resized
 * or the page reflows, and what an agent reads to find it. Holding Shift outlines what it will attach to, and a
 * Shift-click takes exactly what is outlined.
 */
export const pick = (): Promise<Picked | null> =>
	new Promise((resolve) => {
		const style = document.createElement('style');
		style.setAttribute('data-fd', 'pick');
		style.textContent = 'html, html * { cursor: crosshair !important }';
		document.head.appendChild(style);

		// With Shift held, what the pin will attach to is shown before the click: the element under the pointer is outlined
		// and named, and Up and Down climb to its container and back, for a comment about a section and not a line. A
		// Shift-click records exactly what is outlined, never a guess about what was meant.
		const hover = shiftOutline();
		let stack: Element[] = [];
		const chosen = (): Element | null => stack[stack.length - 1] ?? null;
		const paint = (shift?: boolean) => {
			const el = chosen();
			const up = el?.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement;
			hover.show(el, up ? '    ↑ container' : '', shift);
		};
		const repaint = () => paint();
		const move = (e: MouseEvent) => {
			const el = underlying(e.clientX, e.clientY);
			if (el && el.nodeType === 1 && (stack.length === 0 || stack[0] !== el)) stack = [el];
			paint(e.shiftKey);
		};

		const swallow = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		};
		const done = (value: Picked | null) => {
			style.remove();
			hover.remove();
			document.removeEventListener('click', click, true);
			document.removeEventListener('mousedown', swallow, true);
			document.removeEventListener('mouseup', swallow, true);
			document.removeEventListener('keydown', key, true);
			document.removeEventListener('mousemove', move, true);
			window.removeEventListener('scroll', repaint, true);
			window.__fdCancelPick = undefined;
			resolve(value);
		};
		const click = (e: MouseEvent) => {
			swallow(e);
			// A Shift-click takes what is outlined, which is the one the person chose. A plain click, or one that arrives with
			// nothing outlined yet (no pointer move came first), takes the element under it.
			let el = e.shiftKey ? chosen() : null;
			// What is under it is found past this app's own layers, so a click on one lands on the page beneath it.
			if (!el || !el.isConnected) el = underlying(e.clientX, e.clientY) ?? (e.target as Element | null);
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
			if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && hover.held()) {
				swallow(e);
				if (e.key === 'ArrowUp') {
					const p = chosen()?.parentElement;
					if (p && p !== document.body && p !== document.documentElement) {
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
		document.addEventListener('click', click, true);
		document.addEventListener('mousedown', swallow, true);
		document.addEventListener('mouseup', swallow, true);
		document.addEventListener('keydown', key, true);
		document.addEventListener('mousemove', move, true);
		window.addEventListener('scroll', repaint, true);
	});
