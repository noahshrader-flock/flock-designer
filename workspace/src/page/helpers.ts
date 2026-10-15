import { type Theme, isTheme, withoutTheme } from '../shared/prototypeTheme';
import type { CommentAnchor } from '../shared/contract';
import { STATES_META } from '../shared/prototypeStates';
import { INK } from '../shared/pageInk';

/**
 * How an element of the page is found and described, shared by placing a pin (`pick.ts`) and drawing them (`pins.ts`).
 * Read afresh each run: every script is the whole bundle, run once.
 */

export const collapse = (t: unknown): string =>
	String(t || '')
		.replace(/\s+/g, ' ')
		.trim();
const esc = (v: string): string => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/[^\w-]/g, '\\$&'));
const unique = (sel: string): boolean => {
	try {
		return document.querySelectorAll(sel).length === 1;
	} catch {
		return false;
	}
};

// A prototype is one page wherever it is served (the app's own server, the published site), so only what follows its #
// says where in it a comment is; its driver says when it is one (SINGLE_PAGE). Anything else is a real app, where the
// path is the place.
const single = !!window.__fdSinglePage;
export const place = (r: string): string => {
	if (!single) return r;
	const i = String(r).indexOf('#');
	return i < 0 ? '/' : '/' + String(r).slice(i);
};
export const route = (): string => place(location.pathname + location.hash);

// Which state of the page a prototype is showing. Recorded with a comment and compared when the comment is placed again,
// so the two must read it the same way: one definition, used by both. A prototype lists its states in its own tag, the
// first being the page as it opens; that one asked for by name (?state=default, as the bars prototypes once drew wrote
// it) is the same as no query (stateOfQuery in shared/prototypeStates says so for the app). A page with no tag is
// compared as it is.
const statesTag = document.querySelector(`meta[name="${STATES_META}"]`);
const firstState = statesTag ? String(statesTag.getAttribute('content') || '').split(',')[0] : null;
export const asState = (q: string): string => (firstState && q === '?state=' + firstState ? '' : q);
export const pageState = (): string => asState(withoutTheme(location.search).slice(0, 200));
/**
 * The theme the page was seen in: the one a prototype was put in (`page/theme.ts` says it on the page), else, on a page DSNR
 * did not theme (codebase work: the real app), the system's, which is what that page follows.
 */
export const pageTheme = (): Theme => {
	const themed = document.documentElement.getAttribute('data-dsnr-theme');
	if (isTheme(themed)) return themed;
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const segment = (el: Element): string => {
	const ref = el.getAttribute('data-e2e-ref');
	if (ref) return '[data-e2e-ref="' + ref.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
	// Ids React and component libraries generate at render time (":r1:", "mui-3") are not the same next time, so they
	// are not used to find an element again.
	if (el.id && !/^(:r|mui-|radix-|react-|rc_)|\d{3,}/i.test(el.id) && unique('#' + esc(el.id))) return '#' + esc(el.id);
	const tag = el.tagName.toLowerCase();
	let n = 1;
	let sib: Element | null = el;
	while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) n++;
	return tag + ':nth-of-type(' + n + ')';
};

/** The nearest ancestor with a stable name, which is the part of the page least likely to be rearranged. */
const namedScope = (el: Element): Element | null => {
	let cur = el.parentElement;
	while (cur && cur !== document.body && cur !== document.documentElement) {
		if (cur.getAttribute('data-e2e-ref')) return cur;
		cur = cur.parentElement;
	}
	return null;
};

/**
 * How an element is found again after the code has changed.
 *
 * A path of direct children says where an element sits in a tree that is about to be rearranged: inserting one wrapper
 * div, which is what restyling does, breaks it. So when the element has no stable name of its own, it is described as a
 * *descendant* of the nearest element that does ("the p inside billing-card"). That holds through anything done inside
 * the card, and is scoped to the card, so it cannot drift onto an identical-looking element elsewhere on the page. The
 * old path remains for a page with no stable names anywhere.
 */
const selectorFor = (el: Element): string => {
	const own = segment(el);
	if (own.charAt(0) === '[' || own.charAt(0) === '#') return own;
	const scope = namedScope(el);
	if (scope) {
		const head = segment(scope) + ' ';
		const tag = el.tagName.toLowerCase();
		if (unique(head + tag)) return head + tag;
		const same = scope.querySelectorAll(tag);
		for (let i = 0; i < same.length; i++) {
			if (same[i] === el) {
				const nth = head + tag + ':nth-of-type(' + (i + 1) + ')';
				// nth-of-type counts among siblings, not among matches, so it only means this element when it agrees.
				if (document.querySelectorAll(nth).length === 1 && document.querySelector(nth) === el) return nth;
				break;
			}
		}
	}
	const parts: string[] = [];
	let cur: Element | null = el;
	while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
		parts.unshift(segment(cur));
		if (unique(parts.join(' > '))) return parts.join(' > ');
		cur = cur.parentElement;
	}
	return parts.join(' > ') || 'html';
};

/** The page's own element at a point, ignoring this app's pins. */
export const underlying = (x: number, y: number): Element | null => {
	const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
	return stack.find((el) => !el.closest('[data-fd-layer]')) ?? null;
};

/** The text of the heading a container leads with, if it has one. */
const headingOf = (container: Element): string => {
	for (const c of container.children) {
		if (/^(H[1-6]|LEGEND)$/.test(c.tagName)) return collapse(c.textContent);
		if (c.tagName === 'HEADER') {
			for (const h of c.children) if (/^H[1-6]$/.test(h.tagName)) return collapse(h.textContent);
		}
	}
	return '';
};

/**
 * The named containers an element sits inside, outermost first (at most three): what a person would call the section.
 * A container is named by its aria-label, its own heading, or its stable name. This is text a person or an agent can
 * search for, which a path of nth-of-type cannot be.
 */
const containers = (el: Element): string[] => {
	const found: string[] = [];
	const own = collapse(el.textContent).slice(0, 60);
	let cur = el.parentElement;
	while (cur && cur !== document.body && cur !== document.documentElement && found.length < 3) {
		const label = (collapse(cur.getAttribute('aria-label') || '') || headingOf(cur) || collapse(cur.getAttribute('data-e2e-ref') || '')).slice(0, 60);
		if (label && label !== own && found.indexOf(label) < 0) found.push(label);
		cur = cur.parentElement;
	}
	return found.reverse();
};

/** Where a click landed: the element, and the position inside it. */
export const describe = (el: Element, x: number, y: number): CommentAnchor => {
	const rect = el.getBoundingClientRect();
	return {
		route: route(),
		selector: selectorFor(el),
		tag: el.tagName.toLowerCase(),
		inside: containers(el),
		nearbyText: collapse((el as HTMLElement).innerText || el.textContent).slice(0, 80),
		viewport: { width: window.innerWidth, height: window.innerHeight },
		commit: '',
		// Which state of the page: a prototype's switch lives in the query string, so a comment made on Error is not
		// mistaken for one made on Loaded.
		state: pageState(),
		// Which theme it was seen in, so a problem seen only in dark is opened in dark again.
		theme: pageTheme(),
		offset: rect.width > 0 && rect.height > 0 ? { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height } : { x: 0, y: 0 },
	};
};

/**
 * The outline and its label, in the pin's colour, which show what a pin will attach to (shown while Shift is held:
 * `shiftOutline`).
 *
 * Shared by placing a pin and dragging one: a pin that is dropped re-attaches to whatever is under it, so the person
 * moving it needs to see the same thing as the person placing it, looking the same way. Returns what the caller drives
 * it with; remove() takes it off the page again.
 */
export const hoverOutline = () => {
	const outline = document.createElement('div');
	outline.setAttribute('data-fd-layer', 'hover');
	outline.style.cssText = `position:fixed;pointer-events:none;z-index:2147483646;display:none;border:2px solid ${INK.pin};background:${INK.pinWash};border-radius:2px;box-sizing:border-box`;
	const chip = document.createElement('div');
	chip.setAttribute('data-fd-layer', 'hover');
	chip.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;display:none;background:${INK.pin};color:${INK.on};font:600 11px/1.4 sans-serif;padding:2px 6px;border-radius:3px;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
	document.documentElement.appendChild(outline);
	document.documentElement.appendChild(chip);
	const hide = () => {
		outline.style.display = 'none';
		chip.style.display = 'none';
	};
	return {
		/** Draws it around el, with its tag and text; hint is appended to the label when given. */
		show: (el: Element | null, hint: string) => {
			if (!el || el.nodeType !== 1) return hide();
			const r = el.getBoundingClientRect();
			outline.style.display = 'block';
			outline.style.left = r.left + 'px';
			outline.style.top = r.top + 'px';
			outline.style.width = r.width + 'px';
			outline.style.height = r.height + 'px';
			chip.textContent =
				'<' + el.tagName.toLowerCase() + '> ' + collapse((el as HTMLElement).innerText || el.textContent).slice(0, 40) + (hint || '');
			chip.style.display = 'block';
			chip.style.left = Math.max(0, r.left) + 'px';
			chip.style.top = (r.top > 22 ? r.top - 22 : r.bottom + 2) + 'px';
		},
		hide,
		remove: () => {
			outline.remove();
			chip.remove();
		},
	};
};

/**
 * The outline, shown only while Shift is held: placing a pin and dragging one show what it will attach to only when the
 * person asks, so the page is not lit up under every move. `show` says what would be outlined (and, from a pointer event,
 * whether Shift is down); pressing or letting go of Shift shows or hides it where it is, without the pointer moving.
 */
export const shiftOutline = () => {
	const hover = hoverOutline();
	let held = false;
	let last: [Element | null, string] = [null, ''];
	const paint = () => (held ? hover.show(...last) : hover.hide());
	const key = (e: KeyboardEvent) => {
		if (e.key !== 'Shift') return;
		held = e.type === 'keydown';
		paint();
	};
	// A Shift let go in another window is never heard: leaving this one lets it go.
	const blur = () => {
		held = false;
		paint();
	};
	document.addEventListener('keydown', key, true);
	document.addEventListener('keyup', key, true);
	window.addEventListener('blur', blur);
	return {
		show: (el: Element | null, hint: string, shift?: boolean) => {
			last = [el, hint];
			if (shift !== undefined) held = shift;
			paint();
		},
		/** Whether Shift is held: the arrow keys climb to a container only then, as only then is there an outline to climb. */
		held: () => held,
		remove: () => {
			hover.remove();
			document.removeEventListener('keydown', key, true);
			document.removeEventListener('keyup', key, true);
			window.removeEventListener('blur', blur);
		},
	};
};
