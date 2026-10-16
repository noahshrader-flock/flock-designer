/**
 * The probe's measurements, run in the page being measured (A3 of the accessibility plan): what the browser has laid out
 * and drawn, read from the page itself, so a page built with anything is measured the same way. Each returns plain data;
 * what counts as a fault is decided outside the page (`services/probe`), where it is tested. Added to the page before its
 * own code runs, so what it watches (windows opened, what is added and where) is watched from the start.
 */

import { type Rgb, contrastOf } from '../shared/contrast';
import type { Box, FaintPart, Field, FormErrors, Spot, Stop, Watched } from '../shared/probeData';

const MOST_HTML = 200;
const MOST_TEXT = 80;
/** The most elements any one measure looks at, so a huge page is still read in time. */
const MOST_ELEMENTS = 4000;

const INTERACTIVE_ROLES = [
	'button',
	'link',
	'checkbox',
	'radio',
	'switch',
	'tab',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'slider',
	'spinbutton',
	'combobox',
	'textbox',
	'searchbox',
];
const NATIVE_INTERACTIVE =
	'a[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [contenteditable=""], [contenteditable="true"]';
const ROLE_INTERACTIVE = INTERACTIVE_ROLES.map((r) => `[role="${r}"]`).join(', ');
const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="timer"], [role="marquee"], output';
const DIALOG = '[role="dialog"], [role="alertdialog"], dialog';
const TEXT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'textarea'];

const all = (selector = '*'): Element[] => Array.from(document.body?.querySelectorAll(selector) ?? []).slice(0, MOST_ELEMENTS);

/** Whether it is drawn: laid out with a size, and not hidden by itself or what it is in. */
export const shown = (el: Element): boolean => {
	if (!el.isConnected) return false;
	if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
	const r = el.getBoundingClientRect();
	return r.width > 0 && r.height > 0;
};

/** A selector that finds this element again, from its nearest unique id, or the document's root. */
export const pathOf = (el: Element): string => {
	const parts: string[] = [];
	let e: Element | null = el;
	while (e && e !== document.documentElement) {
		if (e.id && document.querySelectorAll(`#${CSS.escape(e.id)}`).length === 1) {
			parts.unshift(`#${CSS.escape(e.id)}`);
			break;
		}
		const parent: Element | null = e.parentElement;
		const tag = e.tagName.toLowerCase();
		const same = parent ? Array.from(parent.children).filter((c) => c.tagName === e?.tagName) : [];
		parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(e) + 1})` : tag);
		e = parent;
	}
	return parts.join(' > ');
};

const boxOf = (el: Element): Box => {
	const r = el.getBoundingClientRect();
	return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
};

export const spotOf = (el: Element): Spot => ({
	path: pathOf(el),
	html: el.outerHTML.slice(0, MOST_HTML),
	box: boxOf(el),
	text: ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, MOST_TEXT),
});

export const find = (path: string): Element | null => {
	try {
		return document.querySelector(path);
	} catch {
		return null;
	}
};

/** The text an element holds itself, not its children's. */
const ownText = (el: Element): string =>
	Array.from(el.childNodes)
		.filter((n) => n.nodeType === Node.TEXT_NODE)
		.map((n) => n.textContent ?? '')
		.join('')
		.trim();

// Colors, as the browser computes them (`rgb()` and `rgba()`), laid over what is behind them, and their contrast.
type Rgba = [number, number, number, number];
const rgbaOf = (value: string): Rgba | null => {
	const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(value.trim());
	return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
};
const over = (top: Rgba, under: Rgba): Rgba => {
	const a = top[3];
	return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
};
const ratio = (a: Rgba, b: Rgba): number => Math.round(contrastOf(a.slice(0, 3) as unknown as Rgb, b.slice(0, 3) as unknown as Rgb) * 100) / 100;
const hex = (c: Rgba): string =>
	`#${c
		.slice(0, 3)
		.map((v) => Math.round(v).toString(16).padStart(2, '0'))
		.join('')}`;

/** What is painted behind an element, from its own background outwards, on white; null when a picture is behind it. */
const backgroundOf = (el: Element | null): Rgba | null => {
	const layers: Rgba[] = [];
	for (let e = el; e; e = e.parentElement) {
		const s = getComputedStyle(e);
		if (s.backgroundImage !== 'none') return null;
		const c = rgbaOf(s.backgroundColor);
		if (c && c[3] > 0) layers.push(c);
		if (c && c[3] >= 1) break;
	}
	return layers.reduceRight<Rgba>((under, top) => over(top, under), [255, 255, 255, 1]);
};

// What can be reached and operated.

/** What a keyboard reaches by Tab, in the page's order of elements: shown, enabled, not taken out of the order. */
export const tabbables = (): Spot[] =>
	all(`${NATIVE_INTERACTIVE}, [tabindex]`)
		.filter((el) => (el as HTMLElement).tabIndex >= 0 && !(el as HTMLButtonElement).disabled && !el.closest('[inert]') && shown(el))
		.map(spotOf);

/** What looks clickable (the hand pointer, or a click handler written on it) and cannot be reached by Tab: the outermost of each. */
export const pointerOnly = (): Spot[] => {
	const reachable = (el: Element) =>
		(el as HTMLElement).tabIndex >= 0 || el.querySelector(`${NATIVE_INTERACTIVE}, [tabindex]`) !== null || el.closest(NATIVE_INTERACTIVE) !== null;
	return all()
		.filter((el) => {
			if (!shown(el) || reachable(el)) return false;
			const looks = el.hasAttribute('onclick') || getComputedStyle(el).cursor === 'pointer';
			const parent = el.parentElement;
			return looks && !(parent && (parent.hasAttribute('onclick') || getComputedStyle(parent).cursor === 'pointer'));
		})
		.map(spotOf);
};

/** Controls written as something else with a role (`div role="button"`): the ones a key must be taught to operate. */
export const customControls = (): Spot[] =>
	all(ROLE_INTERACTIVE)
		.filter((el) => !el.matches(NATIVE_INTERACTIVE) && shown(el))
		.map(spotOf);

/** Every button, of either kind, that a click may operate: all but those that send a form (sending is measured on its own). */
export const buttons = (): Spot[] =>
	all('button, input[type="button"], [role="button"]')
		.filter(
			(el) => shown(el) && !(el as HTMLButtonElement).disabled && !((el as HTMLButtonElement).type === 'submit' && (el as HTMLButtonElement).form),
		)
		.map(spotOf);

/** Controls whose value a person changes: lists, boxes to tick, fields to type in. */
export const inputs = (): Field[] =>
	all('select, input, textarea')
		.filter((el) => shown(el) && !(el as HTMLInputElement).disabled)
		.flatMap((el): Field[] => {
			const type = (el as HTMLInputElement).type;
			const kind: Field['kind'] | null =
				el.tagName === 'SELECT' ? 'select' : type === 'checkbox' || type === 'radio' ? 'toggle' : TEXT_TYPES.includes(type) ? 'text' : null;
			return kind ? [{ spot: spotOf(el), kind }] : [];
		});

/** Picks a list's next choice, as a person choosing one would, with the events a choice sends. */
export const chooseNext = (path: string): boolean => {
	const el = find(path) as HTMLSelectElement | null;
	if (!el || el.options.length < 2) return false;
	el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
	return true;
};

export const focus = (path: string): boolean => {
	const el = find(path) as HTMLElement | null;
	el?.focus();
	return el !== null && document.activeElement === el;
};

/** The element that has focus, or null when focus is on the page itself (it has left the page's content). */
export const focused = (): Stop | null => {
	const el = document.activeElement;
	if (!el || el === document.body || el === document.documentElement) return null;
	// Under a sticky header or a banner: what is drawn on top at its middle and corners, when that is not it.
	const r = el.getBoundingClientRect();
	const points: [number, number][] = [
		[r.x + r.width / 2, r.y + r.height / 2],
		[r.x + 2, r.y + 2],
		[r.right - 2, r.y + 2],
		[r.x + 2, r.bottom - 2],
		[r.right - 2, r.bottom - 2],
	];
	const drawnOver = points
		.map(([x, y]) => document.elementFromPoint(x, y))
		.filter((top): top is Element => top !== null && top !== el && !el.contains(top) && !top.contains(el))
		.map(pathOf);
	return {
		...spotOf(el),
		at: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
		tabindex: (el as HTMLElement).tabIndex,
		native: el.matches(NATIVE_INTERACTIVE),
		role: el.getAttribute('role'),
		modal: el.closest('[aria-modal="true"], dialog:modal') !== null,
		covered: drawnOver.length === points.length ? [...new Set(drawnOver)] : [],
	};
};

/** Brings an element into the middle of the window, to point at it, and says where it is now; null when it is gone. */
export const reveal = (path: string): Spot | null => {
	const el = find(path);
	if (!el) return null;
	el.scrollIntoView({ block: 'center', inline: 'center' });
	return spotOf(el);
};

export const blur = (): void => (document.activeElement as HTMLElement | null)?.blur();

// Structure.

/** Text drawn as a heading (larger and bolder than the page's text, short, on its own) that is not one. */
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

/** Tables of data (two rows and two columns or more) with no header cell: their rows and columns have no names. */
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

/** Blocks of text read in an order the page does not draw them in: one read after another that is drawn wholly above it, in the same column. */
export const readingOrder = (): [Spot, Spot][] => {
	const blocks = all().filter((el) => ownText(el) !== '' && shown(el));
	const out: [Spot, Spot][] = [];
	for (let i = 1; i < blocks.length; i++) {
		const [a, b] = [blocks[i - 1] as Element, blocks[i] as Element];
		if (a.contains(b) || b.contains(a)) continue;
		const [ra, rb] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
		const sameColumn = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) > 0;
		if (sameColumn && rb.bottom <= ra.top + 1) out.push([spotOf(a), spotOf(b)]);
	}
	return out;
};

/** How much text the page shows: what a change of orientation must not take away. */
export const shownText = (): number => (document.body?.innerText ?? '').trim().length;

// Size, spacing and reflow.

/** Text cut off by its box: a box that hides what overflows it, holding more than it shows. Visually hidden text (1px) is left out. */
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

/** How wide the page is against its window, and what runs past the window's edge (the innermost of each). */
export const overflow = (): { width: number; window: number; past: Spot[] } => {
	const w = window.innerWidth;
	const past = all().filter((el) => shown(el) && el.getBoundingClientRect().right > w + 1);
	const innermost = past.filter((el) => !past.some((other) => other !== el && el.contains(other))).slice(0, 10);
	return { width: document.documentElement.scrollWidth, window: w, past: innermost.map(spotOf) };
};

/** WCAG 1.4.12's spacing, put on every element, as a person's own style sheet would. Called again with false to take it off. */
export const textSpacing = (on: boolean): void => {
	const id = 'dsnr-probe-text-spacing';
	document.getElementById(id)?.remove();
	if (!on) return;
	const style = document.createElement('style');
	style.id = id;
	style.textContent =
		'* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
	document.head.append(style);
};

/**
 * What a pointer is aimed at (anything operable, but a link in a sentence) smaller than 24 by 24, whose 24px circle at its
 * middle reaches another target, or another small one's circle: WCAG 2.5.8's measure.
 */
export const smallTargets = (): (Spot & { near: string })[] => {
	const targets = all(`${NATIVE_INTERACTIVE}, ${ROLE_INTERACTIVE}`).filter((el) => {
		if (!shown(el)) return false;
		const inline =
			getComputedStyle(el).display === 'inline' && (el.parentElement?.innerText ?? '').trim().length > (el as HTMLElement).innerText.trim().length;
		return !inline;
	});
	const boxes = targets.map((el) => el.getBoundingClientRect());
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
			if (k === i || targets[k]?.contains(el) || el.contains(targets[k] as Element)) return false;
			if (reaches(r, other)) return true;
			const [ax, ay] = middle(r);
			const [bx, by] = middle(other);
			return small[k] === true && Math.hypot(ax - bx, ay - by) < 24;
		});
		return j < 0 ? [] : [{ ...spotOf(el), near: pathOf(targets[j] as Element) }];
	});
};

// Color.

/** Marks drawn only by their fill (no text, picture, border or shadow): what forced colors paints over. Their paths, to look at again in that mode. */
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
			const behind = backgroundOf(el.parentElement);
			const bordered = ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0);
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

/** Of those marks, the ones that can no longer be told from what is behind them (in forced colors, when it is on). */
export const vanished = (paths: string[]): Spot[] =>
	paths.flatMap((path) => {
		const el = find(path);
		if (!el) return [];
		const fill = rgbaOf(getComputedStyle(el).backgroundColor);
		const behind = backgroundOf(el.parentElement);
		const seen = fill !== null && behind !== null && fill[3] > 0 && ratio(over(fill, behind), behind) > 1.1;
		return seen ? [] : [spotOf(el)];
	});

/** The colors an element paints its edge with: each border it draws, and its fill, itself and its ::before and ::after. */
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

/**
 * What 1.4.11 measures that is not text: a field's edge (when its fill does not set it apart) and an icon a control is
 * drawn with alone, each against what is behind it, under 3:1.
 */
export const faintParts = (): FaintPart[] => {
	const out: FaintPart[] = [];
	for (const el of all(
		'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), select, textarea',
	)) {
		if (!shown(el)) continue;
		// What draws the field's edge: itself, or the box drawn round it (a wrapper about its size, and what is in that).
		const own = el.getBoundingClientRect();
		const frame: Element[] = [el];
		for (let up = el.parentElement, i = 0; up && i < 3; up = up.parentElement, i++) {
			const r = up.getBoundingClientRect();
			if (r.width * r.height > own.width * own.height * 2.5) break;
			frame.push(up);
		}
		const outer = frame[frame.length - 1] as Element;
		const parts = [...frame, ...Array.from(outer.querySelectorAll('*')).slice(0, 20)];
		const behind = backgroundOf(outer.parentElement);
		if (!behind) continue;
		const best = parts.flatMap(paintOf).reduce((most, c) => Math.max(most, ratio(over(c, behind), behind)), 1);
		if (best < 3) {
			const shownColor = parts.flatMap(paintOf).sort((a, b) => ratio(over(b, behind), behind) - ratio(over(a, behind), behind))[0];
			out.push({ ...spotOf(el), part: 'edge', ratio: best, colors: [shownColor ? hex(over(shownColor, behind)) : 'none', hex(behind)] });
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
		if (r < 3) out.push({ ...spotOf(el), part: 'icon', ratio: r, colors: [hex(over(drawn, behind)), hex(behind)] });
	}
	return out;
};

// Motion.

/** Animations that play by themselves for more than five seconds (or for ever), and what each moves. */
export const longAnimations = (): (Spot & { name: string; ms: number | null })[] =>
	document.getAnimations().flatMap((a) => {
		const timing = a.effect?.getComputedTiming();
		const target = (a.effect as KeyframeEffect | null)?.target;
		if (!timing || !target || a.playState !== 'running') return [];
		const ms = timing.endTime === Infinity ? null : Number(timing.endTime);
		if (ms !== null && ms <= 5000) return [];
		return [{ ...spotOf(target), name: (a as CSSAnimation).animationName ?? a.id ?? '', ms }];
	});

// Watching: what is added, windows opened, and whether the page became another.

const state: { watch: Watched; shownBefore: WeakSet<Element> | null; lines: Set<string> | null } = {
	watch: { opened: [], added: [], changes: 0 },
	shownBefore: null,
	lines: null,
};

/** Starts watching, before the page's own code runs: windows it opens, and every change, with where each addition is. */
export const watch = (): void => {
	const open = window.open;
	window.open = function (url?: string | URL) {
		state.watch.opened.push(String(url ?? ''));
		return null;
	} as typeof open;
	new MutationObserver((records) => {
		for (const r of records) {
			state.watch.changes++;
			const nodes = r.type === 'characterData' ? [r.target] : Array.from(r.addedNodes);
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
				});
			}
		}
	}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
};

/** What was watched since the last time it was taken, and starts again. */
export const watched = (): Watched => {
	const w = state.watch;
	state.watch = { opened: [], added: [], changes: 0 };
	return w;
};

/** Notes the page as it is: what is shown, and its lines of text, to tell later what appeared and whether it became another page. */
export const mark = (): void => {
	state.shownBefore = new WeakSet(all().filter(shown));
	state.lines = new Set(
		(document.body?.innerText ?? '')
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
			.slice(0, 400),
	);
};

/** What is shown now that was not when marked: the outermost of each, with text. */
export const appeared = (): Spot[] => {
	const before = state.shownBefore;
	if (!before) return [];
	const fresh = all().filter((el) => shown(el) && !before.has(el) && (el as HTMLElement).innerText?.trim());
	return fresh.filter((el) => !fresh.some((other) => other !== el && other.contains(el))).map(spotOf);
};

/** Whether the page became another since it was marked: a dialog opened, or most of its text gone. */
export const becameAnother = (): { dialog: boolean; replaced: boolean } => {
	const lines = state.lines ?? new Set<string>();
	const now = new Set(
		(document.body?.innerText ?? '')
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean),
	);
	const kept = [...lines].filter((l) => now.has(l)).length;
	const before = state.shownBefore;
	const dialog = all(DIALOG).some((d) => shown(d) && (!before || !before.has(d)));
	return { dialog, replaced: lines.size >= 4 && kept < lines.size / 2 };
};

export const stillShown = (path: string): boolean => {
	const el = find(path);
	return el !== null && shown(el);
};

// Forms and their errors.

/** Each form: where it is, its button that sends it, and whether it leaves checking to its own code. */
export const forms = (): { path: string; submit: string | null; novalidate: boolean }[] =>
	all('form')
		.filter(shown)
		.map((f) => {
			const submit = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
			return { path: pathOf(f), submit: submit ? pathOf(submit) : null, novalidate: (f as HTMLFormElement).noValidate };
		});

/**
 * After a form was sent: each message that appeared and whether a field names it (`aria-describedby`, `aria-errormessage`,
 * in its label) or a live region announces it; and each field marked invalid that names no message.
 */
export const errors = (formPath: string): FormErrors => {
	const form = find(formPath) as HTMLFormElement | null;
	if (!form) return { messages: [], unnamed: [], native: false };
	const fields = Array.from(form.querySelectorAll('input, select, textarea')) as HTMLInputElement[];
	const named = (field: Element): Element[] =>
		['aria-describedby', 'aria-errormessage']
			.flatMap((a) => (field.getAttribute(a) ?? '').split(/\s+/))
			.filter(Boolean)
			.flatMap((id) => {
				const e = document.getElementById(id);
				return e ? [e] : [];
			});
	const tiedTo = fields.flatMap((f) => [...named(f), ...Array.from(f.labels ?? [])]);
	const messages = appeared().map((m) => {
		const el = find(m.path);
		const tied = el !== null && (el.closest(LIVE) !== null || tiedTo.some((t) => t === el || t.contains(el) || el.contains(t)));
		return { ...m, tied };
	});
	const unnamed = fields
		.filter((f) => f.getAttribute('aria-invalid') === 'true' && named(f).every((n) => !(n as HTMLElement).innerText?.trim()))
		.map(spotOf);
	const native = !form.noValidate && fields.some((f) => !f.checkValidity());
	return { messages, unnamed, native };
};
