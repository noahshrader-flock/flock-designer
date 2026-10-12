/**
 * Which tokens each component draws with, and so which components share a token (T6 of the design system plan,
 * decision 29). **Found by tagging, for any library the token writers support:** every token is given a value nothing
 * else has, the previews are built once with those values (`StoryPreviews.tagged`), every story is drawn, and what it
 * draws is read back: a color that is a tag, or a size that is a whole multiple of one, names its token exactly. Nothing
 * is read from the components' own source, which every library writes differently.
 *
 * Each story is drawn three times: tagged, in light and in dark, for the tokens it uses in each mode; and as the library
 * has it, in light, so a color that is in both is one the component sets itself (not a token), and a color only in the
 * tagged drawing is one worked out from a token (a hover's darker shade), which is counted but cannot be named.
 *
 * Kept for the library's commit: the first ask starts it in the background and says `building`; later asks for that
 * commit answer at once.
 */
import type {
	AccessibilityResult,
	ComponentTokens as Answer,
	ComponentPictures as Pictures,
	ConnectedDesignSystem,
	DesignToken,
	StoryPreview,
	TokenEdit,
} from '../../shared/contract';
import type { ComponentPictures } from './componentPictures';
import { type AxeFound, countsOf } from '../../shared/accessibility';
import { designSystemOf } from '../../shared/catalog';
import { isEditable } from '../../shared/primitives';
import { PX_PER_REM, lengthParts, placeOf, writtenWith } from '../../shared/tokens';
import { readCatalog } from './componentCatalog';
import { libraryCommit, libraryTarget, listedComponents, systemReads } from './designLibrary';
import { resultOf } from './accessibilityCheck';
import { readTokens } from './designTokens';

/**
 * What a story draws, as counts of each computed value: its colors (background, text, border), radii and spacing; and,
 * when its run asked for one (P5), a picture of its first story, as JPEG; and, when its run gave tags (T7), what axe
 * found in its stories at them.
 */
export interface Drawn {
	colors: Record<string, number>;
	radii: Record<string, number>;
	spacing: Record<string, number>;
	picture?: Buffer;
	accessibility?: AxeFound;
}

export type Mode = 'light' | 'dark';

/**
 * Draws story files from a build of the previews (its `base`), in a mode, and says what each drew, in the order given;
 * null for one that would not draw. Several runs at once.
 */
export type Measure = (runs: { base: string; mode: Mode; files: string[]; pictures?: boolean; accessibility?: string[] }[]) => Promise<(Drawn | null)[][]>;

/** A tag's blue, the same for every color tag: its red and green are the token's number. */
const TAG_BLUE = 0x5a;

/**
 * The size tag after `px`: the next prime. Size tags are primes from 13, so a whole multiple of up to 8 of one is never a
 * multiple of another, and none is a size a library is likely to write by hand; there are as many as a library has lengths.
 */
const FIRST_SIZE_TAG = 13;
const nextSizeTag = (px: number): number => {
	const isPrime = (k: number) => Array.from({ length: Math.floor(Math.sqrt(k)) - 1 }, (_, i) => i + 2).every((d) => k % d !== 0);
	let k = px + 1;
	while (!isPrime(k)) k++;
	return k;
};
/** The largest multiple of a size tag read as that token: a theme's spacing is used up to a few times over. */
const MOST_MULTIPLE = 8;

export interface Tags {
	edits: TokenEdit[];
	/** A color tag (`#00015A`), and a size tag in pixels, to the token it was given to. */
	colors: Map<string, string>;
	sizes: { px: number; path: string }[];
}

/**
 * A tag for every token: one edit for each place a token is written (a role both modes share is one place), a color by
 * its number, a length by a prime number of pixels (of a rem's sixteenths for one written in rem). A length in `em`, whose
 * pixels depend on where it is used, is left untagged.
 */
export const tagsFor = (tokens: DesignToken[]): Tags => {
	const edits: TokenEdit[] = [];
	const colors = new Map<string, string>();
	const sizes: Tags['sizes'] = [];
	const places = new Set<string>();
	for (const t of tokens) {
		// Only what can be changed is tagged: a tag is a change, and a font or a shadow is shown, never changed.
		if (!isEditable(t) || places.has(placeOf(t))) continue;
		places.add(placeOf(t));
		if (t.kind === 'color') {
			const n = colors.size + 1;
			const value = `#${[(n >> 8) & 255, n & 255, TAG_BLUE].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
			colors.set(value, t.path);
			edits.push({ path: t.path, value });
			continue;
		}
		const unit = lengthParts(t.value)?.unit;
		if (unit !== 'px' && unit !== 'rem') continue;
		const px = sizes.length === 0 ? FIRST_SIZE_TAG : nextSizeTag((sizes[sizes.length - 1] as { px: number }).px);
		sizes.push({ px, path: t.path });
		edits.push({ path: t.path, value: unit === 'px' ? `${px}px` : `${px / PX_PER_REM}rem` });
	}
	return { edits, colors, sizes };
};

/** A computed color (`rgb(0, 1, 90)`, `rgba(0, 1, 90, 0.4)`) as the tag it would be, whatever its opacity. */
const asTag = (color: string): string | null => {
	const m = /^rgba?\((\d+), (\d+), (\d+)/.exec(color);
	if (!m || Number(m[3]) !== TAG_BLUE) return null;
	return `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

/** The size tag a computed size (`26px`) is a whole multiple of, if any. */
const sizeToken = (value: string, sizes: Tags['sizes']): string | null => {
	const px = Math.abs(Number(/^(-?[\d.]+)px$/.exec(value)?.[1] ?? NaN));
	if (!Number.isFinite(px) || px === 0) return null;
	return sizes.find((s) => px % s.px === 0 && px / s.px <= MOST_MULTIPLE)?.path ?? null;
};

/** Nothing worth saying: no color, no size, or a gap left as CSS has it (`normal`). */
const isNothing = (value: string): boolean => ['rgba(0, 0, 0, 0)', 'transparent', '0px', 'normal', 'auto', ''].includes(value);

const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

/** One component's tokens, from its story drawn tagged (in each mode) and as the library has it. */
export interface FileUse {
	uses: Map<string, number>;
	notTokens: { kind: 'color' | 'radius' | 'spacing'; value: string; uses: number }[];
	derived: number;
}

/**
 * What a story's drawings say about its tokens. In dark, a tag given to a role both modes share (tagged once, as Light)
 * is the Dark token written in that place.
 */
export const decode = (tagged: Partial<Record<Mode, Drawn>>, plain: Drawn | undefined, tags: Tags, tokens: DesignToken[]): FileUse => {
	const byPath = new Map(tokens.map((t) => [t.path, t]));
	const inMode = (path: string, mode: Mode): string => {
		const t = byPath.get(path);
		const dark = mode === 'dark' && t && t.group !== 'Dark' ? writtenWith(tokens, t).find((w) => w.group === 'Dark') : undefined;
		return dark?.path ?? path;
	};
	const uses = new Map<string, number>();
	const notTokens = new Map<string, number>();
	let derived = 0;
	for (const mode of ['light', 'dark'] as const) {
		const drawn = tagged[mode];
		if (!drawn) continue;
		for (const [color, n] of Object.entries(drawn.colors)) {
			if (isNothing(color)) continue;
			const tag = asTag(color);
			const path = tag ? tags.colors.get(tag) : undefined;
			if (path) add(uses, inMode(path, mode), n);
			// What the component sets itself and what is worked out from a token, told apart in light, beside the plain drawing.
			else if (mode === 'light' && plain?.colors[color]) add(notTokens, `color ${color}`, n);
			else if (mode === 'light') derived += n;
		}
		for (const [kind, values] of [
			['radius', drawn.radii],
			['spacing', drawn.spacing],
		] as const) {
			for (const [value, n] of Object.entries(values)) {
				if (isNothing(value)) continue;
				const path = sizeToken(value, tags.sizes);
				if (path) add(uses, inMode(path, mode), n);
				else if (mode === 'light') add(notTokens, `${kind} ${value}`, n);
			}
		}
	}
	return {
		uses,
		notTokens: [...notTokens]
			.map(([key, n]) => ({ kind: key.slice(0, key.indexOf(' ')) as 'color' | 'radius' | 'spacing', value: key.slice(key.indexOf(' ') + 1), uses: n }))
			.sort((a, b) => b.uses - a.uses),
		derived,
	};
};

/** What the index needs of the previews: the commit's own build, and one built with the tags. */
export interface TaggedPreviews {
	preview(): Promise<StoryPreview>;
	tagged(edits: TokenEdit[]): Promise<StoryPreview>;
}

export interface ComponentTokensDeps {
	system: () => ConnectedDesignSystem | null;
	previews: TaggedPreviews;
	measure: Measure;
	/** Where the pictures the same pass takes are kept (P5). */
	pictures: Pick<ComponentPictures, 'keep' | 'of'>;
}

/**
 * Each story file's tokens, or null for one that did not draw, of which nothing can be said; and what axe found in each
 * that drew, at the design system's target (T7).
 */
type Built = { files: Map<string, FileUse | null>; accessibility: Map<string, AccessibilityResult> };
type Index = Built | { error: string };

/** The index for one commit: `done` once it is built or has failed, and `finished` for whoever waits for that. */
interface Building {
	key: string;
	done: Index | null;
	finished: Promise<void>;
}

/** The index of what every component draws with, for the commit the library's branch is at. */
export class ComponentTokens {
	private index: Building | null = null;

	constructor(private readonly deps: ComponentTokensDeps) {}

	async of(file: string): Promise<Answer> {
		const started = await this.started();
		if ('error' in started) return { state: 'failed', error: started.error };
		const done = started.index.done;
		if (done === null) return { state: 'building' };
		if ('error' in done) {
			// One that did not work is tried again on the next ask.
			this.index = null;
			return { state: 'failed', error: done.error };
		}
		if (!done.files.has(file)) return { state: 'failed', error: `${file} is not one of the library's story files.` };
		const use = done.files.get(file);
		if (!use) return { state: 'failed', error: 'Its stories did not draw, so which tokens it uses cannot be said. Its page says why.' };
		const sharedWith: Record<string, string[]> = {};
		for (const path of use.uses.keys()) sharedWith[path] = [...done.files].filter(([f, u]) => f !== file && u?.uses.has(path)).map(([f]) => f);
		return {
			state: 'ready',
			uses: [...use.uses].map(([path, uses]) => ({ path, uses })).sort((a, b) => b.uses - a.uses),
			sharedWith,
			notTokens: use.notTokens,
			derived: use.derived,
			accessibility: done.accessibility.get(file) ?? null,
		};
	}

	/**
	 * The pictures of the shown design system's components (P5), as they are now, and whether a pass that may replace them
	 * is drawing. Pictures from an earlier pass are given while a new one draws, never none in their place.
	 */
	async pictures(): Promise<Pictures> {
		const system = this.deps.system();
		if (system === null) return { drawing: false, pictures: {}, issues: {} };
		const started = await this.started().catch(() => null);
		const index = started === null || 'error' in started ? null : started.index;
		const built = index?.done && !('error' in index.done) ? index.done : null;
		// What each card says of its component's accessibility (T7): how many of each, once the pass has checked it.
		const issues = built ? Object.fromEntries([...built.accessibility].map(([f, r]) => [f, countsOf(r)])) : {};
		return { drawing: index !== null && index.done === null, pictures: await this.deps.pictures.of(system.id), issues };
	}

	/**
	 * Gets the index for the commit the library is at ready in the background, without waiting for a component to be asked
	 * for, so it is there by the time one is. Resolves once it is built, or has failed; never rejects, since a failure is said
	 * to whoever asks for a component, and tried again then.
	 */
	async warm(): Promise<void> {
		const started = await this.started().catch(() => null);
		if (started !== null && !('error' in started)) await started.index.finished;
	}

	/** The index for the commit the library's branch is at, started if it is not, or why there is none. */
	private async started(): Promise<{ index: Building } | { error: string }> {
		const system = this.deps.system();
		if (system === null) return { error: 'There is no design system connected.' };
		const commit = await libraryCommit(system.root, system.branch);
		if (commit === null) return { error: `The library has no ${system.branch} branch from GitHub to read.` };
		const key = `${commit}:${system.folder}`;
		if (this.index?.key !== key) {
			const index: Building = { key, done: null, finished: Promise.resolve() };
			index.finished = this.build(system, commit).then(
				(built) => void (index.done = built),
				(err: Error) => void (index.done = { error: err.message }),
			);
			this.index = index;
		}
		return { index: this.index };
	}

	private async build(system: ConnectedDesignSystem, commit: string): Promise<Built> {
		const reads = await systemReads(system, commit);
		const [read, catalog, target] = await Promise.all([readTokens(reads), readCatalog(reads, designSystemOf(system)), libraryTarget(reads, system.name)]);
		const { tokens } = read;
		// The components the tab lists, so a token page is never said to share a token.
		const files = listedComponents(catalog, read).map((c) => c.id);
		const tags = tagsFor(tokens);
		const plain = await this.deps.previews.preview();
		if (plain.state !== 'ready')
			throw new Error(plain.state === 'failed' ? plain.error : 'The previews could not be built, so the components could not be drawn.');
		// With no token the library can be tagged by, there is nothing to tag: its stories are still drawn, as they are.
		const tagged = tags.edits.length === 0 ? null : await this.deps.previews.tagged(tags.edits);
		const taggedBase = tagged?.state === 'ready' ? tagged.base : null;
		// The library as it is, in light, is always drawn: it is what the grid's pictures are of (P5), whatever the tags do,
		// and what each component's accessibility is checked on, at the design system's target (T7).
		const asIsRun = { base: plain.base, mode: 'light' as const, files, pictures: true, accessibility: target.tags };
		const drawn = await this.deps.measure(
			taggedBase === null ? [asIsRun] : [{ base: taggedBase, mode: 'light', files }, { base: taggedBase, mode: 'dark', files }, asIsRun],
		);
		const [light, dark, asIs] = taggedBase === null ? [undefined, undefined, drawn[0]] : drawn;
		// The pictures, each replacing its component's last; a component that did not draw keeps its last.
		const taken = new Map<string, Buffer>();
		files.forEach((f, i) => {
			const picture = asIs?.[i]?.picture;
			if (picture) taken.set(f, picture);
		});
		this.deps.pictures.keep(system.id, files, taken);
		const at = new Date();
		const accessibility = new Map<string, AccessibilityResult>();
		files.forEach((f, i) => {
			const found = asIs?.[i]?.accessibility;
			if (found) accessibility.set(f, resultOf([{ state: 'default', ...found }], target, at));
		});
		// Tags that would not build leave the pictures taken, and say why which tokens each uses cannot be said.
		if (tagged !== null && tagged.state !== 'ready')
			throw new Error(tagged.state === 'failed' ? tagged.error : 'The previews could not be built with the tags.');
		// A file whose drawing did not come back has nothing to say, rather than that it draws with no token. With no tags,
		// what it draws as it is is all it sets itself.
		const uses = new Map(
			files.map((f, i) => {
				const read = tagged === null ? asIs?.[i] : light?.[i];
				return [f, read ? decode({ light: read, dark: dark?.[i] ?? undefined }, asIs?.[i] ?? undefined, tags, tokens) : null];
			}),
		);
		return { files: uses, accessibility };
	}
}
