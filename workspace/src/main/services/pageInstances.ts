/**
 * A component's instances in a preview page, found one way for every reader (adjusting a component, DESIGN_SYSTEM_PLAN.md):
 * the drawing that measures them (`storyDrawing.ts`, Phase 1) and the preview page that tries a value on them (Phase 2), so
 * an instance measured is the instance a value is tried on. Each is page code, as source, run in the page.
 */
import { PREVIEW_COMPONENT, PREVIEW_TRY } from '../../shared/catalog';
import { CSS_OF } from '../../shared/valueParts';

/**
 * The instances of `component` the page's stories draw, in the page's order: found in what React drew by identity, since a
 * build's names are minified. Each instance's top element is the first element on the page inside it that takes up room,
 * found going up from each element, never down, since an element may be held by either of the two copies React keeps of
 * what it drew, and a copy's children can be stale. Each has the props it was drawn with that say which variant it is (a
 * string, a number or a true or false, not its content, its handlers, its styling or what it is for assistive technology),
 * and a `key` that names it in any drawing of the same file: its story, those props, and which of the story's instances with
 * them it is, so the narrower page a tab shows, where another instance may take no room, still names the same one.
 *
 * An instance whose top element is part of what it was given (a tooltip around a button) draws nothing of its own there,
 * so is counted apart (`wrapping`), never taken for the content. `reached` is whether any element was known to React's
 * record of what it drew (its `__reactFiber` key on each element): a React that keeps it another way finds nothing.
 */
export const FIND_INSTANCES = `(component) => {
	const fiberOf = (el) => { const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$')); return k ? el[k] : null; };
	const isIt = (f) => f.type === component || f.elementType === component;
	const notVariant = /^(children|className|style|sx|css|id|key|ref|role|tabIndex|href|src|alt|title|name|value|defaultValue|placeholder|label|as|component|slot|form|htmlFor|type)$|^(on[A-Z]|aria-|data-)/;
	// What an instance was given to draw, as React elements: its children, however nested.
	const given = (f) => {
		const out = [];
		const walk = (c) => (Array.isArray(c) ? c.forEach(walk) : c && typeof c === 'object' && c.$$typeof ? out.push(c) : null);
		walk(f.memoizedProps?.children);
		return out;
	};
	// Whether an element is part of what the instance was given: on the way up to it, one of the given elements (by its
	// props, or by its component when it was copied with more props, as a tooltip does with what it wraps).
	const isGiven = (el, f) => {
		const elements = given(f);
		if (elements.length === 0) return false;
		const props = new Set(elements.map((e) => e.props));
		const types = new Set(elements.filter((e) => typeof e.type !== 'string').map((e) => e.type));
		for (let g = fiberOf(el); g && g !== f && g !== f.alternate; g = g.return) {
			if (props.has(g.memoizedProps) || (typeof g.type !== 'string' && types.has(g.type))) return true;
		}
		return false;
	};
	const instances = [];
	const counted = new Map();
	const seen = new Set();
	let wrapping = 0;
	let reached = false;
	for (const story of document.querySelectorAll('[data-story]')) {
		const name = story.getAttribute('data-story') ?? '';
		for (const el of story.querySelectorAll('*')) {
			const own = fiberOf(el);
			if (own) reached = true;
			for (let f = own; f; f = f.return) {
				// Above an instance already met, every other instance is one met before it, in the page's order.
				if (seen.has(f)) break;
				if (!isIt(f)) continue;
				// An element with no room (a hidden input, a wrapper drawn as its contents) is not where the instance draws: the
				// instance is met again at its next element, and its first that takes up room is its top.
				const box = el.getBoundingClientRect();
				if (box.width === 0 || box.height === 0) continue;
				seen.add(f);
				if (f.alternate) seen.add(f.alternate);
				if (isGiven(el, f)) {
					wrapping++;
					continue;
				}
				const props = {};
				for (const [k, v] of Object.entries(f.memoizedProps ?? {})) {
					if (notVariant.test(k) || !['string', 'number', 'boolean'].includes(typeof v) || String(v).length > 32) continue;
					props[k] = String(v);
				}
				const named = name + '\\u0000' + JSON.stringify(props);
				const n = (counted.get(named) ?? 0) + 1;
				counted.set(named, n);
				instances.push({ story: name, key: named + '\\u0000' + n, props, el });
			}
		}
	}
	return { instances, wrapping, reached };
}`;

/**
 * An instance's values, from its top element, as the browser computes them (Phase 1): its height, the box it takes up, and
 * each other property from its longhands (`CSS_OF`), its parts in full, a border's colour only where it has a border.
 */
export const READ_VALUES = `(el) => {
	const s = getComputedStyle(el);
	const values = { height: +el.getBoundingClientRect().height.toFixed(2) + 'px' };
	for (const [property, { names, parts }] of Object.entries(${JSON.stringify(CSS_OF)})) {
		if (property === 'border' && !(parseFloat(s.borderTopWidth) > 0)) continue;
		values[property] = (parts === 1 ? names.slice(0, 1) : names).map((name) => s.getPropertyValue(name)).join(' ');
	}
	return values;
}`;

/**
 * Values tried on a component's instances in the preview page (Phase 2), said to it by the tab that frames it: each a
 * property, a value, and the instances it is for, by their keys (`FIND_INSTANCES`). Set on each instance's top element over
 * whatever its styles say, and taken off before the next are set, so the page is always the library's own plus what is being
 * tried, and never the last try's leftovers. Set again whenever the stories draw anew (a story that redraws itself, or the
 * file drawn in place of another), since the elements may then be new ones. Heard from the frame's parent alone.
 *
 * A height is set as the height the element must be given, in its own way of sizing, to take up the height tried; any other
 * on its longhands (`CSS_OF`), from its parts in full, one on each, or a value of one part on every one.
 */
export const TRY_VALUES = `(() => {
	const find = ${FIND_INSTANCES};
	const root = () => document.getElementById('root');
	let tried = [];
	let undo = [];
	const set = (el, property, value) => {
		undo.push([el, property, el.style.getPropertyValue(property), el.style.getPropertyPriority(property)]);
		el.style.setProperty(property, value, 'important');
	};
	const css = ${JSON.stringify(CSS_OF)};
	const write = (el, property, value) => {
		if (property === 'height') {
			const h = parseFloat(getComputedStyle(el).height) + (parseFloat(value) - el.getBoundingClientRect().height);
			for (const p of ['height', 'min-height', 'max-height']) set(el, p, h + 'px');
			return;
		}
		const of = css[property];
		if (!of) return;
		const parts = of.parts === 1 ? null : value.split(' ');
		// A value of several parts comes with every part, one for each longhand; one that does not is not set at all.
		if (parts && parts.length !== of.names.length) return;
		of.names.forEach((name, i) => set(el, name, parts ? parts[i] : value));
	};
	// Once a frame however many changes come at once: what the stories draw, never the styles set here.
	let pending = false;
	const observer = new MutationObserver(() => {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => ((pending = false), apply()));
	});
	function apply() {
		observer.disconnect();
		for (const [el, property, value, priority] of undo.reverse()) value ? el.style.setProperty(property, value, priority) : el.style.removeProperty(property);
		undo = [];
		const of = window[${JSON.stringify(PREVIEW_COMPONENT)}];
		if (of && tried.length > 0) {
			const byKey = new Map(find(of.component).instances.map((i) => [i.key, i.el]));
			for (const { property, value, targets } of tried) for (const key of targets) { const el = byKey.get(key); if (el) write(el, property, value); }
		}
		if (root()) observer.observe(root(), { childList: true, subtree: true });
	}
	addEventListener('message', (e) => {
		if (e.source !== parent) return;
		const asked = e.data?.[${JSON.stringify(PREVIEW_TRY)}];
		if (!Array.isArray(asked)) return;
		tried = asked;
		apply();
	});
	if (root()) observer.observe(root(), { childList: true, subtree: true });
})();`;
