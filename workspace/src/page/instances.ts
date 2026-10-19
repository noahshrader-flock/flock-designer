// Instances are found one way for the drawing that measures them and the preview that tries a value on them, so an instance
// measured is the instance a value is tried on.
import { PREVIEW_COMPONENT, PREVIEW_TRY } from '../shared/catalog';
import { CSS_OF, NOT_VARIANT } from '../shared/valueParts';

interface Fiber {
	type: unknown;
	elementType: unknown;
	memoizedProps: Record<string, unknown> | null;
	return: Fiber | null;
	/** The other of the two copies React keeps of it, if any. */
	alternate: Fiber | null;
	/** At the root, its root, which holds the copy that is current. */
	stateNode: { current?: unknown } | null;
}

interface GivenElement {
	$$typeof: symbol;
	type: unknown;
	props: unknown;
}

export interface Found {
	story: string;
	key: string;
	props: Record<string, string>;
	el: Element;
}

const fiberOf = (el: Element): Fiber | null => {
	const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
	return k ? ((el as unknown as Record<string, Fiber | undefined>)[k] ?? null) : null;
};

/**
 * Matched by identity (a build's names are minified), walking up from each element, as a copy's children can be stale.
 * `key` names the same one in any drawing of the file; one that only wraps what it was given is counted in `wrapping`;
 * `reached` is whether any element had a React fiber.
 */
export const findInstances = (component: unknown): { instances: Found[]; wrapping: number; reached: boolean } => {
	const isIt = (f: Fiber) => f.type === component || f.elementType === component;
	// An element can be reached through React's stale copy, whose props are what it drew before (a tab no longer selected).
	const current = (f: Fiber): Fiber => {
		let top = f;
		while (top.return) top = top.return;
		return top.stateNode?.current === top || !f.alternate ? f : f.alternate;
	};
	const given = (f: Fiber): GivenElement[] => {
		const out: GivenElement[] = [];
		const walk = (c: unknown): void => {
			if (Array.isArray(c)) c.forEach(walk);
			else if (c && typeof c === 'object' && '$$typeof' in c) out.push(c as GivenElement);
		};
		walk(f.memoizedProps?.children);
		return out;
	};
	// Matched by component too, for an element copied with more props, as a tooltip does with what it wraps.
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
				// An element with no room (a hidden input, a wrapper drawn as its contents) is skipped: the instance's first
				// element that takes up room is its top.
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

// The first side that has a border, as an underline is a border at the bottom only. One rule for every script that reads a border.
export const borderColor = (s: CSSStyleDeclaration): string | null => {
	const side = ['top', 'right', 'bottom', 'left'].find((at) => parseFloat(s.getPropertyValue(`border-${at}-width`)) > 0);
	return side ? s.getPropertyValue(`border-${side}-color`) : null;
};

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
 * Each try is undone before the next is set, and set again whenever the stories redraw, since the elements may be new. A
 * height tried is the box the element takes up, not its CSS height.
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
	// Classes, as a tab selected changes which variant an instance is; never style, as the values set here are inline.
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
