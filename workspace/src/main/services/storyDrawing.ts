/**
 * How a story file is drawn to read what it draws (T6 of the design system plan), whichever shell draws it: the app's
 * hidden windows (`storyMeasure.ts`) or a headless browser (`chromeHeadless.ts`). The script the page runs, the size it is
 * drawn at, and how long a story may take; and how a run's files are shared between a few pages and put back in order.
 */
import { PREVIEW_COMPONENT, PREVIEW_SHOW } from '../../shared/catalog';
import { axeFound, axeRun } from './accessibilityCheck';
import type { Drawn, Measure, Mode } from './componentTokens';
import { within } from './within';

/**
 * How many runs are drawn at once, how many pages draw each run's files at once, how long one story may take, and each
 * page's size. Two runs at once, each in three pages, drew Flock's library as fast as all four at once (about 21 s for the
 * whole pass, against 31 s one run after another) with a fifth less of the browser's memory, so six pages is the most open.
 */
const RUNS_AT_ONCE = 2;
const WINDOWS_PER_RUN = 3;
export const STORY_MS = 15_000;
export const WINDOW = { width: 1200, height: 900 };
/**
 * A picture (P5): the top of the page this many pixels down, drawn at twice the size (`PICTURE_SCALE`) so it is sharp,
 * is what `composeOnWhite` finds the story in; it is kept at most this many pixels across, as JPEG.
 */
export const PICTURE_TOP = 640;
export const PICTURE_SCALE = 2;
export const PICTURE_MOST_ACROSS = 1440;
export const PICTURE_QUALITY = 85;

/**
 * Each instance of the component a story file is of (Phase 1 of adjusting a component), read in the page: the stories'
 * own `component` (`PREVIEW_COMPONENT`), found in what React drew by identity, since a build's names are minified. Each
 * instance's top element is the first element on the page inside it, found going up from each element in the page's
 * order, never down, since an element may be held by either of the two copies React keeps of what it drew, and a copy's
 * children can be stale; the same order in both drawings of a file is what pairs them up.
 *
 * Of that element: its height, each side's padding, each corner's radius, its row and column gaps, its font size, and its
 * background, text and border colors, as the browser computes them, each as it is (they are put together where they are
 * read); and the props it was drawn with that say which variant it is (a string, a number or a true or false, not its
 * content, its handlers, its styling or what it is for assistive technology).
 *
 * An instance whose top element is part of what it was given (a tooltip around a button) draws nothing of its own there,
 * so is counted apart (`wrapping`), never read as the content's values. An instance's top is the first element inside it
 * that takes up room, so one that draws nothing on the page is passed over. The stories that threw are counted
 * (`storiesFailed`), so none drawn because of them is not taken for none drawn at all. The tree is read through React's own
 * record of what it drew (its `__reactFiber` key on each element); were that kept another way, finding nothing is said as
 * that, never as stories that draw none. **Nothing here can stop the rest of the drawing being read:** a failure is kept
 * as what it said (`instancesFailed`).
 */
const instancesIn = `try {
		const of = window[${JSON.stringify(PREVIEW_COMPONENT)}];
		drawn.component = Boolean(of);
		drawn.instances = [];
		drawn.wrapping = 0;
		drawn.controls = of?.controls ?? [];
		// Stories that threw, said in their place by the page: they draw no instance, for a reason they say themselves.
		drawn.storiesFailed = document.querySelectorAll('[data-story] .fd-error').length;
		if (of) {
			const component = of.component;
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
			const seen = new Set();
			let reached = false;
			for (const story of document.querySelectorAll('[data-story]')) {
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
							drawn.wrapping++;
							continue;
						}
						const s = getComputedStyle(el);
						const props = {};
						for (const [k, v] of Object.entries(f.memoizedProps ?? {})) {
							if (notVariant.test(k) || !['string', 'number', 'boolean'].includes(typeof v) || String(v).length > 32) continue;
							props[k] = String(v);
						}
						const values = {
							height: +box.height.toFixed(2) + 'px',
							padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' '),
							radius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].join(' '),
							gap: s.rowGap + ' ' + s.columnGap,
							fontSize: s.fontSize,
							background: s.backgroundColor,
							text: s.color,
						};
						if (parseFloat(s.borderTopWidth) > 0) values.border = s.borderTopColor;
						drawn.instances.push({ story: story.getAttribute('data-story') ?? '', props, values });
					}
				}
			}
			// Elements drawn and not one known to React's record of what it drew: a React that keeps it another way, whose
			// instances cannot be found. Said as that, not as stories that draw none.
			if (!reached && document.querySelector('[data-story] *')) throw new Error("React's record of what it drew could not be read, so its instances cannot be found.");
		}
	} catch (error) {
		drawn.instances = [];
		drawn.instancesFailed = String(error?.message ?? error);
	}`;

/**
 * What a story file draws, read in the page once it has drawn: the page draws the file in place of the last
 * (`PREVIEW_SHOW`), so the page is loaded once for many. Then its fonts, and what animates in, settle, and its stories'
 * elements that take up room are read: each one's background, text and border colors, its radius, and its padding,
 * margins and gaps, counted by computed value. With `tags`, axe (in the page already) checks the stories' accessibility
 * at them (T7), before anything is hidden for a picture, since axe passes over what is hidden.
 *
 * **And each instance of the component the stories are of** (`instancesIn`), with its values and the props it was drawn
 * with, in light and in dark: a value is a token's in a mode when the tags show through in it.
 */
export const readDrawn = (file: string, picture: boolean, tags: string[] | null = null): string => `(async (file, picture) => {
	const until = Date.now() + ${STORY_MS - 3000};
	while (typeof window[${JSON.stringify(PREVIEW_SHOW)}] !== 'function' && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
	await window[${JSON.stringify(PREVIEW_SHOW)}](file);
	await document.fonts.ready;
	const settled = Date.now() + 600;
	while (document.getAnimations().some((a) => a.playState === 'running') && Date.now() < settled) await new Promise((r) => setTimeout(r, 25));
	const drawn = { colors: {}, radii: {}, spacing: {} };
	const add = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
	for (const el of document.querySelectorAll('#root *')) {
		const box = el.getBoundingClientRect();
		if (box.width === 0 || box.height === 0) continue;
		const s = getComputedStyle(el);
		add(drawn.colors, s.backgroundColor);
		add(drawn.colors, s.color);
		if (parseFloat(s.borderTopWidth) > 0) add(drawn.colors, s.borderTopColor);
		add(drawn.radii, s.borderTopLeftRadius);
		for (const k of ['paddingTop', 'paddingLeft', 'marginTop', 'marginLeft', 'rowGap', 'columnGap']) add(drawn.spacing, s[k]);
	}
	${instancesIn}${
		tags
			? `
	// The stories only: not the page they are drawn on, nor the names it gives them.
	drawn.accessibility = window.axe ? await ${axeRun("{ include: [['#root']], exclude: [['.fd-name']] }", tags)} : null;`
			: ''
	}
	if (!picture) return drawn;
	// A picture (P5): the first story alone, at the top of the page, which is white. Everything else is hidden first (hidden,
	// so nothing moves), or a short story would have the next one, and its own name, in its picture. No wait after: a
	// screenshot is of the next frame the browser paints, which has this in it (every one of Flock's pictures was the same
	// taken at once as after a wait, but for what animates).
	const first = document.querySelector('[data-story]');
	for (const el of document.querySelectorAll('[data-story]')) if (el !== first) el.style.visibility = 'hidden';
	const name = first?.querySelector('.fd-name');
	if (name) name.style.visibility = 'hidden';
	return drawn;
})(${JSON.stringify(file)}, ${picture})`;

/** A run's files shared between `pages` pages: each takes every so many, so the slow ones are spread out. */
const sharesOf = <T>(files: T[]): T[][] =>
	Array.from({ length: Math.min(WINDOWS_PER_RUN, files.length) }, (_, w) => files.filter((_file, i) => i % WINDOWS_PER_RUN === w));

/** What each page drew, back in the order of the run's files (`sharesOf`'s order undone); null for any not drawn. */
const backInOrder = <T>(files: unknown[], drawn: (T | null)[][]): (T | null)[] =>
	files.map((_, i) => drawn[i % WINDOWS_PER_RUN]?.[Math.floor(i / WINDOWS_PER_RUN)] ?? null);

/** What one page is given of a run to draw: the build, its mode, its share of the files, and whether it pictures and checks them. */
export interface Share {
	base: string;
	mode: Mode;
	files: string[];
	pictures: boolean;
	tags: string[] | null;
}

/**
 * The runs, `RUNS_AT_ONCE` at a time in the order given (so the longest, given first, is drawn beside the others), each
 * shared between a few pages at once, drawn by the shell's own page (`drawShare`), and put back in the order of the runs
 * and of each run's files: how the shell measures (`Measure`).
 */
export const measureWith = (drawShare: (share: Share) => Promise<(Drawn | null)[]>): Measure => {
	// Shared by every ask, so runs asked for at once by two callers still draw `RUNS_AT_ONCE` at a time, in the order asked.
	let drawing = 0;
	const waiting: (() => void)[] = [];
	const turn = async (): Promise<void> => {
		if (drawing >= RUNS_AT_ONCE) await new Promise<void>((go) => waiting.push(go));
		drawing++;
	};
	const done = () => {
		drawing--;
		waiting.shift()?.();
	};
	return (runs) =>
		Promise.all(
			runs.map(async ({ base, mode, files, pictures = false, accessibility = null }) => {
				await turn();
				try {
					return backInOrder(
						files,
						await Promise.all(sharesOf(files).map((share) => drawShare({ base, mode, files: share, pictures, tags: accessibility }))),
					);
				} finally {
					done();
				}
			}),
		);
};

/**
 * Each file of a page's share drawn in turn, once the page is loaded (with axe in it when the run checks accessibility):
 * `run` runs a script in the page, `picture` takes the first story's picture. A story that does not draw in time is null,
 * and the rest go on; what the page says it found is kept only when it is axe's results.
 */
export const drawEach = async (
	{ files, pictures, tags }: Share,
	run: (code: string) => Promise<unknown>,
	picture: () => Promise<Buffer | undefined>,
): Promise<(Drawn | null)[]> => {
	const drawn: (Drawn | null)[] = [];
	for (const file of files) {
		const read = (await within(
			STORY_MS,
			run(readDrawn(file, pictures, tags)).catch(() => null),
		)) as (Drawn & { accessibility?: unknown }) | null;
		if (read === null) {
			drawn.push(null);
			continue;
		}
		const { accessibility, ...measured } = read;
		const taken = pictures
			? await within(
					STORY_MS,
					picture().catch(() => undefined),
				)
			: undefined;
		drawn.push({ ...measured, ...(taken ? { picture: taken } : {}), ...(axeFound(accessibility) ? { accessibility } : {}) });
	}
	return drawn;
};
