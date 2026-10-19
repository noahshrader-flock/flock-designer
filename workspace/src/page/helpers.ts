import { type Theme, isTheme, withoutTheme } from '../shared/prototypeTheme';
import type { CommentAnchor } from '../shared/contract';
import { STATES_META } from '../shared/prototypeStates';
import { INK } from '../shared/pageInk';

// Module-level reads are afresh each run: every script is the whole bundle, run once.

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

// A prototype is one page wherever it is served, so only what follows its # places a comment; in a real app the path does.
const single = !!window.__fdSinglePage;
export const place = (r: string): string => {
	if (!single) return r;
	const i = String(r).indexOf('#');
	return i < 0 ? '/' : '/' + String(r).slice(i);
};
export const route = (): string => place(location.pathname + location.hash);

// The first state in a prototype's tag is the page as it opens, so asking for it by name is the same as no query (as
// `stateOfQuery` has it).
const statesTag = document.querySelector(`meta[name="${STATES_META}"]`);
const firstState = statesTag ? String(statesTag.getAttribute('content') || '').split(',')[0] : null;
export const asState = (q: string): string => (firstState && q === '?state=' + firstState ? '' : q);
export const pageState = (): string => asState(withoutTheme(location.search).slice(0, 200));
// A page DSNR did not theme (the real app, in codebase work) follows the system's theme.
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

const namedScope = (el: Element): Element | null => {
	let cur = el.parentElement;
	while (cur && cur !== document.body && cur !== document.documentElement) {
		if (cur.getAttribute('data-e2e-ref')) return cur;
		cur = cur.parentElement;
	}
	return null;
};

/**
 * A path of direct children breaks when restyling adds one wrapper div, so an element with no stable name is described as
 * a descendant of the nearest one that has one. The full path is kept for a page with no stable names anywhere.
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

export const underlying = (x: number, y: number): Element | null => {
	const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
	return stack.find((el) => !el.closest('[data-fd-layer]')) ?? null;
};

const headingOf = (container: Element): string => {
	for (const c of container.children) {
		if (/^(H[1-6]|LEGEND)$/.test(c.tagName)) return collapse(c.textContent);
		if (c.tagName === 'HEADER') {
			for (const h of c.children) if (/^H[1-6]$/.test(h.tagName)) return collapse(h.textContent);
		}
	}
	return '';
};

// Outermost first: text a person or an agent can search for, which a path of nth-of-type cannot be.
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
		// A prototype's state switch lives in the query string, so a comment made on Error is not mistaken for one on Loaded.
		state: pageState(),
		// So a problem seen only in dark is opened in dark again.
		theme: pageTheme(),
		offset: rect.width > 0 && rect.height > 0 ? { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height } : { x: 0, y: 0 },
	};
};

const hoverOutline = () => {
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

// Shown only while Shift is held, so the page is not lit up under every move.
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
		held: () => held,
		remove: () => {
			hover.remove();
			document.removeEventListener('keydown', key, true);
			document.removeEventListener('keyup', key, true);
			window.removeEventListener('blur', blur);
		},
	};
};
