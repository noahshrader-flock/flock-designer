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
	ComponentValues,
	ComponentPictures as Pictures,
	ConnectedDesignSystem,
	DesignToken,
	StoryPreview,
	TokenEdit,
	ValueProperty,
} from '../../shared/contract';
import { HOST } from '../../shared/vocabulary';
import type { ComponentPictures } from './componentPictures';
import { type AxeFound, countsOf } from '../../shared/accessibility';
import { designSystemOf } from '../../shared/catalog';
import { readCatalog } from './componentCatalog';
import { libraryCommit, libraryTarget, listedComponents, systemReads } from './designLibrary';
import { resultOf } from './accessibilityCheck';
import { readTokens } from './designTokens';
import { readValues } from './componentValues';
import { type Tags, asTag, inMode, isNothing, sizeToken, tagsFor } from './tokenTags';

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
	/**
	 * Whether the story file names the component it is of, and each instance of it drawn (Phase 1 of adjusting a component),
	 * in the light drawings only; how many instances only wrap what they were given; how many of its stories threw; and why
	 * reading them failed, if it did.
	 */
	component?: boolean;
	instances?: Instance[];
	wrapping?: number;
	storiesFailed?: number;
	instancesFailed?: string;
	/** The props the story file's stories name as their controls (their `args` and `argTypes`). */
	controls?: string[];
}

/**
 * One instance of a component as a story drew it: its story, the props that say its variant, and its values as computed,
 * each part as it is (padding's four sides, a radius's four corners, a gap's row and column).
 */
export interface Instance {
	story: string;
	/** What names it in any drawing of the same file (`FIND_INSTANCES`): what a value tried in the preview is set on. */
	key: string;
	props: Record<string, string>;
	values: Partial<Record<ValueProperty, string>>;
}

export type Mode = 'light' | 'dark';

/**
 * Draws story files from a build of the previews (its `base`), in a mode, and says what each drew, in the order given;
 * null for one that would not draw. Several runs at once.
 */
export type Measure = (
	runs: { base: string; mode: Mode; files: string[]; pictures?: boolean; accessibility?: string[] }[],
) => Promise<(Drawn | null)[][]>;

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
			if (path) add(uses, inMode(tokens, path, mode), n);
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
				if (path) add(uses, inMode(tokens, path, mode), n);
				else if (mode === 'light') add(notTokens, `${kind} ${value}`, n);
			}
		}
	}
	return {
		uses,
		notTokens: [...notTokens]
			.map(([key, n]) => ({
				kind: key.slice(0, key.indexOf(' ')) as 'color' | 'radius' | 'spacing',
				value: key.slice(key.indexOf(' ') + 1),
				uses: n,
			}))
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
 * Each story file's tokens, or null for one that did not draw, of which nothing can be said; its drawn values, from the
 * same drawings (Phase 1 of adjusting a component); and what axe found in each that drew, at the design system's target (T7).
 */
type Built = { files: Map<string, FileUse | null>; values: Map<string, ComponentValues>; accessibility: Map<string, AccessibilityResult> };
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
			// A file whose stories did not finish drawing as the library has them has no values to say.
			values: done.values.get(file) ?? { state: 'not-drawn' },
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
		if (commit === null) return { error: `The library has no ${system.branch} branch from ${HOST} to read.` };
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
		const [read, catalog, target] = await Promise.all([
			readTokens(reads),
			readCatalog(reads, designSystemOf(system)),
			libraryTarget(reads, system.name),
		]);
		const { tokens } = read;
		// The components the tab lists, so a token page is never said to share a token.
		const files = listedComponents(catalog, read).map((c) => c.id);
		const tags = tagsFor(tokens);
		const plain = await this.deps.previews.preview();
		if (plain.state !== 'ready')
			throw new Error(plain.state === 'failed' ? plain.error : 'The previews could not be built, so the components could not be drawn.');
		// The library as it is, in light, is always drawn: it is what the grid's pictures are of (P5), whatever the tags do,
		// and what each component's accessibility is checked on, at the design system's target (T7). And in dark, for the
		// values (what the tags change in dark says which are tokens there). Started at once, while the tags are built: the
		// one with the pictures and the check first, as it is the longest.
		const asIsRun = { base: plain.base, mode: 'light' as const, files, pictures: true, accessibility: target.tags };
		const asIsDrawn = this.deps.measure([asIsRun, { base: plain.base, mode: 'dark', files }]);
		// A failure to draw is said once the tags are built, not lost while they are.
		asIsDrawn.catch(() => undefined);
		// With no token the library can be tagged by, there is nothing to tag: its stories are still drawn, as they are.
		const tagged = tags.edits.length === 0 ? null : await this.deps.previews.tagged(tags.edits);
		const taggedBase = tagged?.state === 'ready' ? tagged.base : null;
		const [[asIs, asIsDarkDrawn], [light, dark]] = await Promise.all([
			asIsDrawn,
			taggedBase === null
				? [undefined, undefined]
				: this.deps.measure([
						{ base: taggedBase, mode: 'light', files },
						{ base: taggedBase, mode: 'dark', files },
					]),
		]);
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
				const asDrawn = tagged === null ? asIs?.[i] : light?.[i];
				return [f, asDrawn ? decode({ light: asDrawn, dark: dark?.[i] ?? undefined }, asIs?.[i] ?? undefined, tags, tokens) : null];
			}),
		);
		// Its values, from the same drawings: as the library has it, and with the tags, in light and in dark.
		const values = new Map<string, ComponentValues>();
		files.forEach((f, i) => {
			const lightDrawn = asIs?.[i];
			if (!lightDrawn) return;
			const darkDrawn = asIsDarkDrawn?.[i];
			values.set(
				f,
				readValues(
					{ plain: lightDrawn, tagged: light?.[i] ?? null },
					darkDrawn ? { plain: darkDrawn, tagged: dark?.[i] ?? null } : undefined,
					tags,
					tokens,
				),
			);
		});
		return { files: uses, values, accessibility };
	}
}
