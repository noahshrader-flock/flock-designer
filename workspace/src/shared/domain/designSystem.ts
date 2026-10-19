import type { Theme } from '../prototypeTheme';
import type { DeclaredTarget } from '../wcag';
import type { AccessibilityCounts, AccessibilityResult } from './accessibility';

/** `folder` is `''` for the whole repository; `branch` is its default. */
export interface ConnectedDesignSystem {
	/** Its repository, and in a monorepo `:folder`. */
	id: string;
	/** Its Storybook's brand title, else its package's name, else the repository's. */
	name: string;
	repository: string;
	root: string;
	folder: string;
	branch: string;
	/** Its hosted Storybook's address, ending in `/`, as the person gave it: a library's files do not say it. */
	storybook?: string;
}

/** `current` is the shown one's `id`, or null when none is. */
export interface ConnectedDesignSystems {
	systems: ConnectedDesignSystem[];
	current: string | null;
}

export interface FoundDesignSystem {
	folder: string;
	components: number;
	tokens: number;
	name: string;
}

export type TokenKind = 'color' | 'dimension' | 'font' | 'shadow' | 'duration' | 'easing' | 'number';

/** A change names it by `path`. */
export interface DesignToken {
	path: string;
	kind: TokenKind;
	/** A category the reader adds is a tab with no other change. */
	category: string;
	group: string;
	set: string;
	name: string;
	/** A color as a hex (eight digits when it has an opacity), a dimension with its unit. */
	value: string;
	/** When written as a pointer, its `value` is then the pointed-at token's, with the opacity written after it. */
	ref?: { path: string; alpha?: string };
	/**
	 * For a token a package declares, this is the library's `@import` and `from` is where the package declares it; a
	 * change is declared again in the library's stylesheet, in a rule of `from.rule`'s kind.
	 */
	source: { file: string; line: number; from?: { file: string; line: number; rule: string } };
}

/** `ref` keeps the link to another token by its path; `value` replaces any pointer. */
export type TokenChange = { ref: string } | { value: string };

/** A change is a list of these, one per token, and nothing else. */
export type TokenEdit = { path: string } & TokenChange;

/**
 * Found by drawing every story with every token tagged; `building` the first time for a commit. `derived` counts colors
 * worked out from a token (a hover's darker shade).
 */
export type ComponentTokens =
	| { state: 'building' }
	| { state: 'failed'; error: string }
	| {
			state: 'ready';
			uses: { path: string; uses: number }[];
			sharedWith: Record<string, string[]>;
			notTokens: { kind: 'color' | 'radius' | 'spacing'; value: string; uses: number }[];
			derived: number;
			/** Null when it could not be checked. */
			accessibility: AccessibilityResult | null;
			values: ComponentValues;
	  };

/** `uses` counts inner parts too; `values` is how many of its Values are that token. Most values first. */
export interface TokenUser {
	file: string;
	uses: number;
	values: number;
}
export type TokenUsers = { state: 'building' } | { state: 'failed'; error: string } | { state: 'ready'; users: TokenUser[] };

/** In this order. */
export const VALUE_PROPERTIES = ['height', 'padding', 'radius', 'gap', 'fontSize', 'background', 'text', 'border'] as const;
export type ValueProperty = (typeof VALUE_PROPERTIES)[number];
export const COLOR_VALUES: ReadonlySet<ValueProperty> = new Set(['background', 'text', 'border']);

/**
 * `derived`: worked out from a token (a hover's shade). `unchecked`: no token is tagged for its kind (a font size), or the
 * drawings did not pair up.
 */
export type ValueKind = 'token' | 'own' | 'derived' | 'mixed' | 'unchecked';

/** `variant` is null when the row has one value for all. Clear, or no border, is `none`. */
export interface ValueCell {
	variant: string | null;
	value: string;
	kind: ValueKind;
	tokens: string[];
	instances: number;
	/** Instance keys: what a value tried in the preview is set on. */
	targets: string[];
	/**
	 * One entry per case it stands for, each prop of the row's `by` to its value or null when drawn without it (a cell drawn
	 * alike with a prop false and without it stands for both). None for a row told apart by no prop.
	 */
	of?: Record<string, string | null>[];
}

/** `inside`: its stories draw differently where its values do not reach (an inner part, such as an input's outline). */
export interface ValueChange {
	mode: Theme;
	property: ValueProperty;
	variant: string | null;
	from: string;
	to: string;
	instances: number;
}
export interface ComponentReach {
	file: string;
	changes: ValueChange[];
	inside: boolean;
}

/**
 * Each component drawn against itself as the library has it, light and dark. `unchanged` is in the stories drawn, never a
 * claim about every use; of `notDrawn` nothing can be said.
 */
export type ChangeReach =
	| { state: 'none' }
	| { state: 'building' }
	| { state: 'failed'; error: string }
	| { state: 'ready'; moved: ComponentReach[]; unchanged: number; notDrawn: string[] };

/** Tried in the preview alone: nothing is written or kept. `targets` are a cell's. */
export interface TriedValue {
	property: ValueProperty;
	value: string;
	targets: string[];
	/** A token's path, drawn as it is now: written by the agent, never tried as another. */
	follows?: string;
}

/** `values` in the order its type lists them. */
export interface DeclaredProp {
	name: string;
	values: (string | number | boolean)[];
}

export type Unvaried = 'object' | 'callback' | 'content' | 'text' | 'number';

/**
 * `fixed`: props its story sets itself, so another value changes nothing. `none` when its stories name no component whose
 * props can be read.
 */
export type ComponentVariants =
	| { state: 'building' }
	| { state: 'failed'; error: string }
	| { state: 'none' }
	| { state: 'ready'; props: DeclaredProp[]; fixed: string[]; unvaried: { name: string; why: Unvaried }[]; values: ComponentValues };

/** Read from git against the base it was handed over on. `off-base`: made from another base. `out`: why a file is out of bounds. */
export type BranchReview =
	| { state: 'missing' }
	| { state: 'empty' }
	| { state: 'off-base' }
	/** `tip`: the commit read, which Propose is told back, so what is pushed is what the person saw. */
	| {
			state: 'ready';
			tip: string;
			commits: number;
			files: { path: string; added: number; removed: number; out: string | null }[];
			lines: number;
			large: boolean;
	  };

export type HandedChange = { edits: TokenEdit[] } | { tried: TriedValue[] };

/** `command` is for a terminal, when Claude Code is not in this window. */
export interface HandedOver {
	branch: string;
	editor: boolean;
	command: string | null;
}

/** Far beyond any tab's, short of anything that could hurt. */
export const MOST_TRIED = 50;

/** The same in light and in dark, in the tab and the core. */
export const triedId = ({ property, targets }: { property: ValueProperty; targets: string[] }): string =>
	`${property}\u0000${targets.join('\u0001')}`;

/** The same instances, in whatever order. */
export const cellFor = (rows: ValueRow[] | null | undefined, t: Pick<TriedValue, 'property' | 'targets'>): ValueCell | undefined => {
	const targets = new Set(t.targets);
	return rows?.find((r) => r.property === t.property)?.cells.find((c) => c.targets.length === targets.size && c.targets.every((k) => targets.has(k)));
};

const drawnValues = (rows: ValueRow[]): Map<string, string> =>
	new Map(rows.flatMap((r) => r.cells.map((c) => [triedId({ property: r.property, targets: c.targets }), c.value] as const)));

/**
 * Dark only when its stories drew it and it is not the same as light: a library DSNR cannot turn dark draws its light
 * twice, and nothing should offer a dark that changes nothing.
 */
export const shownMode = (rows: Record<Theme, ValueRow[] | null>, chosen: Theme): Theme => {
	if (chosen !== 'dark' || rows.dark === null) return 'light';
	if (rows.light === null) return 'dark';
	const light = drawnValues(rows.light);
	const dark = drawnValues(rows.dark);
	return dark.size !== light.size || [...dark].some(([id, value]) => light.get(id) !== value) ? 'dark' : 'light';
};

/** Whatever their order. */
export const sameTried = (a: TriedValue[], b: TriedValue[]): boolean => {
	const by = (tried: TriedValue[]) => JSON.stringify(tried.map((t) => [triedId(t), t.value, t.follows ?? '']).sort());
	return by(a) === by(b);
};

/** Found by its effect. `writes` is what saving it writes in place of `written`. */
export interface ValuePlace {
	file: string;
	line: number;
	written: string;
	writes: string;
}

/** `id` is a `triedId`. `said` is the agent's why; `agent` on a refusal says the agent can write it or follow the token. */
export type ValueSource =
	| { id: string; state: 'found'; places: ValuePlace[]; by?: 'agent'; said?: string }
	| { id: string; state: 'writing' }
	| { id: string; state: 'refused'; why: string; agent?: 'write' | 'follow' };

/** Found in the background as values are tried, newest only. `reach` is drawn as a token change is. */
export type ValueSources =
	{ state: 'none' } | { state: 'building' } | { state: 'failed'; error: string } | { state: 'ready'; values: ValueSource[]; reach: ChangeReach };

/**
 * `by` is the prop, or two props, that tell its values apart ("size"); null when the row has one value, or when no prop
 * explains the difference, in which case each cell is one distinct value.
 */
export interface ValueRow {
	property: ValueProperty;
	by: string | null;
	cells: ValueCell[];
}

/**
 * Read on the top element of each instance. `none-drawn`: a dialog opens elsewhere; `wraps`: each instance only wraps what
 * it is given (a tooltip). `rows` are null for a mode its stories did not draw.
 */
export type ComponentValues =
	| { state: 'no-component' }
	| { state: 'none-drawn' }
	| { state: 'wraps' }
	| { state: 'not-drawn' }
	| { state: 'failed'; error: string }
	| {
			state: 'read';
			instances: number;
			rows: Record<Theme, ValueRow[] | null>;
			/** Lengths no tag can be given (`em`, `%`): a length said to be its own may be one. */
			unmarked: number;
			/** Pixels per rem on the page drawn: what a token in rem is compared in. */
			rootPx?: number;
	  };

/** `pictures` by story file, as addresses on the app's local server; `drawing`: a pass that may replace them is running. */
export interface ComponentPictures {
	drawing: boolean;
	pictures: Record<string, string>;
	issues: Record<string, AccessibilityCounts>;
}

/** One model for all of them (`changeBranches.ts`); a hand-over's branch is made by Claude Code. */
export interface ChangeKinds {
	tokens: TokenEdit[];
	values: TriedValue[];
	voice: VoiceText;
	handOver: HandedChange;
}
export type ChangeKind = keyof ChangeKinds;
/** A hand-over's commits are Claude Code's. */
export type SavedKind = Exclude<ChangeKind, 'handOver'>;
export const CHANGE_KINDS: readonly ChangeKind[] = ['tokens', 'values', 'voice', 'handOver'];

/** `against`: the file's blob it was opened at (null: there was none). */
export interface VoiceText {
	text: string;
	against: string | null;
}

/** `lines`: the change in words, as its commits and pull request say it. `chromatic` once the library's CI has linked one. */
export interface ChangeBranch<C> {
	branch: string;
	saved: C;
	lines: string[];
	saves: number;
	pullRequest: { number: number; url: string; chromatic: string | null } | null;
}

/** A hand-over's carries its branch as DSNR read it from git now. */
export type ChangeBranchOf<K extends ChangeKind> = K extends 'handOver'
	? ChangeBranch<HandedChange> & { review: BranchReview }
	: ChangeBranch<ChangeKinds[K]>;

export interface TokenProblem {
	file: string;
	line?: number;
	reason: string;
}

/** `source` null: no way found them. */
export interface DesignTokens {
	source: string | null;
	tokens: DesignToken[];
	problems: TokenProblem[];
	looked: string[];
}

/** Storybook is the source of truth for what is a component, so a component with no stories is not one here either. */
export interface CatalogComponent {
	/** The story file's path from the library's root. */
	id: string;
	/** The last part of its Storybook title, or the file's name when the title cannot be read. */
	name: string;
	/** The first part of its Storybook title; `Ungrouped` when there is none. */
	group: string;
	subtitle: string | null;
	/** Its page in a Storybook (`?path=…`), from its title; null when the title cannot be read. */
	storybookPath: string | null;
	/** That page in the design system's hosted Storybook; null while its address is not known. */
	storybook: string | null;
	source: string;
}

export type StoryPreview =
	/** A story file's page is `base` with `?file=<its path>`. */
	{ state: 'ready'; base: string } | { state: 'no-packages'; root: string } | { state: 'failed'; error: string } | { state: 'no-library' };

export type CatalogUpdate =
	/** Ask again with `refresh` for its outcome. */
	| 'updating'
	| 'updated'
	| 'unchanged'
	/** The list is what was already here. */
	| { failed: string };

export type Catalog =
	/**
	 * `tokens` and `accessibility` (from the design system's own `.dsnr/manifest.md`, or the default) are read on the same
	 * commit.
	 */
	| {
			state: 'ready';
			branch: string;
			commit: string;
			/** The hand-over branch whose tip `commit` is, shown in place of `branch`; else null. */
			showing: string | null;
			committedAt: string;
			update: CatalogUpdate;
			components: CatalogComponent[];
			tokens: DesignTokens;
			accessibility: DeclaredTarget;
	  }
	| { state: 'none' }
	/** The one shown is connected, but its clone is not at `root`. */
	| { state: 'lost'; name: string; root: string }
	/** Another branch is never read instead. */
	| { state: 'no-branch'; root: string; branch: string };
