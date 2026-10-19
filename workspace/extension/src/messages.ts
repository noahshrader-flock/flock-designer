import type { Context } from '../../src/core/services/projects/findContext';
import { type Catalog, INVOKE, type InvokeName, type Result } from '../../src/shared/contract';
import type { TokenEdit, TriedValue } from '../../src/shared/domain/designSystem';
import type { Project } from '../../src/shared/domain/projects';
import { DEFAULT_THEME, type Theme } from '../../src/shared/prototypeTheme';
import { PROJECT_ID, hasExactly } from '../../src/shared/validate';
import { workLabel, workOf } from '../../src/shared/work';

/**
 * What a DSNR page (the panel, a design system's tab) asks of the extension itself, beside the core's calls: one table, as
 * the core's contract is, each answered by one handler with its arguments checked first (`asks.ts`, the core's `handle`).
 * Signing in is VS Code's, from its title bar, so a page cannot ask for it. The page is the extension's own, but what it
 * sends is still read as the app reads what its window sends.
 */
export interface PageAsks {
	locateDesignSystem(): Promise<Result<null>>;
	getStarted(): Promise<Result<null>>;
	/** Asked of the extension, which knows whether one can be started, and opens the New dialog (`open-dialog`) if so. */
	askNewPrototype(): Promise<Result<null>>;
	newPrototype(title: string, task: string, folder: string | null): Promise<Result<null>>;
	codebase(action: CodebaseAction, projectId: string): Promise<Result<null>>;
	openReview(review: Review): Promise<Result<null>>;
	openReviewInBrowser(review: Review): Promise<Result<null>>;
	copyReviewLink(review: Review): Promise<Result<null>>;
	openReviewPublished(review: Review): Promise<Result<null>>;
	/** A component's tab, by its story file, and its links, which the extension finds itself. */
	openComponent(id: string): Promise<Result<null>>;
	componentLink(id: string, link: ComponentLink): Promise<Result<null>>;
	openPrimitives(): Promise<Result<null>>;
	openVoiceAndTone(): Promise<Result<null>>;
	/** A file of the design system at its line: a token's, or where a value is written. */
	openLibrarySource(file: string, line: number): Promise<Result<null>>;
	/** The panel's Changes, asked for from a component's tab. */
	openChanges(): Promise<Result<null>>;
	/** The change to the tokens being tried, which the extension keeps for every DSNR page (`Shared`). */
	setTokenEdits(edits: TokenEdit[]): Promise<Result<null>>;
	/** The mode components are shown in (MODES_PLAN Phase 1), which the extension keeps for every page. */
	setMode(mode: Theme): Promise<Result<null>>;
	/**
	 * The values tried on one component, on the library's commit they were tried on (the changes being tried,
	 * DESIGN_SYSTEM.md), which the extension keeps for every page.
	 */
	setValueTrial(file: string, commit: string, values: TriedValue[]): Promise<Result<null>>;
	/** The design system read again, asking GitHub for changes first (Sync, and a tab's Try again). */
	syncDesignSystem(): Promise<Result<null>>;
}

/** Every ask a page can make, by name: what pages build their asks from (`asksOver`), and what the extension answers. */
export const ASKS = [
	'locateDesignSystem',
	'getStarted',
	'askNewPrototype',
	'newPrototype',
	'codebase',
	'openReview',
	'openReviewInBrowser',
	'copyReviewLink',
	'openReviewPublished',
	'openComponent',
	'componentLink',
	'openPrimitives',
	'openVoiceAndTone',
	'openLibrarySource',
	'openChanges',
	'setTokenEdits',
	'setMode',
	'setValueTrial',
	'syncDesignSystem',
] as const satisfies readonly (keyof PageAsks)[];
export type AskName = (typeof ASKS)[number];
// Fails the typecheck when an ask of `PageAsks` is not in the table.
const everyAsk: Exclude<keyof PageAsks, AskName> extends never ? true : never = true;
void everyAsk;

/** What a page sends: a call by its name (the core's, or an ask of the extension's), answered by its id; or that it listens. */
export type PanelMessage = { type: 'call'; id: number; name: InvokeName | AskName; args: unknown[] } | { type: 'ready' };

/** The calls a page builds from the table, made as the core's are: `invoke` sends one by its name. */
export const asksOver = (invoke: (name: AskName, args: unknown[]) => Promise<unknown>): PageAsks =>
	Object.fromEntries(ASKS.map((name) => [name, (...args: unknown[]) => invoke(name, args)])) as unknown as PageAsks;

/** A component's links, which the extension finds for it from the catalog: its docs on Storybook, and its source on GitHub. */
export const COMPONENT_LINKS = ['storybook', 'source'] as const;
export type ComponentLink = (typeof COMPONENT_LINKS)[number];

/** A design system's tab in VS Code's editor, as its page is told it: a component's, by its story file, or Primitives. */
export type DesignTab = { kind: 'component'; id: string; name: string } | { kind: 'primitives' };

/**
 * What can be done with a project's codebase work from the panel: Handoff, its draft pull request (from the
 * Hand off dialog once a handoff found the work ready: never a menu item), the work on GitHub, and the work run on this
 * machine in the browser (Run locally). The page names the
 * project only; the extension finds the work, and where it is, itself.
 */
export const CODEBASE_ACTIONS = ['hand-off', 'share', 'open-code', 'run-locally'] as const;
export type CodebaseAction = (typeof CODEBASE_ACTIONS)[number];

/** A prototype to open for review: its project, its name, and the title its tab is given. */
export interface Review {
	projectId: string;
	name: string;
	title: string;
}

/**
 * A project's prototypes that have a review page, newest first, as opening one asks: the panel's row opens the first, and
 * DSNR: Open a prototype for review offers them all.
 */
export const reviewsOf = (project: Pick<Project, 'id' | 'title' | 'work'>): Review[] =>
	workOf(project.work, 'prototype').map((i) => ({ projectId: project.id, name: i.name, title: `${project.title} · ${workLabel(i)}` }));

/**
 * The values tried on each component, by its story file, with the library's commit they were tried on: its instances are
 * named by that commit's drawing, so a page on another commit leaves them be (the changes being tried, DESIGN_SYSTEM.md).
 */
export type ValueTrials = Record<string, { commit: string; values: TriedValue[] }>;

/** The tabs in front in the editor: the projects whose review is, and the design system's components whose tab is. */
export interface TabsShown {
	projects: string[];
	components: string[];
}

/** None in front: how every page starts, until the extension says otherwise. */
export const NO_TABS_SHOWN: TabsShown = { projects: [], components: [] };

/** Whether two say the same tabs are in front, in the same order. */
export const sameTabs = (a: TabsShown, b: TabsShown): boolean =>
	a.projects.join('\n') === b.projects.join('\n') && a.components.join('\n') === b.components.join('\n');

/** What is open, as the panel shows it, and why its design system cannot be read when it cannot (`showFound`). */
export interface Placed {
	context: Context | null;
	unreadable: string | null;
}

/**
 * The design system shown, as every page reads it: which it is, its catalog (null while it is first read), what went
 * wrong reading it, and whether a Sync is asking GitHub. Read by the extension, once for every page (`CatalogShare`), so
 * the panel and each tab show the same commit, and an open tab follows a Sync.
 */
export interface CatalogState {
	system: { id: string; name: string } | null;
	catalog: Catalog | null;
	error: string | null;
	syncing: boolean;
}

/**
 * The values every DSNR page shows the same, kept by the extension (`Shared`) and told to every page whenever one changes,
 * and to a page once it listens: one message for each (`shared`), one provider and one hook on the page (`useShared`).
 * A new one is a line here, its start below, and the extension's `share`.
 */
export interface SharedValues {
	placed: Placed;
	/** Which tabs of the editor are in front, as the panel marks them. */
	tabs: TabsShown;
	/** The change to the tokens being tried. */
	tokenEdits: TokenEdit[];
	/** The mode components are shown in (MODES_PLAN Phase 1). */
	mode: Theme;
	/** The values tried on every component. */
	valueTrials: ValueTrials;
	catalog: CatalogState;
}
export type SharedName = keyof SharedValues;

/** What a page shows until the extension has told it each. */
export const SHARED_START: SharedValues = {
	placed: { context: null, unreadable: null },
	tabs: NO_TABS_SHOWN,
	tokenEdits: [],
	mode: DEFAULT_THEME,
	valueTrials: {},
	catalog: { system: null, catalog: null, error: null, syncing: false },
};

/**
 * What the extension sends a page: an answer to a call, by its id; an event of the core's; a shared value (`shared`); that
 * the projects changed (one was made), so the list is read again; or to open one of the panel's dialogs (`Panels.show`).
 */
export type HostMessage =
	| { type: 'answer'; id: number; result: unknown }
	| { type: 'event'; name: string; payload: unknown }
	| { [K in SharedName]: { type: 'shared'; name: K; value: SharedValues[K] } }[SharedName]
	| { type: 'projects-changed' }
	| { type: 'open-dialog'; dialog: PanelDialog };

/** The dialogs the panel has: each is opened for what it is about, by the panel or by the extension (`open-dialog`). */
export type PanelDialog =
	| { kind: 'new' }
	| { kind: 'assign'; projectId: string }
	| { kind: 'build'; projectId: string }
	| { kind: 'hand-off'; projectId: string }
	// Not about a project: the GitHub account's Sign out, and the sync's what is held back and Sync now.
	| { kind: 'account' }
	| { kind: 'sync' }
	// Every change being tried, the tokens and each component's, with their branches: asked for from a component's tab too.
	| { kind: 'changes' };

const CALLS = new Set<string>([...INVOKE, ...ASKS]);

/** The most a name, what a prototype explores, and a folder's name may be: more is not what a person wrote in a box. */
export const LIMITS = { title: 300, task: 4000, folder: 100 };

/** The message, or null for anything that is not one exactly: what each call carries is checked where it is answered. */
export const readMessage = (raw: unknown): PanelMessage | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const m = raw as Record<string, unknown>;
	if (m.type === 'ready') return hasExactly(m, ['type']) ? { type: 'ready' } : null;
	return m.type === 'call' &&
		hasExactly(m, ['type', 'id', 'name', 'args']) &&
		typeof m.id === 'number' &&
		Number.isSafeInteger(m.id) &&
		m.id > 0 &&
		typeof m.name === 'string' &&
		CALLS.has(m.name) &&
		Array.isArray(m.args)
		? { type: 'call', id: m.id, name: m.name as InvokeName | AskName, args: m.args }
		: null;
};

/** Whether a call is one of the extension's own asks, not the core's. */
export const isAsk = (name: string): name is AskName => (ASKS as readonly string[]).includes(name);

/** The project a command was given, from a row's right-click menu (its `data-vscode-context`), or null. */
export const readProjectArg = (raw: unknown): string | null => {
	const id = typeof raw === 'object' && raw !== null ? (raw as { projectId?: unknown }).projectId : undefined;
	return typeof id === 'string' && PROJECT_ID.test(id) ? id : null;
};
