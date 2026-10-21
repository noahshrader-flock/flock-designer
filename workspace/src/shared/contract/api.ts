import type { SignInState } from '../domain/account';
import type { Checkout, PreviewStatus, RunLogLine } from '../domain/checkout';
import type { CommentAnchor, CommentRef, ReviewComment } from '../domain/comments';
import type {
	Catalog,
	ComponentPictures,
	ChangeReach,
	EditedInCode,
	SplitPreview,
	SplitProposal,
	ComponentTokens,
	TokenUsers,
	ConnectedDesignSystems,
	StoryPreview,
	TokenEdit,
	TriedValue,
	ComponentVariants,
	ChangeBranchOf,
	ChangeKind,
	ChangeKinds,
	HandedChange,
	SavedKind,
	HandedOver,
	ValueSources,
} from '../domain/designSystem';
import type {
	BaseBehind,
	BranchAgainstBase,
	Handed,
	StartedPrototype,
	MadeCover,
	BuildInCodebasePlan,
	OpenedPrototype,
	PageStatus,
	Project,
	HandedComment,
	HandoffResult,
	PrototypeReadiness,
} from '../domain/projects';
import type { PublishStatus, ShareStatus } from '../domain/publishing';
import type { VoiceAndTone } from '../domain/voice';

/**
 * No generic `invoke(channel, args)` and no shell: a capability a page has no method for is one it does not have, and
 * adding one is a deliberate edit to this file.
 */

/** Carries its failure instead of throwing across the bridge, where an exception arrives as a string with no shape. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WorkspaceApi {
	/** Only a checkout already opened: it never trusts a folder the window names. */
	readCheckout(root: string): Promise<Result<Checkout>>;

	/** The branches with the DSNR setup, which codebase work can start from. */
	branchesWithSetup(root: string): Promise<Result<string[]>>;
	/**
	 * Without `refresh` it answers at once with what the clone already has and starts bringing the branch up to date; with
	 * it, it waits for that. Nothing in the clone's branches or files is changed.
	 */
	designSystemCatalog(refresh: boolean): Promise<Result<Catalog>>;
	designSystems(): Promise<Result<ConnectedDesignSystems>>;
	/** Built once per commit; waits for the build. `edits` are built in, written nowhere. */
	storyPreview(edits: TokenEdit[]): Promise<Result<StoryPreview>>;
	/** `building` while every story is drawn, the first time. */
	componentTokens(file: string): Promise<Result<ComponentTokens>>;
	/** `building` while every story is drawn. */
	tokenUsers(path: string): Promise<Result<TokenUsers>>;
	/** `building` while it is drawn. */
	changeReach(edits: TokenEdit[]): Promise<Result<ChangeReach>>;
	/** Read from the person's checkout each time; nothing in it is written. */
	editedInCode(): Promise<Result<EditedInCode>>;
	/** What those edits move, drawn as `changeReach` draws a token change; `building` while it is drawn. */
	editedReach(): Promise<Result<ChangeReach>>;
	/** The pull requests a split of those edits would make, and how far their check is; nothing is made. */
	splitPreview(): Promise<Result<SplitPreview>>;
	/** Starts checking, in the background, that each builds on what it stands on, in a copy: never in a repository. */
	checkSplit(): Promise<Result<null>>;
	stopSplitCheck(): Promise<Result<null>>;
	/**
	 * Makes a branch and a draft for each part of the split checked (`seen`), each on the one it stands on; refused for one
	 * edited since. `confirmed` sends one not shown to build, or large, on purpose. Asked again, it opens what is left.
	 */
	proposeSplit(seen: string, confirmed: boolean): Promise<Result<SplitProposal>>;
	/** What is proposed, and what each draft has that DSNR did not put there; null once none is open. */
	splitProposal(): Promise<Result<SplitProposal | null>>;
	/** Forgotten here, a branch never pushed removed; what is on GitHub stays. */
	startSplitOver(): Promise<Result<null>>;
	/** Every case its declared props give; `building` while it is drawn. */
	componentVariants(file: string): Promise<Result<ComponentVariants>>;
	valueSources(file: string, tried: TriedValue[]): Promise<Result<ValueSources>>;
	/**
	 * `file` null is the tokens. Refused, in words, on a checkout with unfinished work or with a branch of the unit's in
	 * play.
	 */
	handOverChanges(file: string | null, change: HandedChange): Promise<Result<HandedOver>>;
	/**
	 * Shows a unit's hand-over branch at its tip in place of the library's, once it is read ready from git. While it is
	 * shown, nothing is saved or handed over.
	 */
	showHandOver(file: string | null): Promise<Result<null>>;
	showLibraryBranch(): Promise<Result<null>>;
	/** Null: the library's own. */
	onLibraryShown(listener: (showing: string | null) => void): () => void;
	/** Done by the agent; what it wrote is in `valueSources`. */
	writeValue(file: string, value: TriedValue): Promise<Result<null>>;
	componentPictures(): Promise<Result<ComponentPictures>>;
	/**
	 * `scope`: a component's story file, or null for the design system whole. Null when none is kept, its branch is gone,
	 * or its pull request was merged or closed (then it is forgotten).
	 */
	changeBranch<K extends ChangeKind>(kind: K, scope: string | null): Promise<Result<ChangeBranchOf<K> | null>>;
	/** The design system whole is an empty scope. */
	changeScopes(kind: ChangeKind): Promise<Result<string[]>>;
	/**
	 * One commit, nothing checked out; pushed once proposed. Refused while another branch is shown, and for voice and tone
	 * when the file on the library's branch is not the one it was opened at.
	 */
	saveChange<K extends SavedKind>(kind: K, scope: string | null, change: ChangeKinds[K]): Promise<Result<ChangeBranchOf<K>>>;
	/**
	 * A hand-over's only at `seen.tip`, the commit the person looked at, and one the rules flag only when `seen.confirmed`;
	 * other kinds take null. Refused while another branch is shown.
	 */
	proposeChange<K extends ChangeKind>(
		kind: K,
		scope: string | null,
		seen: { tip: string; confirmed: boolean } | null,
	): Promise<Result<ChangeBranchOf<K>>>;
	/** The branch and any pull request stay. */
	forgetChange(kind: ChangeKind, scope: string | null): Promise<Result<null>>;
	/** Read after bringing the library's branch up to date. */
	voiceAndTone(): Promise<Result<VoiceAndTone>>;
	/** The install command the repository declares (`install`), and nothing else. */
	installPackages(root: string): Promise<Result<null>>;
	cancelInstall(): Promise<Result<null>>;
	onInstallLine(listener: (line: string) => void): () => void;
	stopCommand(root: string, commandId: string): Promise<Result<PreviewStatus>>;
	onRunLog(listener: (line: RunLogLine) => void): () => void;
	onPreviewStatus(listener: (status: PreviewStatus) => void): () => void;

	publishStatus(): Promise<Result<PublishStatus>>;
	/** Never needed: publishing happens by itself. */
	publishNow(): Promise<Result<PublishStatus>>;
	onPublishStatus(listener: (status: PublishStatus) => void): () => void;

	/** Resolves at once; progress arrives through `onShareStatus`, because the build takes minutes. */
	shareWork(root: string, projectId: string, name: string): Promise<Result<ShareStatus>>;
	onShareStatus(listener: (status: ShareStatus) => void): () => void;

	/**
	 * `from`: a repository on this machine and a branch to model the page on. `folder` applies to a new project only; one
	 * that has a brief already stays where it is.
	 */
	createPrototype(
		projectId: string,
		title: string,
		note: string,
		from?: { root: string; branch: string },
		folder?: string | null,
	): Promise<Result<StartedPrototype>>;
	/** Starts fetching the branch the checkout is on, for New: nothing waits on it, and it never fails. */
	warmPrototypeBase(root: string): Promise<Result<null>>;
	/** How far the version's base is behind the latest of its branch; null when that cannot be told here. */
	prototypeBehind(projectId: string, name: string): Promise<Result<BaseBehind | null>>;
	/** Moves the version's base to the latest of its branch and hands its rebuild on it to the agent, in place. */
	handPrototypeRefresh(root: string, projectId: string, name: string): Promise<Result<Handed>>;
	/** Nothing is saved or checked here: the prototype is saved when opened. */
	handPrototypeBuild(root: string, projectId: string, name: string, request: string): Promise<Result<Handed>>;
	/** Hands one comment to the agent, as a build is handed. Nothing is recorded until its change is built: see `saveBuilt`. */
	handPrototypeAddress(root: string, projectId: string, name: string, comment: CommentRef, newVersion: boolean): Promise<Result<HandedComment>>;
	publishedPage(projectId: string, name: string): Promise<Result<PageStatus>>;
	/** The same publish that runs by itself when it is saved, for after one stopped or before it would. */
	publishPage(projectId: string, name: string): Promise<Result<PageStatus>>;
	/**
	 * Saves only when the page is a build of its source as it is now, and that source is not the one saved already. Safe to
	 * ask as often as one likes: each build is saved once. `from` names the version a new one was started from: it is
	 * recorded only once its source differs from that one's.
	 */
	saveBuilt(projectId: string, name: string, from: string | null): Promise<Result<'saved' | 'waiting'>>;
	openPrototype(projectId: string, name: string): Promise<Result<OpenedPrototype>>;
	buildInCodebasePlan(root: string, projectId: string, name: string): Promise<Result<BuildInCodebasePlan>>;
	prototypeReadiness(root: string): Promise<Result<PrototypeReadiness>>;
	/** Makes the project's codebase branch (from `from`) and its record, then hands the building to the agent. */
	buildInCodebase(root: string, projectId: string, name: string, from?: string): Promise<Result<Handed>>;
	/** Refused, in the agent's own words, when it is missing or signed out: asked before anything is made for it. */
	agentReady(): Promise<Result<null>>;
	/** The person chooses, whatever is kept (Change), and it is kept as they say. */
	chooseAgent(): Promise<Result<null>>;
	/** The name of the agent work goes to now, said without asking; null while it is still to be asked. */
	agentShown(): Promise<Result<string | null>>;
	/** Hands the handoff's task to the agent, as a build is handed; refused unless the checkout is on the work's branch. */
	handOff(root: string, projectId: string): Promise<Result<Handed>>;
	/** How the work's branch stands against the product's default branch, with what merging it would conflict in; null when that cannot be told. */
	codebaseAgainstBase(root: string, projectId: string): Promise<Result<BranchAgainstBase | null>>;
	/** Hands Update this branch to the agent, which merges the base into the work; refused unless the checkout is on it, with nothing unfinished. */
	handCodebaseUpdate(root: string, projectId: string): Promise<Result<Handed>>;
	/** Asked as often as one likes: `done` is said once, and the verdict recorded then. */
	handoffResult(root: string, projectId: string): Promise<Result<HandoffResult>>;
	/** `uncommitted`: the checkout had changes nobody committed, and no agent made them here. */
	runLocally(root: string, projectId: string, name: string): Promise<Result<{ url: string; uncommitted: boolean }>>;

	signInState(): Promise<Result<SignInState>>;
	signOut(): Promise<Result<null>>;
	onSignInChanged(listener: (state: SignInState) => void): () => void;

	/** Everything below reads the design repo through the API. */
	listProjects(): Promise<Result<Project[]>>;
	/** For every prototype built on this machine, one at a time; nothing while an agent works. */
	ensureCovers(): Promise<Result<MadeCover[]>>;
	/** A data URL; null when there is none to read. */
	projectCover(projectId: string, name: string, cover: string): Promise<Result<string | null>>;
	/** `branch`: what the thread is filed under (a prototype's is its key). */
	readComments(projectId: string, branch: string): Promise<Result<ReviewComment[]>>;
	assignFolder(projectId: string, folder: string | null): Promise<Result<null>>;
	/** The name people see, its brief's heading; never its id. */
	renameProject(projectId: string, title: string): Promise<Result<null>>;
	/** The whole project, every version with it; `typed` must be its name (`namesProject`). */
	deleteProject(projectId: string, typed: string): Promise<Result<null>>;
	/** So what shows a deleted project (its review tab) can close. */
	onProjectDeleted(listener: (projectId: string) => void): () => void;
	postComment(projectId: string, branch: string, body: string, anchor: CommentAnchor | null, picture?: string | null): Promise<Result<ReviewComment>>;

	/** Only the comment's author can. */
	moveComment(comment: CommentRef, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** For good: GitHub decides who is allowed, and keeps no copy. */
	deleteComment(comment: CommentRef): Promise<Result<null>>;
	/** GitHub decides who is allowed. */
	resolveComment(comment: CommentRef, resolved: boolean): Promise<Result<ReviewComment>>;
}

/** The window's whole reach: the pages build their API from it, and the core registers and sends by it. */
export const INVOKE = [
	'readCheckout',
	'designSystemCatalog',
	'designSystems',
	'storyPreview',
	'componentTokens',
	'tokenUsers',
	'changeReach',
	'editedInCode',
	'editedReach',
	'splitPreview',
	'checkSplit',
	'stopSplitCheck',
	'proposeSplit',
	'splitProposal',
	'startSplitOver',
	'componentVariants',
	'valueSources',
	'handOverChanges',
	'showHandOver',
	'showLibraryBranch',
	'writeValue',
	'componentPictures',
	'changeBranch',
	'changeScopes',
	'saveChange',
	'proposeChange',
	'forgetChange',
	'voiceAndTone',
	'installPackages',
	'cancelInstall',
	'branchesWithSetup',
	'stopCommand',
	'agentReady',
	'chooseAgent',
	'agentShown',
	'handOff',
	'codebaseAgainstBase',
	'handCodebaseUpdate',
	'handoffResult',
	'runLocally',
	'createPrototype',
	'warmPrototypeBase',
	'prototypeBehind',
	'handPrototypeRefresh',
	'assignFolder',
	'renameProject',
	'deleteProject',
	'handPrototypeBuild',
	'handPrototypeAddress',
	'publishedPage',
	'publishPage',
	'saveBuilt',
	'openPrototype',
	'buildInCodebase',
	'prototypeReadiness',
	'buildInCodebasePlan',
	'shareWork',
	'publishStatus',
	'publishNow',
	'signInState',
	'signOut',
	'listProjects',
	'ensureCovers',
	'projectCover',
	'readComments',
	'postComment',
	'moveComment',
	'resolveComment',
	'deleteComment',
] as const satisfies readonly (keyof WorkspaceApi)[];

export const EVENTS = {
	onInstallLine: 'installLine',
	onPublishStatus: 'publishStatus',
	onShareStatus: 'shareStatus',
	onRunLog: 'runLog',
	onPreviewStatus: 'previewStatus',
	onSignInChanged: 'signInChanged',
	onLibraryShown: 'libraryShown',
	onProjectDeleted: 'projectDeleted',
} as const satisfies Partial<Record<keyof WorkspaceApi, string>>;

export type InvokeName = (typeof INVOKE)[number];

export type EventName = keyof typeof EVENTS;

export type Answer<K extends InvokeName> = Awaited<ReturnType<WorkspaceApi[K]>> extends Result<infer T> ? T : never;

export type Payload<K extends EventName> = Parameters<Parameters<WorkspaceApi[K]>[0]>[0];

// Every method of WorkspaceApi is a call or an event: a new method left out of the table is a type error here.
const everyMethod: [Exclude<keyof WorkspaceApi, InvokeName | EventName>] extends [never] ? true : never = true;
void everyMethod;

export const invokeChannel = (name: InvokeName): string => `workspace:${name}`;

export const eventChannel = (name: EventName): string => `workspace:event:${EVENTS[name]}`;

export const CHANNELS = Object.fromEntries(INVOKE.map((name) => [name, invokeChannel(name)])) as { readonly [K in InvokeName]: `workspace:${K}` };
