import type { Theme } from '../prototypeTheme';
import type { DeclaredTarget } from '../wcag';
import type { AccessibilityCounts, AccessibilityResult } from './accessibility';

/** A design system: the ones connected, their components, their tokens and a change to them. */

/**
 * A design system the person connected (P4 of the design system plan): a repository, the folder in it the design system
 * is (`''` for the whole repository), and the branch read, its default.
 */
export interface ConnectedDesignSystem {
	/** Its repository, and in a monorepo `:folder`: what the switcher and Remove name it by. */
	id: string;
	/** What it is called: its Storybook's brand title, else its package's name, else the repository's. */
	name: string;
	/** `owner/repo` on GitHub. */
	repository: string;
	/** Its clone on this computer. */
	root: string;
	folder: string;
	branch: string;
}

/** The design systems connected, and the one shown (its `id`, or null when none is). */
export interface ConnectedDesignSystems {
	systems: ConnectedDesignSystem[];
	current: string | null;
}

/** A place in a repository a design system is (decision 25): its folder, what it has, and what it is called. */
export interface FoundDesignSystem {
	folder: string;
	components: number;
	tokens: number;
	name: string;
}

/**
 * What a token's value is, which says how it is drawn: a color, a length, a font, a shadow, a duration, an easing curve, or a
 * plain number. Only the colors and lengths of Color, Spacing and Shape can be changed in the app (`isEditable`); the rest
 * are shown.
 */
export type TokenKind = 'color' | 'dimension' | 'font' | 'shadow' | 'duration' | 'easing' | 'number';

/**
 * A design token the library has (T1 of the design system plan), as read from its own files: what the Design System tab
 * shows, and what a change names (by `path`).
 */
export interface DesignToken {
	/** Its identity: `tone.pineGreen.50`, `palette.light.primary.main`, `spacing`, `radius`. */
	path: string;
	kind: TokenKind;
	/** Its tab in the tokens panel: `Color`, `Spacing`, `Shape`. A category the reader adds is a tab with no other change. */
	category: string;
	/** Where it is shown within its tab: `Tones`, `Light`, `Dark`, `Spacing`, `Radius`. */
	group: string;
	/** Its family or role (`pineGreen`, `primary`), and its step or variant (`50`, `main`). */
	set: string;
	name: string;
	/** A color as a hex (eight digits when it has an opacity), a dimension with its unit (`8px`). */
	value: string;
	/**
	 * The token it points at, when it is written as a pointer (a palette role's `pineGreen[50]`, a CSS `var(--ring)`, a
	 * token file's `{color.red.500}`), by that token's `path`, and the opacity written after it. Its `value` is then the
	 * pointed-at token's, with the opacity.
	 */
	ref?: { path: string; alpha?: string };
	/**
	 * The library's file and line it is read from. One a package declares, which a library's stylesheet imports (Phase 5.5),
	 * is read from that `@import`, and `from` says where the package declares it and in which rule (`:root`): a change to
	 * it is declared again in the library's stylesheet, in a rule of that kind.
	 */
	source: { file: string; line: number; from?: { file: string; line: number; rule: string } };
}

/**
 * What a token is changed to (T3, decision 19): pointed at another token (`ref`, its path, which keeps the link), or given
 * a value of its own (`value`: a color as a hex, a dimension with its unit), which replaces any pointer.
 */
export type TokenChange = { ref: string } | { value: string };

/** One token changed. A change is a list of these, one per token, and nothing else. */
export type TokenEdit = { path: string } & TokenChange;

/**
 * Which tokens a component draws with (T6, decision 29), found by drawing every story with every token tagged: each
 * token it uses and how often, the values it sets itself (not tokens), and how many of its colors are worked out from a
 * token rather than being one (a hover's darker shade). `sharedWith` is, for each token it uses, the other story files
 * that use it too. Asked for by story file; `building` the first time for a commit, while every story is drawn.
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
			/** What axe found in its stories, at the design system's target (T7); null when it could not be checked. */
			accessibility: AccessibilityResult | null;
			/** Its drawn values, by variant (Phase 1 of adjusting a component). */
			values: ComponentValues;
	  };

/** What is read of each instance a component's stories draw, in this order. */
export const VALUE_PROPERTIES = ['height', 'padding', 'radius', 'gap', 'fontSize', 'background', 'text', 'border'] as const;
export type ValueProperty = (typeof VALUE_PROPERTIES)[number];
/** The properties that are colours: read against the color tags, and shown with a swatch. */
export const COLOR_VALUES: ReadonlySet<ValueProperty> = new Set(['background', 'text', 'border']);

/**
 * What a drawn value is: a token's (`tokens` names it, or them for a value of several parts), the component's own,
 * worked out from a token (a hover's shade, a height that grows with a token's padding), partly a token (`tokens` names it)
 * and partly its own or worked out, or not checked (a kind of value no token is tagged for, such as a font size, or drawings that did not pair up).
 */
export type ValueKind = 'token' | 'own' | 'derived' | 'mixed' | 'unchecked';

/**
 * One value of a row: for one variant (`variant`, null when the row has one value for all), and how many instances draw it.
 * A colour that draws nothing (clear, or no border) is `none`.
 */
export interface ValueCell {
	variant: string | null;
	value: string;
	kind: ValueKind;
	tokens: string[];
	instances: number;
	/** The instances that draw it, by their keys: what a value tried in the preview is set on (Phase 2). */
	targets: string[];
	/**
	 * What it is drawn with, for each prop its row is told apart by (`by`): the prop's value, or null when it was drawn without
	 * it; one for each case it stands for (a cell drawn alike with a prop false and without it stands for both). None for a row
	 * told apart by no prop. What a picker of the variant shown is matched against (the inspector), beside the sentence.
	 */
	of?: Record<string, string | null>[];
}

/**
 * What a token change being tried does to one component (Phase 3 of adjusting a component): each value of its instances it
 * changes, in a mode, said as the Values are ("Radius · sm 8px → 12px", with how many instances), and whether its stories
 * draw differently where its values do not reach (`inside`: an inner part, such as an input's outline).
 */
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
 * What a token change being tried reaches (Phase 3), drawn on a build with the change, every story, light and dark, each
 * component against itself as the library has it: those that move, how many do not (in the stories drawn, never as a claim
 * about every use), and those that did not draw, of which nothing can be said. None while no token change is tried.
 */
export type ChangeReach =
	| { state: 'none' }
	| { state: 'building' }
	| { state: 'failed'; error: string }
	| { state: 'ready'; moved: ComponentReach[]; unchanged: number; notDrawn: string[] };

/**
 * A value tried on a component's instances in its stories (Phase 2 of adjusting a component): a property, the value as CSS
 * writes it, and the instances it is set on (a cell's `targets`). Tried in the preview alone: nothing is written or kept.
 */
export interface TriedValue {
	property: ValueProperty;
	value: string;
	targets: string[];
	/** A token this value is to follow, by its path, drawn as it is now (Phase 4.6): written by the agent, never tried as another. */
	follows?: string;
}

/** A design prop a component declares (Phase 5): its name, and every value it can take, in the order its type lists them. */
export interface DeclaredProp {
	name: string;
	values: (string | number | boolean)[];
}

/** Why a declared prop cannot be varied: it takes an object, a callback, content, or free text or a number. */
export type Unvaried = 'object' | 'callback' | 'content' | 'text' | 'number';

/**
 * A component drawn in every case its props declare (Phase 5): its design props and their values, its first story drawn
 * once with each, read as its values are (`values`, its rows told apart by those props); the props its story sets itself,
 * so drawing it with another value changes nothing (`fixed`); and the props that cannot be varied, with why. None when its
 * stories name no component whose props can be read; building while it is drawn.
 */
export type ComponentVariants =
	| { state: 'building' }
	| { state: 'failed'; error: string }
	| { state: 'none' }
	| { state: 'ready'; props: DeclaredProp[]; fixed: string[]; unvaried: { name: string; why: Unvaried }[]; values: ComponentValues };

/**
 * A hand-over branch as DSNR reads it from git (Process changes), against the base it was handed over on: not there; there with
 * nothing committed on it; made from another base (it does not contain the one recorded); or ready, with its commits, each file
 * changed (its lines added and removed, and why it is out of bounds, if it is), the lines in all, and whether it is large.
 * What Propose checks.
 */
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

/** What one unit's change is when it is handed to Claude Code: the token edits being tried, or one component's values tried. */
export type HandedChange = { edits: TokenEdit[] } | { tried: TriedValue[] };

/**
 * A unit of review handed to Claude Code (Process changes), as the panel shows it: the branch DSNR named for it, what was handed
 * over (each change as a line), the branch as DSNR read it from git, and its draft pull request once it is proposed.
 */
export interface HandoffBranch {
	branch: string;
	lines: string[];
	review: BranchReview;
	pullRequest: { number: number; url: string } | null;
}

/** Where a unit was handed over: its branch, and Claude Code in this window (`editor`), or the command that starts it in a terminal. */
export interface HandedOver {
	branch: string;
	editor: boolean;
	command: string | null;
}

/**
 * How many values a component's instances can be tried with at once, as the core takes them and the extension keeps them:
 * far beyond any tab's, short of anything that could hurt.
 */
export const MOST_TRIED = 50;

/** What names a value tried: its property and the instances it is for, the same in light and in dark, in the tab and the app. */
export const triedId = ({ property, targets }: { property: ValueProperty; targets: string[] }): string =>
	`${property}\u0000${targets.join('\u0001')}`;

/** The cell of a component's values a value tried is of: its property's, on the same instances, in whatever order. */
export const cellFor = (rows: ValueRow[] | null | undefined, t: Pick<TriedValue, 'property' | 'targets'>): ValueCell | undefined => {
	const targets = new Set(t.targets);
	return rows?.find((r) => r.property === t.property)?.cells.find((c) => c.targets.length === targets.size && c.targets.every((k) => targets.has(k)));
};

/** Each value a component's rows draw, by what names it (`triedId`): how one mode's values are told from another's. */
const drawnValues = (rows: ValueRow[]): Map<string, string> =>
	new Map(rows.flatMap((r) => r.cells.map((c) => [triedId({ property: r.property, targets: c.targets }), c.value] as const)));

/**
 * The mode a component's values are shown in (MODES_PLAN Phase 1): the one chosen, but dark only when its stories drew it and
 * it is not the same as light. A library DSNR cannot turn dark draws its light twice, so it is shown in light, and nothing
 * offers a dark that changes nothing.
 */
export const shownMode = (rows: Record<Theme, ValueRow[] | null>, chosen: Theme): Theme => {
	if (chosen !== 'dark' || rows.dark === null) return 'light';
	if (rows.light === null) return 'dark';
	const light = drawnValues(rows.light);
	const dark = drawnValues(rows.dark);
	return dark.size !== light.size || [...dark].some(([id, value]) => light.get(id) !== value) ? 'dark' : 'light';
};

/** Whether two sets of values tried are the same change, whatever their order: each value, on the same instances. */
export const sameTried = (a: TriedValue[], b: TriedValue[]): boolean => {
	const by = (tried: TriedValue[]) => JSON.stringify(tried.map((t) => [triedId(t), t.value, t.follows ?? '']).sort());
	return by(a) === by(b);
};

/**
 * A place in the library's source where a tried value is written (Phase 4 of adjusting a component), found by its effect:
 * the file and line, what is written there, and what saving it writes in its place.
 */
export interface ValuePlace {
	file: string;
	line: number;
	written: string;
	writes: string;
}

/**
 * Where one tried value (`id`, `triedId`) is written: found where it is (`places`), or written by the agent (`by`, with what
 * it said of why); being written by the agent; or why it cannot be saved, in words, and, when the agent can write it, that
 * it can (`agent`: write it; follow the token).
 */
export type ValueSource =
	| { id: string; state: 'found'; places: ValuePlace[]; by?: 'agent'; said?: string }
	| { id: string; state: 'writing' }
	| { id: string; state: 'refused'; why: string; agent?: 'write' | 'follow' };

/**
 * Where the values tried on a component's instances are written, found in the background as they are tried, newest only:
 * each value's places, or why it cannot be saved, and what writing every one found reaches, drawn as a change to the tokens
 * is (Phase 3), which is also how each is read back. None while nothing is tried.
 */
export type ValueSources =
	{ state: 'none' } | { state: 'building' } | { state: 'failed'; error: string } | { state: 'ready'; values: ValueSource[]; reach: ChangeReach };

/**
 * One property's values across the instances drawn. `by` is the prop, or two props, that tell its values apart ("size"),
 * so each cell is one of its values; null when the row has one value, or when no prop explains the difference, in which
 * case each cell is one distinct value.
 */
export interface ValueRow {
	property: ValueProperty;
	by: string | null;
	cells: ValueCell[];
}

/**
 * A component's drawn values (Phase 1 of adjusting a component), measured on the top element of each instance of the
 * component its stories draw, in light: found by the stories' own `component` (their default export's). Or why there are
 * none: the file names no component; its stories draw none of it on the page (one that opens elsewhere, as a dialog does,
 * is not on it); each instance only wraps what it is given (a tooltip around a button), so what draws is not its own; the
 * file, or the stories that would have drawn it, did not draw; or reading it failed, said with why. `rows` are its values in
 * light and in dark, null for a mode its stories did not draw. `unmarked` is how many of the design system's lengths no tag
 * can be given (in `em` or `%`), so a length said to be its own may be one of them.
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
			unmarked: number;
			/** How many pixels a rem is on the page drawn (16 unless the library sets another): what a token in rem is compared in. */
			rootPx?: number;
	  };

/**
 * The pictures of the shown design system's components, for the grid view (P5): each component's picture by its story
 * file, an address on the app's local server, none for one without; and whether a pass that may replace them is drawing.
 */
export interface ComponentPictures {
	drawing: boolean;
	pictures: Record<string, string>;
	/** What each card says of its component's accessibility (T7): how many issues to fix, and how many to review. */
	issues: Record<string, AccessibilityCounts>;
}

/**
 * Where a change to the tokens is kept (T4 and T5): a branch of the library DSNR made for it, each save one commit on it,
 * and the draft pull request it is proposed in once it is.
 */
/** A change kept on a branch of DSNR's: the branch, the change as last saved and how many saves, its draft pull request and Chromatic's build of it once the library's CI has linked one. */
export interface ChangeBranch<C> {
	branch: string;
	saved: C;
	saves: number;
	pullRequest: { number: number; url: string; chromatic: string | null } | null;
}

/** A change to the tokens on its branch, always `dsnr/tokens-…`: DSNR writes to no other. */
export type TokenBranch = ChangeBranch<TokenEdit[]>;

/** The values tried on a component's instances, written where they are found, on their branch, always `dsnr/values-…` (Phase 4). */
export type ValueBranch = ChangeBranch<TriedValue[]>;

/** Something in the library's token files that is not read, with where it is. */
export interface TokenProblem {
	file: string;
	line?: number;
	reason: string;
}

/** The library's tokens, how they were found (`null`: no way found them), what was not read, and where it looked. */
export interface DesignTokens {
	source: string | null;
	tokens: DesignToken[];
	problems: TokenProblem[];
	looked: string[];
}

/**
 * A component as the library's Storybook has it: one story file, named and grouped by its Storybook title. Storybook is
 * the source of truth for what is a component, so a component with no stories is not one here either.
 */
export interface CatalogComponent {
	/** The story file, from the library's root (`src/components/FSButton/FSButton.stories.tsx`): its identity. */
	id: string;
	/** The last part of its Storybook title (`FSButton`), or the file's name when the title cannot be read. */
	name: string;
	/** The first part of its Storybook title (`Buttons`); `Ungrouped` when there is none. */
	group: string;
	subtitle: string | null;
	/** Its docs page on the hosted Storybook, or null without a title or a hosted Storybook. */
	storybook: string | null;
	/** Its folder on GitHub, on the branch the tab reads. */
	source: string;
}

/** The previews of the library's stories, built from its branch (DESIGN_SYSTEM.md, P1). */
export type StoryPreview =
	/** Built: a story file's page is `base` with `?file=<its path>`. */
	| { state: 'ready'; base: string }
	/** The clone has no packages installed to build from. */
	| { state: 'no-packages'; root: string }
	| { state: 'failed'; error: string }
	/** No library connected or found. */
	| { state: 'no-library' };

/** How the library's branch was brought up to date for this read. */
export type CatalogUpdate =
	/** A fetch is running; ask again with `refresh` for its outcome. */
	| 'updating'
	| 'updated'
	| 'unchanged'
	/** The fetch did not work, said in words; the list is what was already here. */
	| { failed: string };

/** The Design System tab's list: the component library as its branch has it on GitHub, or why there is none. */
export type Catalog =
	/**
	 * `tokens`: the library's, read on the same commit (`DesignTokens`). `accessibility`: the target the design system
	 * declares in its own `.dsnr/manifest.md`, on the same commit, or the default, informational (T7).
	 */
	| {
			state: 'ready';
			branch: string;
			commit: string;
			/** The branch handed to Claude Code whose tip `commit` is, shown in place of `branch` (Preview this branch); else null. */
			showing: string | null;
			committedAt: string;
			update: CatalogUpdate;
			components: CatalogComponent[];
			tokens: DesignTokens;
			accessibility: DeclaredTarget;
	  }
	/** No design system is connected. */
	| { state: 'none' }
	/** The one shown is connected, but its clone is no longer at `root`. */
	| { state: 'lost'; name: string; root: string }
	/** A clone with no copy of its design system's branch from GitHub to read. Another branch is never read instead. */
	| { state: 'no-branch'; root: string; branch: string };
