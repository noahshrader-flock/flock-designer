import { PREVIEW_COMPONENT, PREVIEW_SHOW } from '../shared/catalog';
import { runAxe } from './axe';
import { borderColor, findInstances, readValues } from './instances';

export interface DrawAsk {
	file: string;
	picture: boolean;
	vary: unknown;
	tags: string[] | null;
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
 * Must never stop the rest of the drawing being read: a failure is kept in `instancesFailed`. Stories that threw are counted
 * so no instances because of them is not taken for none drawn at all.
 */
const instancesIn = (drawn: Read): void => {
	try {
		const of = (window as unknown as Record<string, { component: unknown; controls?: string[] } | undefined>)[PREVIEW_COMPONENT];
		drawn.component = Boolean(of);
		drawn.instances = [];
		drawn.wrapping = 0;
		drawn.controls = of?.controls ?? [];
		drawn.storiesFailed = document.querySelectorAll('[data-story] .fd-error').length;
		if (of) {
			const { instances, wrapping, reached } = findInstances(of.component);
			drawn.wrapping = wrapping;
			for (const { story, key, props, el } of instances) drawn.instances.push({ story, key, props, values: readValues(el) });
			// Elements drawn but none in React's record: a React that keeps it another way. Said as that, not as stories that draw none.
			if (!reached && document.querySelector('[data-story] *'))
				throw new Error("React's record of what it drew could not be read, so its instances cannot be found.");
		}
	} catch (error) {
		drawn.instances = [];
		drawn.instancesFailed = String((error as Error)?.message ?? error);
	}
};

// axe must run before anything is hidden for a picture, since axe passes over what is hidden.
export const readDrawn = async ({ file, picture, vary, tags, waitMs }: DrawAsk): Promise<Read> => {
	const page = window as unknown as Record<string, ((file: string, vary: unknown) => Promise<void>) | undefined> & { axe?: unknown };
	const until = Date.now() + waitMs;
	while (typeof page[PREVIEW_SHOW] !== 'function' && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
	await (page[PREVIEW_SHOW] as (file: string, vary: unknown) => Promise<void>)(file, vary);
	await document.fonts.ready;
	// Finished, so what a drawing reads does not depend on the moment it is read in; an endless one (a spinner) throws and is
	// cancelled. Asking for them brings styles up to date: a page no one sees may never be given a frame to wait for.
	for (const a of document.getAnimations()) {
		try {
			a.finish();
		} catch {
			a.cancel();
		}
	}
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
	if (tags) drawn.accessibility = page.axe ? await runAxe({ include: [['#root']], exclude: [['.fd-name']] }, tags) : null;
	if (!picture) return drawn;
	// Hidden, not removed, so nothing moves. No wait after: a screenshot is of the next frame the browser paints.
	const first = document.querySelector('[data-story]');
	for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-story]'))) if (el !== first) el.style.visibility = 'hidden';
	const name = first?.querySelector<HTMLElement>('.fd-name');
	if (name) name.style.visibility = 'hidden';
	return drawn;
};
