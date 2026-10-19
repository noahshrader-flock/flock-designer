/**
 * Found by tagging, never by reading the components' source, which every library writes differently: a drawn tag names its
 * token exactly.
 */
import type {
	AccessibilityResult,
	ChangeReach,
	ComponentTokens as Answer,
	ComponentValues,
	ComponentPictures as Pictures,
	TokenUser,
	TokenUsers,
	ConnectedDesignSystem,
	DeclaredProp,
	DesignToken,
	StoryPreview,
	TokenEdit,
	ValueProperty,
} from '../../../shared/contract';
import { HOST } from '../../../shared/vocabulary';
import type { ComponentPictures } from './componentPictures';
import { type AxeFound, countsOf } from '../../../shared/accessibility';
import { designSystemOf } from '../../../shared/catalog';
import { readCatalog } from './componentCatalog';
import { type LibraryAt, baseAt, libraryTarget, listedComponents, systemReads } from './designLibrary';
import { resultOf } from '../accessibility/accessibilityCheck';
import { readTokens } from './designTokens';
import { readValues } from './componentValues';
import { type Drawings, reachOf } from './changeReach';
import type { BuiltFor } from './storyPreviews';
import { inTurns } from '../platform/concurrency';
import { newestAnswer } from '../platform/newestAnswer';
import { editedFiles } from './tokenEdits';
import type { CatalogReads } from './componentCatalog';
import { type Tags, asTag, inMode, isNothing, sizeTokens, tagsFor } from './tokenTags';
import type { Measure } from '../../ports';

/** Each computed value to how many times it is drawn; `picture` and `accessibility` only when the run asked for them. */
export interface Drawn {
	colors: Record<string, number>;
	radii: Record<string, number>;
	spacing: Record<string, number>;
	picture?: Buffer;
	accessibility?: AxeFound;
	/** Set in the light drawings only. */
	component?: boolean;
	instances?: Instance[];
	wrapping?: number;
	storiesFailed?: number;
	instancesFailed?: string;
	controls?: string[];
	/** The page's root font size, in px. */
	rootPx?: number;
}

/** Values keep every part as computed (padding's four sides, a radius's four corners, a gap's row and column). */
export interface Instance {
	story: string;
	/** Stable across drawings of the same file (`findInstances`), so a value tried in the preview is set on it. */
	key: string;
	props: Record<string, string>;
	values: Partial<Record<ValueProperty, string>>;
}

export type Mode = 'light' | 'dark';

/** With no `stories`, the file's first story drawn from its args is used. */
export interface Vary {
	stories: string[];
	props: DeclaredProp[];
}

const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

export interface FileUse {
	uses: Map<string, number>;
	notTokens: { kind: 'color' | 'radius' | 'spacing'; value: string; uses: number }[];
	derived: number;
}

/** In dark, a tag given to a role both modes share (tagged once, as Light) is the Dark token written in that place. */
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
				const paths = sizeTokens(value, tags.sizes);
				for (const path of paths) add(uses, inMode(tokens, path, mode), n);
				if (paths.length === 0 && mode === 'light') add(notTokens, `${kind} ${value}`, n);
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

export interface TaggedPreviews {
	preview(): Promise<StoryPreview>;
	builtWith(purpose: BuiltFor, files: (reads: CatalogReads) => Promise<Map<string, string>>): Promise<StoryPreview>;
}

export interface ComponentTokensDeps {
	system: () => ConnectedDesignSystem | null;
	previews: TaggedPreviews;
	measure: Measure;
	pictures: Pick<ComponentPictures, 'keep' | 'of'>;
	at?: LibraryAt;
}

/** `files` is null for a story file that did not draw, of which nothing can be said. */
export type Built = {
	files: Map<string, FileUse | null>;
	values: Map<string, ComponentValues>;
	accessibility: Map<string, AccessibilityResult>;
	order: string[];
	reading: { tags: Tags; tokens: DesignToken[]; tagged: string | null };
};
type Index = Built | { error: string };

const drawsWith = (built: Built, path: string): string[] => built.order.filter((f) => built.files.get(f)?.uses.has(path));

/** `key` names the commit and the package. */
export interface DrawnIndex {
	key: string;
	commit: string;
	built: Built;
}

interface Building {
	key: string;
	commit: string;
	done: Index | null;
	finished: Promise<void>;
}

export class ComponentTokens {
	private index: Building | null = null;
	private readonly reached = newestAnswer<ChangeReach>((error) => ({ state: 'failed', error }));
	private readonly inTurn = inTurns<'reach' | 'written'>();
	private asIsDrawn: { key: string; drawn: Promise<Map<string, Drawings>> } | null = null;

	constructor(private readonly deps: ComponentTokensDeps) {}

	async of(file: string): Promise<Answer> {
		const index = await this.drawn();
		if (index.state !== 'ready') return index;
		const done = index.built;
		if (!done.files.has(file)) return { state: 'failed', error: `${file} is not one of the library's story files.` };
		const use = done.files.get(file);
		if (!use) return { state: 'failed', error: 'Its stories did not draw, so which tokens it uses cannot be said. Its page says why.' };
		const sharedWith: Record<string, string[]> = {};
		for (const path of use.uses.keys()) sharedWith[path] = drawsWith(done, path).filter((f) => f !== file);
		return {
			state: 'ready',
			uses: [...use.uses].map(([path, uses]) => ({ path, uses })).sort((a, b) => b.uses - a.uses),
			sharedWith,
			notTokens: use.notTokens,
			derived: use.derived,
			accessibility: done.accessibility.get(file) ?? null,
			values: done.values.get(file) ?? { state: 'not-drawn' },
		};
	}

	/** Read from the index the other way round; nothing is drawn for it. Each value counts once whichever mode names it. */
	async users(path: string): Promise<TokenUsers> {
		const index = await this.drawn();
		if (index.state !== 'ready') return index;
		const { files, values } = index.built;
		const users = drawsWith(index.built, path).map((file): TokenUser => {
			const read = values.get(file);
			const rows = read?.state === 'read' ? [...(read.rows.light ?? []), ...(read.rows.dark ?? [])] : [];
			const named = new Set(rows.flatMap((r) => r.cells.filter((c) => c.tokens.includes(path)).map((c) => `${r.property}|${c.variant}`)));
			return { file, uses: files.get(file)?.uses.get(path) ?? 0, values: named.size };
		});
		return { state: 'ready', users: users.sort((a, b) => b.values - a.values || b.uses - a.uses) };
	}

	/** Only the newest change asked for is drawn, in the background; one that failed is said once, and drawn again next ask. */
	async reach(edits: TokenEdit[]): Promise<ChangeReach> {
		if (edits.length === 0) return { state: 'none' };
		// Not drawn on a branch handed to Claude Code, shown as it was committed: it is the library's own branch a change moves.
		const system = this.deps.system();
		if (system !== null && (await (this.deps.at ?? baseAt)(system))?.showing) return { state: 'none' };
		const index = await this.drawn();
		if (index.state !== 'ready') return index;
		const key = `${index.key}\u0000${JSON.stringify(edits)}`;
		const work = async (): Promise<ChangeReach> => (await this.reachWith(index, (reads) => editedFiles(reads, edits))).reach;
		return this.reached(key, work) ?? { state: 'building' };
	}

	/**
	 * `written` builds apart from `reach` so neither is built over the other. A component that differs is drawn again, both
	 * ways, and said to move only when it differs again.
	 */
	async reachWith(
		index: DrawnIndex,
		files: (reads: CatalogReads) => Promise<Map<string, string>>,
		purpose: 'reach' | 'written' = 'reach',
	): Promise<{ reach: ChangeReach; after: Map<string, Drawings> }> {
		// A build of a purpose is served until the next replaces it: one at a time, built and drawn, so none is drawn gone.
		return this.inTurn(purpose, () => this.reachIn(index, files, purpose));
	}

	private async reachIn(
		index: DrawnIndex,
		files: (reads: CatalogReads) => Promise<Map<string, string>>,
		purpose: 'reach' | 'written',
	): Promise<{ reach: ChangeReach; after: Map<string, Drawings> }> {
		const [before, built] = await Promise.all([this.asIs(index), this.deps.previews.builtWith(purpose, files)]);
		if (built.state !== 'ready')
			return {
				reach: { state: 'failed', error: built.state === 'failed' ? built.error : 'The previews could not be built with the change.' },
				after: new Map(),
			};
		const { order, values } = index.built;
		const after = await this.drawnAt(built.base, order);
		const first = reachOf(order, before, after, values);
		if (first.state !== 'ready' || first.moved.length === 0) return { reach: first, after };
		// Each that differs is drawn again, as it is and with the change, before it is said to move: a story drawn otherwise
		// once in a while (FSFab's, one time in three) is not moved by a change. Said as the second drawings say it.
		const plain = await this.deps.previews.preview();
		if (plain.state !== 'ready') return { reach: first, after };
		const differing = first.moved.map((m) => m.file);
		const [was, now] = await Promise.all([this.drawnAt(plain.base, differing), this.drawnAt(built.base, differing)]);
		const again = reachOf(differing, was, now, values);
		if (again.state !== 'ready') return { reach: first, after };
		const { moved } = again;
		for (const [file, drawings] of now) after.set(file, drawings);
		return {
			reach: {
				state: 'ready',
				moved,
				unchanged: first.unchanged + again.unchanged,
				notDrawn: [...first.notDrawn, ...again.notDrawn],
			},
			after,
		};
	}

	/**
	 * Every component as the library has it, drawn as a change is drawn (no picture, no check), once for the commit, so the
	 * change is all that differs. The index's drawings take pictures and check as they go, and some stories draw otherwise
	 * for it (a spinner mid-turn): against those, a change that writes nothing moved sixteen of FUI's.
	 */
	asIs(index: DrawnIndex): Promise<Map<string, Drawings>> {
		if (this.asIsDrawn?.key !== index.key) {
			const drawn = this.deps.previews.preview().then((plain) => {
				if (plain.state !== 'ready') throw new Error('The previews could not be built, so the library as it is could not be drawn.');
				return this.drawnAt(plain.base, index.built.order);
			});
			this.asIsDrawn = { key: index.key, drawn };
			// One that did not draw is drawn again on the next ask.
			drawn.catch(() => this.asIsDrawn?.drawn === drawn && (this.asIsDrawn = null));
		}
		return this.asIsDrawn.drawn;
	}

	private async drawnAt(base: string, files: string[]): Promise<Map<string, Drawings>> {
		const [light, dark] = await this.deps.measure([
			{ base, mode: 'light', files },
			{ base, mode: 'dark', files },
		]);
		return new Map(files.map((f, i) => [f, { light: light?.[i] ?? null, dark: dark?.[i] ?? null }]));
	}

	async drawn(): Promise<{ state: 'building' } | { state: 'failed'; error: string } | ({ state: 'ready' } & DrawnIndex)> {
		const started = await this.started();
		if ('error' in started) return { state: 'failed', error: started.error };
		const done = started.index.done;
		if (done === null) return { state: 'building' };
		if ('error' in done) {
			// One that did not work is tried again on the next ask.
			this.index = null;
			return { state: 'failed', error: done.error };
		}
		return { state: 'ready', key: started.index.key, commit: started.index.commit, built: done };
	}

	/** Pictures from an earlier pass are given while a new one draws, never none in their place. */
	async pictures(): Promise<Pictures> {
		const system = this.deps.system();
		if (system === null) return { drawing: false, pictures: {}, issues: {} };
		const started = await this.started().catch(() => null);
		const index = started === null || 'error' in started ? null : started.index;
		const built = index?.done && !('error' in index.done) ? index.done : null;
		const issues = built ? Object.fromEntries([...built.accessibility].map(([f, r]) => [f, countsOf(r)])) : {};
		return { drawing: index !== null && index.done === null, pictures: await this.deps.pictures.of(system.id), issues };
	}

	/** Never rejects: a failure is said to whoever asks for a component, and tried again then. */
	async warm(): Promise<void> {
		const started = await this.started().catch(() => null);
		if (started !== null && !('error' in started)) await started.index.finished;
	}

	private async started(): Promise<{ index: Building } | { error: string }> {
		const system = this.deps.system();
		if (system === null) return { error: 'There is no design system connected.' };
		const shown = await (this.deps.at ?? baseAt)(system);
		if (shown === null) return { error: `The library has no ${system.branch} branch from ${HOST} to read.` };
		const { commit } = shown;
		const key = `${commit}:${system.folder}`;
		if (this.index?.key !== key) {
			const index: Building = { key, commit, done: null, finished: Promise.resolve() };
			index.finished = this.build(system, commit, shown.showing !== null).then(
				(built) => void (index.done = built),
				(err: Error) => void (index.done = { error: err.message }),
			);
			this.index = index;
		}
		return { index: this.index };
	}

	/** `aside`: a branch handed to Claude Code, shown in place of the library's, whose pictures are not the grid's to keep. */
	private async build(system: ConnectedDesignSystem, commit: string, aside: boolean): Promise<Built> {
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
		// The library as it is is always drawn: in light for the pictures and the accessibility check, whatever the tags do,
		// and in dark for the values there. Started at once, while the tags are built, the longest (light) first.
		const asIsRun = { base: plain.base, mode: 'light' as const, files, pictures: true, accessibility: target.tags };
		const asIsDrawn = this.deps.measure([asIsRun, { base: plain.base, mode: 'dark', files }]);
		// A failure to draw is said once the tags are built, not lost while they are.
		asIsDrawn.catch(() => undefined);
		const tagged = tags.edits.length === 0 ? null : await this.deps.previews.builtWith('tagged', () => editedFiles(reads, tags.edits));
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
		const taken = new Map<string, Buffer>();
		files.forEach((f, i) => {
			const picture = asIs?.[i]?.picture;
			if (picture) taken.set(f, picture);
		});
		if (!aside) this.deps.pictures.keep(system.id, files, taken);
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
		return { files: uses, values, accessibility, order: files, reading: { tags, tokens, tagged: taggedBase } };
	}
}
