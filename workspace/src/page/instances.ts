/**
 * A component's instances in a preview page, found one way for every reader (adjusting a component, DESIGN_SYSTEM.md): the
 * drawing that measures them (`storyDrawing.ts`, Phase 1) and the preview page that tries a value on them (Phase 2), so an
 * instance measured is the instance a value is tried on. Page code, typed, bundled into the scripts that run it
 * (`core/services/designSystem/pageInstances.ts`). What React keeps of what it drew is its own, so it is read here as it is, untyped.
 */
import { PREVIEW_COMPONENT, PREVIEW_TRY } from '../shared/catalog';
import { CSS_OF, NOT_VARIANT } from '../shared/valueParts';

/** One of React's fibers: its internals, read as they are. */
type Fiber = any;

/** One instance as the readers know it: its story, the props that say its variant, the key that names it, its top element. */
export interface Found {
	story: string;
	key: string;
	props: Record<string, string>;
	el: Element;
}

const fiberOf = (el: Element): Fiber | null => {
	const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
	return k ? (el as unknown as Record<string, Fiber>)[k] : null;
};

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
export const findInstances = (component: unknown): { instances: Found[]; wrapping: number; reached: boolean } => {
	const isIt = (f: Fiber) => f.type === component || f.elementType === component;
	// Of the two copies React keeps of what it drew, the one its root holds now: an element can be reached through the other,
	// whose props are what it drew before (a tab no longer selected). A copy is the root's when its way up ends at the root
	// fiber its root says is current.
	const current = (f: Fiber): Fiber => {
		let top = f;
		while (top.return) top = top.return;
		return top.stateNode?.current === top || !f.alternate ? f : f.alternate;
	};
	// What an instance was given to draw, as React elements: its children, however nested.
	const given = (f: Fiber): Fiber[] => {
		const out: Fiber[] = [];
		const walk = (c: unknown): void => {
			if (Array.isArray(c)) c.forEach(walk);
			else if (c && typeof c === 'object' && (c as Fiber).$$typeof) out.push(c);
		};
		walk(f.memoizedProps?.children);
		return out;
	};
	// Whether an element is part of what the instance was given: on the way up to it, one of the given elements (by its
	// props, or by its component when it was copied with more props, as a tooltip does with what it wraps).
	const isGiven = (el: Element, f: Fiber): boolean => {
		const elements = given(f);
		if (elements.length === 0) return false;
		const props = new Set(elements.map((e) => e.props));
		const types = new Set(elements.filter((e) => typeof e.type !== 'string').map((e) => e.type));
		for (let g = fiberOf(el); g && g !== f && g !== f.alternate; g = g.return) {
			if (props.has(g.memoizedProps) || (typeof g.type !== 'string' && types.has(g.type))) return true;
		}
		return false;
	};
	const instances: Found[] = [];
	const counted = new Map<string, number>();
	const seen = new Set<Fiber>();
	let wrapping = 0;
	let reached = false;
	for (const story of Array.from(document.querySelectorAll('[data-story]'))) {
		const name = story.getAttribute('data-story') ?? '';
		for (const el of Array.from(story.querySelectorAll('*'))) {
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
				const props: Record<string, string> = {};
				for (const [k, v] of Object.entries(current(f).memoizedProps ?? {})) {
					if (NOT_VARIANT.test(k) || !['string', 'number', 'boolean'].includes(typeof v) || String(v).length > 32) continue;
					props[k] = String(v);
				}
				const named = `${name}\u0000${JSON.stringify(props)}`;
				const n = (counted.get(named) ?? 0) + 1;
				counted.set(named, n);
				instances.push({ story: name, key: `${named}\u0000${n}`, props, el });
			}
		}
	}
	return { instances, wrapping, reached };
};

/**
 * An element's border colour, from its computed style, as the page reads it: the first side that has a border (an
 * underline is a border at the bottom only); null for one with none. One rule for every script that reads a border.
 */
export const borderColor = (s: CSSStyleDeclaration): string | null => {
	const side = ['top', 'right', 'bottom', 'left'].find((at) => parseFloat(s.getPropertyValue(`border-${at}-width`)) > 0);
	return side ? s.getPropertyValue(`border-${side}-color`) : null;
};

/**
 * An instance's values, from its top element, as the browser computes them (Phase 1): its height, the box it takes up, and
 * each other property from its longhands (`CSS_OF`), its parts in full, a border's colour only where it has a border.
 */
export const readValues = (el: Element): Record<string, string> => {
	const s = getComputedStyle(el);
	const values: Record<string, string> = { height: `${+el.getBoundingClientRect().height.toFixed(2)}px` };
	for (const [property, { names, parts }] of Object.entries(CSS_OF)) {
		if (property === 'border') {
			const color = borderColor(s);
			if (color !== null) values.border = color;
			continue;
		}
		values[property] = (parts === 1 ? names.slice(0, 1) : names).map((name) => s.getPropertyValue(name)).join(' ');
	}
	return values;
};

type Tried = { property: string; value: string; targets: string[] };

/**
 * Values tried on a component's instances in the preview page (Phase 2), said to it by the tab that frames it: each a
 * property, a value, and the instances it is for, by their keys (`findInstances`). Set on each instance's top element over
 * whatever its styles say, and taken off before the next are set, so the page is always the library's own plus what is being
 * tried, and never the last try's leftovers. Set again whenever the stories draw anew (a story that redraws itself, or the
 * file drawn in place of another), since the elements may then be new ones. Heard from the frame's parent alone.
 *
 * A height is set as the height the element must be given, in its own way of sizing, to take up the height tried; any other
 * on its longhands (`CSS_OF`), from its parts in full, one on each, or a value of one part on every one.
 */
export const tryValues = (): void => {
	const root = () => document.getElementById('root');
	let tried: Tried[] = [];
	let undo: [HTMLElement, string, string, string][] = [];
	const set = (el: HTMLElement, property: string, value: string) => {
		undo.push([el, property, el.style.getPropertyValue(property), el.style.getPropertyPriority(property)]);
		el.style.setProperty(property, value, 'important');
	};
	const write = (el: HTMLElement, property: string, value: string) => {
		if (property === 'height') {
			const h = parseFloat(getComputedStyle(el).height) + (parseFloat(value) - el.getBoundingClientRect().height);
			for (const p of ['height', 'min-height', 'max-height']) set(el, p, `${h}px`);
			return;
		}
		const of = (CSS_OF as Record<string, { names: readonly string[]; parts: number }>)[property];
		if (!of) return;
		const parts = of.parts === 1 ? null : value.split(' ');
		// A value of several parts comes with every part, one for each longhand; one that does not is not set at all.
		if (parts && parts.length !== of.names.length) return;
		of.names.forEach((name, i) => set(el, name, parts ? (parts[i] as string) : value));
	};
	// Once a frame however many changes come at once: what the stories draw (an element added, or its class changed, as a tab
	// selected changes which variant an instance is), never the styles set here, which are inline.
	const WATCHED = { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] };
	let pending = false;
	const observer = new MutationObserver(() => {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => ((pending = false), apply()));
	});
	function apply() {
		observer.disconnect();
		for (const [el, property, value, priority] of undo.reverse())
			value ? el.style.setProperty(property, value, priority) : el.style.removeProperty(property);
		undo = [];
		const of = (window as unknown as Record<string, { component: unknown } | undefined>)[PREVIEW_COMPONENT];
		if (of && tried.length > 0) {
			const byKey = new Map(findInstances(of.component).instances.map((i) => [i.key, i.el as HTMLElement]));
			for (const { property, value, targets } of tried)
				for (const key of targets) {
					const el = byKey.get(key);
					if (el) write(el, property, value);
				}
		}
		const r = root();
		if (r) observer.observe(r, WATCHED);
	}
	addEventListener('message', (e) => {
		if (e.source !== parent) return;
		const asked = (e.data as Record<string, unknown> | null)?.[PREVIEW_TRY];
		if (!Array.isArray(asked)) return;
		tried = asked as Tried[];
		apply();
	});
	const r = root();
	if (r) observer.observe(r, WATCHED);
};
