/**
 * Runs in the page before its own code. Each measure returns plain data; what counts as a fault is decided outside
 * (`services/accessibility/probe`).
 */

import { type Rgb, contrastOf } from '../shared/contrast';
import {
	type Box,
	type Button,
	type FaintPart,
	type Field,
	type FormErrors,
	INTERACTIVE_ROLES,
	type Read,
	type Spot,
	type Stop,
	type Watched,
} from '../shared/probeData';

const MOST_HTML = 200;
const MOST_TEXT = 80;
// So a huge page is still read in time; a page with more says so (`read.capped`).
const MOST_ELEMENTS = 20000;

const NATIVE_INTERACTIVE =
	'a[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [contenteditable=""], [contenteditable="true"]';
const ROLE_INTERACTIVE = INTERACTIVE_ROLES.map((r) => `[role="${r}"]`).join(', ');
const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="timer"], [role="marquee"], output';
const DIALOG = '[role="dialog"], [role="alertdialog"], dialog';
const TEXT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'textarea'];
/** Widgets whose items are reached by arrow keys, not by Tab ("roving" focus). */
const COMPOSITE =
	'[role="listbox"], [role="menu"], [role="menubar"], [role="grid"], [role="treegrid"], [role="tree"], [role="tablist"], [role="radiogroup"], [role="toolbar"]';

const INTO = ' >>> ';

const roots = (): (Document | ShadowRoot)[] => {
	const out: (Document | ShadowRoot)[] = [];
	const walk = (root: Document | ShadowRoot) => {
		out.push(root);
		for (const el of Array.from(root.querySelectorAll('*'))) {
			if (el.shadowRoot) walk(el.shadowRoot);
			if (el.tagName === 'IFRAME') {
				const doc = frameDocument(el);
				if (doc) walk(doc);
			}
		}
	};
	walk(document);
	return out;
};

const frameDocument = (el: Element): Document | null => {
	try {
		return (el as HTMLIFrameElement).contentDocument;
	} catch {
		return null;
	}
};

const read: Read = { elements: 0, capped: false };

const all = (selector = '*'): Element[] => {
	const found: Element[] = [];
	for (const root of roots()) {
		const scope = root instanceof Document ? root.body : root;
		if (!scope) continue;
		for (const el of Array.from(scope.querySelectorAll(selector))) {
			if (found.length >= MOST_ELEMENTS) {
				read.capped = true;
				return found;
			}
			found.push(el);
		}
	}
	read.elements = Math.max(read.elements, found.length);
	return found;
};

export const howMuch = (): Read => ({ ...read });

const parentOf = (el: Element): Element | null => {
	if (el.parentElement) return el.parentElement;
	const root = el.getRootNode();
	if (root instanceof ShadowRoot) return root.host;
	return (el.ownerDocument.defaultView?.frameElement as Element | null) ?? null;
};

const holds = (outer: Element, inner: Element): boolean => {
	for (let e: Element | null = inner; e; e = parentOf(e)) if (e === outer) return true;
	return false;
};

const rectOf = (el: Element): DOMRect => {
	const r = el.getBoundingClientRect();
	let x = r.x;
	let y = r.y;
	for (let frame = el.ownerDocument.defaultView?.frameElement; frame; frame = frame.ownerDocument.defaultView?.frameElement) {
		const f = frame.getBoundingClientRect();
		x += f.x;
		y += f.y;
	}
	return new DOMRect(x, y, r.width, r.height);
};

export const shown = (el: Element): boolean => {
	if (!el.isConnected) return false;
	if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
	const r = el.getBoundingClientRect();
	return r.width > 0 && r.height > 0;
};

const localPath = (el: Element): string => {
	const root = el.getRootNode() as Document | ShadowRoot;
	const parts: string[] = [];
	let e: Element | null = el;
	while (e && e !== el.ownerDocument.documentElement) {
		if (e.id && root.querySelectorAll(`#${CSS.escape(e.id)}`).length === 1) {
			parts.unshift(`#${CSS.escape(e.id)}`);
			break;
		}
		const parent: Element | null = e.parentElement;
		const tag = e.tagName.toLowerCase();
		const siblings = parent ? Array.from(parent.children) : e.parentNode ? Array.from(e.parentNode.children) : [];
		const same = siblings.filter((c) => c.tagName === e?.tagName);
		parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(e) + 1})` : tag);
		e = parent;
	}
	return parts.join(' > ');
};

export const pathOf = (el: Element): string => {
	const root = el.getRootNode();
	const here = localPath(el);
	if (root instanceof ShadowRoot) return `${pathOf(root.host)}${INTO}${here}`;
	const frame = el.ownerDocument.defaultView?.frameElement;
	return frame && el.ownerDocument !== document ? `${pathOf(frame)}${INTO}${here}` : here;
};

export const find = (path: string): Element | null => {
	let scope: Document | ShadowRoot | null = document;
	let el: Element | null = null;
	for (const part of path.split(INTO)) {
		if (!scope) return null;
		try {
			el = scope.querySelector(part);
		} catch {
			return null;
		}
		if (!el) return null;
		scope = el.shadowRoot ?? (el.tagName === 'IFRAME' ? frameDocument(el) : null);
	}
	return el;
};

const boxOf = (el: Element): Box => {
	const r = rectOf(el);
	return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
};

export const spotOf = (el: Element): Spot => ({
	path: pathOf(el),
	html: el.outerHTML.slice(0, MOST_HTML),
	box: boxOf(el),
	text: ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, MOST_TEXT),
});

const ownText = (el: Element): string =>
	Array.from(el.childNodes)
		.filter((n) => n.nodeType === Node.TEXT_NODE)
		.map((n) => n.textContent ?? '')
		.join('')
		.trim();

type Rgba = [number, number, number, number];
const ink = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
const inks = new Map<string, Rgba | null>();
// The canvas turns any color syntax (`oklch()` too) into sRGB; null for what it cannot draw.
const rgbaOf = (value: string): Rgba | null => {
	if (inks.has(value)) return inks.get(value) ?? null;
	let c: Rgba | null = null;
	if (value && value !== 'none') {
		ink.clearRect(0, 0, 1, 1);
		ink.fillStyle = '#010203';
		ink.fillStyle = value;
		// A value the canvas refuses leaves the marker color as it was: not a color it can draw.
		if (ink.fillStyle !== '#010203' || /^#?010203$/i.test(value)) {
			ink.fillRect(0, 0, 1, 1);
			const [r, g, b, a] = Array.from(ink.getImageData(0, 0, 1, 1).data) as [number, number, number, number];
			c = [r, g, b, a / 255];
		}
	}
	inks.set(value, c);
	return c;
};
const over = (top: Rgba, under: Rgba): Rgba => {
	const a = top[3];
	return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
};
// Unrounded, so what decides is never rounded up past a threshold.
const ratio = (a: Rgba, b: Rgba): number => contrastOf(a.slice(0, 3) as unknown as Rgb, b.slice(0, 3) as unknown as Rgb);
const hex = (c: Rgba): string =>
	`#${c
		.slice(0, 3)
		.map((v) => Math.round(v).toString(16).padStart(2, '0'))
		.join('')}`;

/** Null when a picture is behind it; white unless something paints a background. */
const backgroundOf = (el: Element | null): Rgba | null => {
	const layers: Rgba[] = [];
	for (let e = el; e; e = parentOf(e)) {
		const s = getComputedStyle(e);
		if (s.backgroundImage !== 'none') return null;
		const c = rgbaOf(s.backgroundColor);
		if (c && c[3] > 0) layers.push(c);
		if (c && c[3] >= 1) break;
	}
	return layers.reduceRight<Rgba>((under, top) => over(top, under), [255, 255, 255, 1]);
};

export const tabbables = (): Spot[] =>
	all(`${NATIVE_INTERACTIVE}, [tabindex]`)
		.filter((el) => (el as HTMLElement).tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !el.closest('[inert]') && shown(el))
		.map(spotOf);

// An item of a widget reached by arrow keys (a menu's, a list's) is reached that way, so it is not one.
export const pointerOnly = (): Spot[] => {
	const reachable = (el: Element) =>
		(el as HTMLElement).tabIndex >= 0 ||
		el.querySelector(`${NATIVE_INTERACTIVE}, [tabindex]`) !== null ||
		el.closest(NATIVE_INTERACTIVE) !== null ||
		(el.hasAttribute('tabindex') && el.closest(COMPOSITE) !== null);
	const looks = (el: Element) => el.hasAttribute('onclick') || getComputedStyle(el).cursor === 'pointer';
	return all()
		.filter((el) => {
			if (!shown(el) || reachable(el) || !looks(el)) return false;
			const parent = parentOf(el);
			return !(parent && looks(parent));
		})
		.map(spotOf);
};

export const customControls = (): Spot[] =>
	all(ROLE_INTERACTIVE)
		.filter((el) => !el.matches(NATIVE_INTERACTIVE) && shown(el))
		.map(spotOf);

// Not those that send a form: sending is measured on its own.
export const buttons = (): Button[] =>
	all('button, input[type="button"], [role="button"]')
		.filter(
			(el) => shown(el) && !(el as HTMLButtonElement).disabled && !((el as HTMLButtonElement).type === 'submit' && (el as HTMLButtonElement).form),
		)
		.map((el) => ({ ...spotOf(el), discloses: el.hasAttribute('aria-expanded') || el.hasAttribute('aria-controls') }));

export const inputs = (): Field[] =>
	all('select, input, textarea')
		.filter((el) => shown(el) && !(el as HTMLInputElement).disabled)
		.flatMap((el): Field[] => {
			const type = (el as HTMLInputElement).type;
			const kind: Field['kind'] | null =
				el.tagName === 'SELECT' ? 'select' : type === 'checkbox' || type === 'radio' ? 'toggle' : TEXT_TYPES.includes(type) ? 'text' : null;
			return kind ? [{ spot: spotOf(el), kind }] : [];
		});

export const chooseNext = (path: string): boolean => {
	const el = find(path) as HTMLSelectElement | null;
	if (!el || el.options.length < 2) return false;
	el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
	return true;
};

const deepActive = (): Element | null => {
	let el: Element | null = document.activeElement;
	for (;;) {
		const inner: Element | null | undefined = el?.shadowRoot?.activeElement ?? (el?.tagName === 'IFRAME' ? frameDocument(el)?.activeElement : null);
		if (!inner || inner === el || (inner.tagName === 'BODY' && el?.tagName === 'IFRAME')) return el;
		el = inner;
	}
};

export const focus = (path: string): boolean => {
	const el = find(path) as HTMLElement | null;
	el?.focus();
	return el !== null && deepActive() === el;
};

/** Null when focus is on the page itself (it has left the page's content). */
export const focused = (): Stop | null => {
	const el = deepActive();
	if (!el || el === document.body || el === document.documentElement) return null;
	// Under a sticky header or a banner: what is drawn on top at its middle and corners, when that is not it, nor holds it.
	const r = rectOf(el);
	const points: [number, number][] = [
		[r.x + r.width / 2, r.y + r.height / 2],
		[r.x + 2, r.y + 2],
		[r.right - 2, r.y + 2],
		[r.x + 2, r.bottom - 2],
		[r.right - 2, r.bottom - 2],
	];
	const drawnOver = points
		.map(([x, y]) => document.elementFromPoint(x, y))
		.filter((top): top is Element => top !== null && !holds(top, el) && !holds(el, top))
		.map(pathOf);
	return {
		...spotOf(el),
		at: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
		tabindex: (el as HTMLElement).tabIndex,
		native: el.matches(NATIVE_INTERACTIVE),
		role: el.getAttribute('role'),
		modal: el.closest('[aria-modal="true"], dialog:modal') !== null,
		covered: drawnOver.length === points.length ? [...new Set(drawnOver)] : [],
		opaque: el.tagName === 'IFRAME' && frameDocument(el) === null,
	};
};

/** So what is pictured is how focus rests, after a focus ring fading in; at most a second. */
export const focusSettled = async (): Promise<void> => {
	const el = deepActive();
	const moving = el?.getAnimations?.() ?? [];
	await Promise.race([Promise.all(moving.map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 1000))]);
};

export const reveal = (path: string): Spot | null => {
	const el = find(path);
	if (!el) return null;
	el.scrollIntoView({ block: 'center', inline: 'center' });
	return spotOf(el);
};

export const blur = (): void => (deepActive() as HTMLElement | null)?.blur();

export const fakeHeadings = (): Spot[] => {
	const body = parseFloat(getComputedStyle(document.body).fontSize) || 16;
	return all()
		.filter((el) => {
			const text = ownText(el);
			if (!text || text.length > 60 || !shown(el)) return false;
			if (el.closest('h1, h2, h3, h4, h5, h6, [role="heading"], a, button, label, legend, caption, th, summary, [role="button"], [role="link"]'))
				return false;
			const s = getComputedStyle(el);
			return parseFloat(s.fontSize) >= body * 1.2 && Number(s.fontWeight) >= 600 && !s.display.startsWith('inline');
		})
		.map(spotOf);
};

export const headerlessTables = (): Spot[] =>
	all('table')
		.filter((t) => {
			const role = t.getAttribute('role');
			if (role === 'presentation' || role === 'none') return false;
			const rows = (t as HTMLTableElement).rows;
			const wide = Array.from(rows).some((r) => r.cells.length >= 2);
			return rows.length >= 2 && wide && !t.querySelector('th, [scope], [role="columnheader"], [role="rowheader"]') && shown(t);
		})
		.map(spotOf);

export const readingOrder = (): [Spot, Spot][] => {
	const blocks = all().filter((el) => ownText(el) !== '' && shown(el));
	const out: [Spot, Spot][] = [];
	for (let i = 1; i < blocks.length; i++) {
		const [a, b] = [blocks[i - 1] as Element, blocks[i] as Element];
		if (holds(a, b) || holds(b, a)) continue;
		const [ra, rb] = [rectOf(a), rectOf(b)];
		const sameColumn = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 0;
		if (sameColumn && rb.bottom <= ra.top + 1) out.push([spotOf(a), spotOf(b)]);
	}
	return out;
};

/** What a change of orientation must not take away. */
export const shownText = (): number =>
	roots().reduce((n, root) => {
		const shownIn = root instanceof Document ? [root.body] : Array.from(root.children);
		return n + shownIn.reduce((m, el) => m + ((el as HTMLElement | null)?.innerText ?? '').trim().length, 0);
	}, 0);

// Visually hidden text (1px) is left out.
export const clipped = (): Spot[] =>
	all()
		.filter((el) => {
			const s = getComputedStyle(el);
			const hides = (v: string) => v === 'hidden' || v === 'clip';
			if (!hides(s.overflowX) && !hides(s.overflowY)) return false;
			if (!(el as HTMLElement).innerText?.trim() || !shown(el)) return false;
			const r = el.getBoundingClientRect();
			if (r.width <= 1 || r.height <= 1) return false;
			return (hides(s.overflowX) && el.scrollWidth > el.clientWidth + 1) || (hides(s.overflowY) && el.scrollHeight > el.clientHeight + 1);
		})
		.map(spotOf);

export const overflow = (): { width: number; window: number; past: Spot[] } => {
	const w = window.innerWidth;
	const past = all().filter((el) => shown(el) && rectOf(el).right > w + 1);
	const innermost = past.filter((el) => !past.some((other) => other !== el && holds(el, other))).slice(0, 10);
	return { width: document.documentElement.scrollWidth, window: w, past: innermost.map(spotOf) };
};

/** WCAG 1.4.12's spacing, as a person's own style sheet would put it; false takes it off. */
export const textSpacing = (on: boolean): void => {
	const id = 'dsnr-probe-text-spacing';
	for (const root of roots()) {
		const place = root instanceof Document ? root.head : root;
		place?.querySelector(`#${id}`)?.remove();
		if (!on || !place) continue;
		const style = (root instanceof Document ? root : root.ownerDocument).createElement('style');
		style.id = id;
		style.textContent =
			'* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
		place.append(style);
	}
};

// WCAG 2.5.8's measure: a target under 24 by 24 (not a link in a sentence) whose 24px circle reaches another target or circle.
export const smallTargets = (): (Spot & { near: string })[] => {
	const targets = all(`${NATIVE_INTERACTIVE}, ${ROLE_INTERACTIVE}`).filter((el) => {
		if (!shown(el)) return false;
		const inline =
			getComputedStyle(el).display === 'inline' && (el.parentElement?.innerText ?? '').trim().length > (el as HTMLElement).innerText.trim().length;
		return !inline;
	});
	const boxes = targets.map(rectOf);
	const small = boxes.map((r) => r.width < 24 || r.height < 24);
	const middle = (r: DOMRect) => [r.x + r.width / 2, r.y + r.height / 2] as const;
	const reaches = (r: DOMRect, other: DOMRect) => {
		const [cx, cy] = middle(r);
		const dx = Math.max(other.left - cx, 0, cx - other.right);
		const dy = Math.max(other.top - cy, 0, cy - other.bottom);
		return Math.hypot(dx, dy) < 12;
	};
	return targets.flatMap((el, i) => {
		if (!small[i]) return [];
		const r = boxes[i] as DOMRect;
		const j = boxes.findIndex((other, k) => {
			if (k === i || holds(targets[k] as Element, el) || holds(el, targets[k] as Element)) return false;
			if (reaches(r, other)) return true;
			const [ax, ay] = middle(r);
			const [bx, by] = middle(other);
			return small[k] === true && Math.hypot(ax - bx, ay - by) < 24;
		});
		return j < 0 ? [] : [{ ...spotOf(el), near: pathOf(targets[j] as Element) }];
	});
};

/** Marks drawn only by their fill, which forced colors paints over: their paths, to look at again in that mode. */
export const filledMarks = (): string[] =>
	all()
		.filter((el) => {
			if (
				el.childElementCount > 0 ||
				(el.textContent ?? '').trim() !== '' ||
				el.matches('img, svg, canvas, video, input, select, textarea, button') ||
				!shown(el)
			)
				return false;
			const r = el.getBoundingClientRect();
			if (r.width < 4 || r.height < 4 || r.width > 48 || r.height > 48) return false;
			const s = getComputedStyle(el);
			const fill = rgbaOf(s.backgroundColor);
			const behind = backgroundOf(parentOf(el));
			const bordered = ['top', 'right', 'bottom', 'left'].some((side) => parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0);
			return (
				fill !== null &&
				fill[3] > 0 &&
				behind !== null &&
				ratio(over(fill, behind), behind) > 1.1 &&
				!bordered &&
				s.boxShadow === 'none' &&
				s.backgroundImage === 'none'
			);
		})
		.map(pathOf);

export const vanished = (paths: string[]): Spot[] =>
	paths.flatMap((path) => {
		const el = find(path);
		if (!el) return [];
		const fill = rgbaOf(getComputedStyle(el).backgroundColor);
		const behind = backgroundOf(parentOf(el));
		const seen = fill !== null && behind !== null && fill[3] > 0 && ratio(over(fill, behind), behind) > 1.1;
		return seen ? [] : [spotOf(el)];
	});

const paintOf = (el: Element): Rgba[] =>
	[null, '::before', '::after'].flatMap((pseudo) => {
		const s = getComputedStyle(el, pseudo);
		if (pseudo && (s.content === 'none' || s.content === 'normal')) return [];
		const borders = ['top', 'right', 'bottom', 'left'].flatMap((side) => {
			const c = rgbaOf(s.getPropertyValue(`border-${side}-color`));
			const drawn = parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 && s.getPropertyValue(`border-${side}-style`) !== 'none';
			return drawn && c && c[3] > 0 ? [c] : [];
		});
		const fill = rgbaOf(s.backgroundColor);
		return [...borders, ...(fill && fill[3] > 0 ? [fill] : [])];
	});

// Never rounded up to a threshold it is under.
const said = (r: number): number => Math.floor(r * 100) / 100;

// WCAG 1.4.11: a field's edge and an icon a control is drawn with alone, each under 3:1 against what is behind it.
export const faintParts = (): FaintPart[] => {
	const out: FaintPart[] = [];
	for (const el of all(
		'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), select, textarea',
	)) {
		if (!shown(el)) continue;
		// The edge may be drawn by a wrapper about the field's size, or by what is in that.
		const own = el.getBoundingClientRect();
		const frame: Element[] = [el];
		for (let up = parentOf(el), i = 0; up && i < 3; up = parentOf(up), i++) {
			const r = up.getBoundingClientRect();
			if (r.width * r.height > own.width * own.height * 2.5) break;
			frame.push(up);
		}
		const outer = frame[frame.length - 1] as Element;
		const parts = [...frame, ...Array.from(outer.querySelectorAll('*')).slice(0, 20)];
		const behind = backgroundOf(parentOf(outer));
		if (!behind) continue;
		const paints = parts.flatMap(paintOf);
		const best = paints.reduce((most, c) => Math.max(most, ratio(over(c, behind), behind)), 1);
		if (best < 3) {
			const strongest = paints.sort((a, b) => ratio(over(b, behind), behind) - ratio(over(a, behind), behind))[0];
			out.push({ ...spotOf(el), part: 'edge', ratio: said(best), colors: [strongest ? hex(over(strongest, behind)) : 'none', hex(behind)] });
		}
	}
	for (const el of all(`button, a[href], ${ROLE_INTERACTIVE}`)) {
		if ((el as HTMLElement).innerText?.trim() || !shown(el)) continue;
		const shape = el.querySelector('svg path, svg circle, svg rect, svg line, svg polyline, svg polygon, svg use');
		if (!shape) continue;
		const s = getComputedStyle(shape);
		const drawn = rgbaOf(s.fill !== 'none' ? s.fill : s.stroke);
		const behind = backgroundOf(el);
		if (!drawn || !behind) continue;
		const r = ratio(over(drawn, behind), behind);
		if (r < 3) out.push({ ...spotOf(el), part: 'icon', ratio: said(r), colors: [hex(over(drawn, behind)), hex(behind)] });
	}
	return out;
};

export const longAnimations = (): (Spot & { name: string; ms: number | null })[] =>
	[...new Set(roots().flatMap((root) => root.getAnimations()))].flatMap((a) => {
		const timing = a.effect?.getComputedTiming();
		const target = (a.effect as KeyframeEffect | null)?.target;
		if (!timing || !target || a.playState !== 'running') return [];
		const ms = timing.endTime === Infinity ? null : Number(timing.endTime);
		if (ms !== null && ms <= 5000) return [];
		return [{ ...spotOf(target), name: (a as CSSAnimation).animationName ?? a.id ?? '', ms }];
	});

const state: { watch: Watched; shownBefore: WeakSet<Element> | null; lines: Set<string> | null; last: number } = {
	watch: { opened: [], added: [], changes: 0 },
	shownBefore: null,
	lines: null,
	last: 0,
};

/** Must run before the page's own code. Windows the page opens are recorded and not opened. */
export const watch = (): void => {
	const open = window.open;
	window.open = function (url?: string | URL) {
		state.watch.opened.push(String(url ?? ''));
		return null;
	} as typeof open;
	new MutationObserver((records) => {
		state.last = performance.now();
		for (const r of records) {
			state.watch.changes++;
			const inPlace = r.type === 'characterData';
			const nodes = inPlace ? [r.target] : Array.from(r.addedNodes);
			for (const n of nodes) {
				const el = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;
				const text = (n.textContent ?? '').trim().replace(/\s+/g, ' ');
				if (!el || !text) continue;
				state.watch.added.push({
					text: text.slice(0, MOST_TEXT),
					length: text.length,
					live: el.closest(LIVE) !== null,
					dialog: el.closest(DIALOG) !== null,
					interactive:
						el.closest(`${NATIVE_INTERACTIVE}, ${ROLE_INTERACTIVE}`) !== null ||
						el.querySelector(`${NATIVE_INTERACTIVE}, ${ROLE_INTERACTIVE}, h1, h2, h3, h4, h5, h6`) !== null,
					inPlace,
				});
			}
		}
	}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
};

/** `still` and `most` are ms. */
export const quiet = async (still = 150, most = 2000): Promise<void> => {
	const started = performance.now();
	while (performance.now() - started < most) {
		await new Promise((r) => setTimeout(r, 50));
		if (performance.now() - state.last >= still) return;
	}
};

/** Resets what is watched. */
export const watched = (): Watched => {
	const w = state.watch;
	state.watch = { opened: [], added: [], changes: 0 };
	return w;
};

const linesOf = (): string[] =>
	(document.body?.innerText ?? '')
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

export const mark = (): void => {
	state.shownBefore = new WeakSet(all().filter(shown));
	state.lines = new Set(linesOf().slice(0, 400));
};

/** Since `mark`; what `within` holds (what was pointed at itself) is left out. */
export const appeared = (within?: string): Spot[] => {
	const before = state.shownBefore;
	if (!before) return [];
	const own = within ? find(within) : null;
	const fresh = all().filter((el) => shown(el) && !before.has(el) && (el as HTMLElement).innerText?.trim() && !(own && holds(own, el)));
	return fresh.filter((el) => !fresh.some((other) => other !== el && holds(other, el))).map(spotOf);
};

export const becameAnother = (): { dialog: boolean; replaced: boolean } => {
	const lines = state.lines ?? new Set<string>();
	const now = new Set(linesOf());
	const kept = [...lines].filter((l) => now.has(l)).length;
	const before = state.shownBefore;
	const dialog = all(DIALOG).some((d) => shown(d) && (!before || !before.has(d)));
	return { dialog, replaced: lines.size >= 4 && kept < lines.size / 2 };
};

export const stillShown = (path: string): boolean => {
	const el = find(path);
	return el !== null && shown(el);
};

export const forms = (): { path: string; submit: string | null; novalidate: boolean }[] =>
	all('form')
		.filter(shown)
		.map((f) => {
			const submit = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
			return { path: pathOf(f), submit: submit ? pathOf(submit) : null, novalidate: (f as HTMLFormElement).noValidate };
		});

/** Call after the form was sent, with the page marked (`mark`) before it. */
export const errors = (formPath: string): FormErrors => {
	const form = find(formPath) as HTMLFormElement | null;
	if (!form) return { messages: [], unnamed: [], native: false };
	const fields = Array.from(form.querySelectorAll('input, select, textarea')) as HTMLInputElement[];
	const root = form.getRootNode() as Document | ShadowRoot;
	const named = (field: Element): Element[] =>
		['aria-describedby', 'aria-errormessage']
			.flatMap((a) => (field.getAttribute(a) ?? '').split(/\s+/))
			.filter(Boolean)
			.flatMap((id) => {
				const e = root.getElementById?.(id) ?? root.querySelector(`#${CSS.escape(id)}`);
				return e ? [e] : [];
			});
	const tiedTo = fields.flatMap((f) => [...named(f), ...Array.from(f.labels ?? [])]);
	const messages = appeared().map((m) => {
		const el = find(m.path);
		const tied = el !== null && (el.closest(LIVE) !== null || tiedTo.some((t) => holds(t, el) || holds(el, t)));
		return { ...m, tied };
	});
	const unnamed = fields
		.filter((f) => f.getAttribute('aria-invalid') === 'true' && named(f).every((n) => !(n as HTMLElement).innerText?.trim()))
		.map(spotOf);
	const native = !form.noValidate && fields.some((f) => !f.checkValidity());
	return { messages, unnamed, native };
};
