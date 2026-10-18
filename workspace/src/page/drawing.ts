/**
 * What a story file draws, read in its preview page (T6 of the design system plan), as the headless browser asks for it
 * (`core/services/designSystem/storyDrawing.ts`, which bundles this into the script it runs). Page code, typed like the rest.
 */
import { PREVIEW_COMPONENT, PREVIEW_SHOW } from '../shared/catalog';
import { runAxe } from './axe';
import { borderColor, findInstances, readValues } from './instances';

/** What the drawing is asked to read: the file, whether a picture is taken, a story drawn once per value (Phase 5), axe's tags. */
export interface DrawAsk {
	file: string;
	picture: boolean;
	vary: unknown;
	tags: string[] | null;
	/** How long the page is waited for to be ready to draw. */
	waitMs: number;
}

type Count = Record<string, number>;
interface Read {
	colors: Count;
	radii: Count;
	spacing: Count;
	rootPx: number;
	component?: boolean;
	instances?: { story: string; key: string; props: Record<string, string>; values: Record<string, string> }[];
	wrapping?: number;
	controls?: string[];
	storiesFailed?: number;
	instancesFailed?: string;
	accessibility?: unknown;
}

/**
 * Each instance of the component a story file is of (Phase 1 of adjusting a component), read in the page: found as every
 * reader finds them (`findInstances`), and its top element's values as the browser computes them (`readValues`), with the
 * props it was drawn with and its key.
 *
 * Those that only wrap what they were given are counted (`wrapping`); the stories that threw are counted (`storiesFailed`),
 * so none drawn because of them is not taken for none drawn at all; and a React whose record of what it drew cannot be read
 * is said as that, never as stories that draw none. **Nothing here can stop the rest of the drawing being read:** a failure
 * is kept as what it said (`instancesFailed`).
 */
const instancesIn = (drawn: Read): void => {
	try {
		const of = (window as unknown as Record<string, { component: unknown; controls?: string[] } | undefined>)[PREVIEW_COMPONENT];
		drawn.component = Boolean(of);
		drawn.instances = [];
		drawn.wrapping = 0;
		drawn.controls = of?.controls ?? [];
		// Stories that threw, said in their place by the page: they draw no instance, for a reason they say themselves.
		drawn.storiesFailed = document.querySelectorAll('[data-story] .fd-error').length;
		if (of) {
			const { instances, wrapping, reached } = findInstances(of.component);
			drawn.wrapping = wrapping;
			for (const { story, key, props, el } of instances) drawn.instances.push({ story, key, props, values: readValues(el) });
			// Elements drawn and not one known to React's record of what it drew: a React that keeps it another way, whose
			// instances cannot be found. Said as that, not as stories that draw none.
			if (!reached && document.querySelector('[data-story] *'))
				throw new Error("React's record of what it drew could not be read, so its instances cannot be found.");
		}
	} catch (error) {
		drawn.instances = [];
		drawn.instancesFailed = String((error as Error)?.message ?? error);
	}
};

/**
 * What a story file draws, read once it has drawn: the page draws the file in place of the last (`PREVIEW_SHOW`), so the
 * page is loaded once for many. Then its fonts settle and what animates is held still, and its stories' elements that take
 * up room are read: each one's background, text and border colors, its radius, and its padding, margins and gaps, counted by
 * computed value. With `tags`, axe (in the page already) checks the stories' accessibility at them (T7), before anything is
 * hidden for a picture, since axe passes over what is hidden.
 *
 * **And each instance of the component the stories are of** (`instancesIn`), with its values and the props it was drawn
 * with, in light and in dark: a value is a token's in a mode when the tags show through in it.
 */
export const readDrawn = async ({ file, picture, vary, tags, waitMs }: DrawAsk): Promise<Read> => {
	const page = window as unknown as Record<string, ((file: string, vary: unknown) => Promise<void>) | undefined> & { axe?: unknown };
	const until = Date.now() + waitMs;
	while (typeof page[PREVIEW_SHOW] !== 'function' && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
	await (page[PREVIEW_SHOW] as (file: string, vary: unknown) => Promise<void>)(file, vary);
	await document.fonts.ready;
	// Held still, so a story draws the same each time it is drawn: what animates in or moves to a place is put at its end,
	// and what turns for ever (a spinner) is stopped, at rest. Else what a drawing reads depends on the moment it is read in.
	// Asking for them brings the page's styles up to date first; a page no one sees may never be given a frame to wait for.
	for (const a of document.getAnimations()) {
		try {
			a.finish();
		} catch {
			a.cancel();
		}
	}
	// And the page's root font size, which a rem is of (16px, unless the library sets another).
	const drawn: Read = { colors: {}, radii: {}, spacing: {}, rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 };
	const add = (m: Count, k: string | null) => {
		if (k) m[k] = (m[k] || 0) + 1;
	};
	for (const el of Array.from(document.querySelectorAll('#root *'))) {
		const box = el.getBoundingClientRect();
		if (box.width === 0 || box.height === 0) continue;
		const s = getComputedStyle(el);
		add(drawn.colors, s.backgroundColor);
		add(drawn.colors, s.color);
		add(drawn.colors, borderColor(s));
		add(drawn.radii, s.borderTopLeftRadius);
		for (const k of ['paddingTop', 'paddingLeft', 'marginTop', 'marginLeft', 'rowGap', 'columnGap'] as const) add(drawn.spacing, s[k]);
	}
	instancesIn(drawn);
	// The stories only: not the page they are drawn on, nor the names it gives them.
	if (tags) drawn.accessibility = page.axe ? await runAxe({ include: [['#root']], exclude: [['.fd-name']] }, tags) : null;
	if (!picture) return drawn;
	// A picture (P5): the first story alone, at the top of the page, which is white. Everything else is hidden first (hidden,
	// so nothing moves), or a short story would have the next one, and its own name, in its picture. No wait after: a
	// screenshot is of the next frame the browser paints, which has this in it (every one of Flock's pictures was the same
	// taken at once as after a wait, but for what animates).
	const first = document.querySelector('[data-story]');
	for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-story]'))) if (el !== first) el.style.visibility = 'hidden';
	const name = first?.querySelector<HTMLElement>('.fd-name');
	if (name) name.style.visibility = 'hidden';
	return drawn;
};
