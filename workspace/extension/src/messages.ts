import type { Context } from '../../src/core/services/projects/findContext';
import type { SetupState } from '../../src/core/services/projects/setUp';
import { type Catalog, INVOKE, type InvokeName, type Result, sameTried } from '../../src/shared/contract';
import { sameChange } from '../../src/shared/tokens';
import type { TokenEdit, TriedValue } from '../../src/shared/domain/designSystem';
import type { Project } from '../../src/shared/domain/projects';
import { DEFAULT_THEME, type Theme } from '../../src/shared/prototypeTheme';
import { PROJECT_ID, hasExactly } from '../../src/shared/validate';
import { savedVersions, workLabel } from '../../src/shared/work';

/**
 * Signing in is VS Code's, from its title bar, so a page cannot ask for it. The page is the extension's own, but what it
 * sends is still checked.
 */
export interface PageAsks {
	chooseDesignSystem(): Promise<Result<null>>;
	getStarted(): Promise<Result<null>>;
	/** Hands the open repository that is not set up to the person's agent, to set it up. */
	setUp(): Promise<Result<null>>;
	/** Asked of the extension, which knows whether one can be started. */
	askNewPrototype(): Promise<Result<null>>;
	newPrototype(title: string, task: string, folder: string | null): Promise<Result<null>>;
	codebase(action: CodebaseAction, projectId: string): Promise<Result<null>>;
	/** The four that follow name the project only: its newest version is found as it is when this is asked, not as the list shows it. */
	openReview(projectId: string): Promise<Result<null>>;
	openReviewInBrowser(projectId: string): Promise<Result<null>>;
	copyReviewLink(projectId: string): Promise<Result<null>>;
	openReviewPublished(projectId: string): Promise<Result<null>>;
	openComponent(id: string): Promise<Result<null>>;
	componentLink(id: string, link: ComponentLink): Promise<Result<null>>;
	openPrimitives(): Promise<Result<null>>;
	openVoiceAndTone(): Promise<Result<null>>;
	openLibrarySource(file: string, line: number): Promise<Result<null>>;
	openChanges(): Promise<Result<null>>;
	setTokenEdits(edits: TokenEdit[]): Promise<Result<null>>;
	setMode(mode: Theme): Promise<Result<null>>;
	setValueTrial(file: string, commit: string, values: TriedValue[]): Promise<Result<null>>;
	syncDesignSystem(): Promise<Result<null>>;
	/** The person chooses the agent work goes to, whatever is kept. */
	chooseAgent(): Promise<Result<null>>;
}

export const ASKS = [
	'chooseDesignSystem',
	'getStarted',
	'setUp',
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
	'chooseAgent',
] as const satisfies readonly (keyof PageAsks)[];
export type AskName = (typeof ASKS)[number];
// Fails the typecheck when an ask of `PageAsks` is not in the table.
const everyAsk: Exclude<keyof PageAsks, AskName> extends never ? true : never = true;
void everyAsk;

export type PanelMessage = { type: 'call'; id: number; name: InvokeName | AskName; args: unknown[] } | { type: 'ready' };

export const asksOver = (invoke: (name: AskName, args: unknown[]) => Promise<unknown>): PageAsks =>
	Object.fromEntries(ASKS.map((name) => [name, (...args: unknown[]) => invoke(name, args)])) as unknown as PageAsks;

export const COMPONENT_LINKS = ['storybook', 'source'] as const;
export type ComponentLink = (typeof COMPONENT_LINKS)[number];

export type DesignTab = { kind: 'component'; id: string; name: string } | { kind: 'primitives' };

/** The page names the project only; the extension finds the work, and where it is, itself. */
export const CODEBASE_ACTIONS = ['hand-off', 'update', 'share', 'open-code', 'run-locally'] as const;
export type CodebaseAction = (typeof CODEBASE_ACTIONS)[number];

export interface Review {
	projectId: string;
	name: string;
	title: string;
}

/** Newest first: the panel's row opens the first. */
export const reviewsOf = (project: Pick<Project, 'id' | 'title' | 'work'>): Review[] =>
	savedVersions(project.work).map((i) => ({ projectId: project.id, name: i.name, title: `${project.title} · ${workLabel(i)}` }));

/**
 * Kept with the library's commit they were tried on: instances are named by that commit's drawing, so a page on another
 * commit leaves them be.
 */
export type ValueTrials = Record<string, { commit: string; values: TriedValue[] }>;

export interface TabsShown {
	projects: string[];
	components: string[];
}

export const NO_TABS_SHOWN: TabsShown = { projects: [], components: [] };

export const sameTabs = (a: TabsShown, b: TabsShown): boolean =>
	a.projects.join('\n') === b.projects.join('\n') && a.components.join('\n') === b.components.join('\n');

export interface Placed {
	context: Context | null;
	unreadable: string | null;
	/** Where setting the open repository up stands (`setupState`). */
	setup: SetupState;
}

/** `catalog` is null while it is first read. */
export interface CatalogState {
	system: { id: string; name: string } | null;
	catalog: Catalog | null;
	error: string | null;
	syncing: boolean;
}

/** A new one is a line here, its start in `SHARED_START`, and the extension's `share`. */
export interface SharedValues {
	placed: Placed;
	tabs: TabsShown;
	tokenEdits: TokenEdit[];
	mode: Theme;
	valueTrials: ValueTrials;
	catalog: CatalogState;
	/** The agent work goes to now; null while it is still to be asked. */
	agent: { name: string | null };
}
export type SharedName = keyof SharedValues;

/** The same object when nothing changes, so it tells nobody (`Shared`). */
export const withTrial = (trials: ValueTrials, file: string, commit: string, values: TriedValue[]): ValueTrials => {
	const was = trials[file];
	if (values.length === 0 ? was === undefined : was?.commit === commit && sameTried(was.values, values)) return trials;
	const { [file]: _gone, ...rest } = trials;
	return values.length === 0 ? rest : { ...rest, [file]: { commit, values } };
};

/**
 * Token edits in another order count as the same; values without a rule here, only when identical. One rule, for the
 * extension that tells it and the page that hears it.
 */
const SAME: { [K in SharedName]?: (a: SharedValues[K], b: SharedValues[K]) => boolean } = { tokenEdits: sameChange, tabs: sameTabs };
export const sameShared = <K extends SharedName>(name: K, a: SharedValues[K], b: SharedValues[K]): boolean =>
	((SAME[name] as ((x: SharedValues[K], y: SharedValues[K]) => boolean) | undefined) ?? Object.is)(a, b);

export const SHARED_START: SharedValues = {
	placed: { context: null, unreadable: null, setup: null },
	tabs: NO_TABS_SHOWN,
	tokenEdits: [],
	mode: DEFAULT_THEME,
	valueTrials: {},
	catalog: { system: null, catalog: null, error: null, syncing: false },
	agent: { name: null },
};

export type HostMessage =
	| { type: 'answer'; id: number; result: unknown }
	| { type: 'event'; name: string; payload: unknown }
	| { [K in SharedName]: { type: 'shared'; name: K; value: SharedValues[K] } }[SharedName]
	| { type: 'projects-changed' }
	| { type: 'open-dialog'; dialog: PanelDialog };

export type PanelDialog =
	| { kind: 'new' }
	| { kind: 'assign'; projectId: string }
	| { kind: 'rename'; projectId: string }
	/** `error`: why the last try was refused, when it is opened again to say so. */
	| { kind: 'delete'; projectId: string; error?: string }
	| { kind: 'build'; projectId: string }
	| { kind: 'hand-off'; projectId: string }
	| { kind: 'update'; projectId: string }
	| { kind: 'account' }
	| { kind: 'sync' }
	| { kind: 'changes' };

const CALLS = new Set<string>([...INVOKE, ...ASKS]);

/** More is not what a person wrote in a box. */
export const LIMITS = { title: 300, task: 4000, folder: 100 };

/** Only the envelope: what each call carries is checked where it is answered. */
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

export const isAsk = (name: string): name is AskName => (ASKS as readonly string[]).includes(name);

export const readProjectArg = (raw: unknown): string | null => {
	const id = typeof raw === 'object' && raw !== null ? (raw as { projectId?: unknown }).projectId : undefined;
	return typeof id === 'string' && PROJECT_ID.test(id) ? id : null;
};
