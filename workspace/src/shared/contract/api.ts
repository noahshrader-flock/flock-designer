import type { SignInState } from '../domain/account';
import type { AgentReadiness, AgentStatus, JobEnd } from '../domain/agent';
import type { Checkout, PreviewStatus, RunLogLine } from '../domain/checkout';
import type { CommentAnchor, CommentRef, ReviewComment } from '../domain/comments';
import type {
	Catalog,
	ComponentPictures,
	ChangeReach,
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
	BuildInCodebase,
	Work,
	MadeCover,
	BuildInCodebasePlan,
	OpenedPrototype,
	PageStatus,
	Project,
	PrototypeAddressed,
	PrototypeReadiness,
} from '../domain/projects';
import type { PublishStatus, ShareStatus } from '../domain/publishing';
import type { VoiceAndTone } from '../domain/voice';

/**
 * The only vocabulary a page has.
 *
 * Everything the window can ask for is a named operation on this contract. There
 * is no generic `invoke(channel, args)` and no shell: a capability a page
 * does not have a method for is a capability it does not have. Adding one is a
 * deliberate edit to this file, which is the point.
 */

/**
 * A result that carries its failure instead of throwing across the bridge.
 *
 * An exception crossing to a page arrives as a string with no shape. Every operation
 * that can fail for an ordinary reason -- no descriptor, dirty tree, command not
 * allowed -- returns this, so a page can say what happened.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WorkspaceApi {
	/** Re-read a checkout already opened (its branch, whether it is clean). It never trusts a folder the window names. */
	readCheckout(root: string): Promise<Result<Checkout>>;

	/** Of those, the ones with the DSNR setup, which codebase work can start from. */
	branchesWithSetup(root: string): Promise<Result<string[]>>;
	/**
	 * The component library's catalog, from its clone's copy of its branch on GitHub. Without `refresh` it answers at once
	 * with what the clone already has and starts bringing the branch up to date; with it, it waits for that and answers with the
	 * outcome. Nothing in the clone's branches or files is changed.
	 */
	designSystemCatalog(refresh: boolean): Promise<Result<Catalog>>;
	/** The design systems connected, and which is shown (P4). */
	designSystems(): Promise<Result<ConnectedDesignSystems>>;
	/**
	 * The previews of the library's stories, built from its branch once per commit; waits for the build. With `edits`, the
	 * same stories built with those tokens changed (T3), written nowhere; with none, as the branch has them.
	 */
	storyPreview(edits: TokenEdit[]): Promise<Result<StoryPreview>>;
	/** Which tokens a component draws with, by its story file (T6); `building` while every story is drawn, the first time. */
	componentTokens(file: string): Promise<Result<ComponentTokens>>;
	/** The components that draw with a token, by its path, and how many of their values it is; `building` while every story is drawn. */
	tokenUsers(path: string): Promise<Result<TokenUsers>>;
	/** What a token change being tried reaches: each component it moves, and how (Phase 3); `building` while it is drawn. */
	changeReach(edits: TokenEdit[]): Promise<Result<ChangeReach>>;
	/** A component drawn in every case its declared props give, by its story file (Phase 5); `building` while it is drawn. */
	componentVariants(file: string): Promise<Result<ComponentVariants>>;
	/** Where the values tried on a component's instances are written, by its story file, and what writing them reaches (Phase 4). */
	valueSources(file: string, tried: TriedValue[]): Promise<Result<ValueSources>>;
	/**
	 * Process changes: one unit (the tokens, `null`; or a component's values, by its story file) handed to Claude Code, on a branch
	 * DSNR names: refused, in words, on a checkout with unfinished work or with a branch of the unit's in play; else Claude Code
	 * opened in the library's root with the prompt typed in, as every hand-over is (`handToClaude`), and its branch.
	 */
	handOverChanges(file: string | null, change: HandedChange): Promise<Result<HandedOver>>;
	/**
	 * Preview this branch: the tab reads a unit's hand-over branch, at its tip, in place of the library's branch, once it is read
	 * ready from git. Every page is told (`onLibraryShown`). While it is shown, nothing is saved or handed over.
	 */
	showHandOver(file: string | null): Promise<Result<null>>;
	/** The library's own branch shown again. */
	showLibraryBranch(): Promise<Result<null>>;
	/** Told the branch shown in place of the library's (null: the library's own) whenever it changes. */
	onLibraryShown(listener: (showing: string | null) => void): () => void;
	/** Has the agent write a value tried on a component, or make it follow a token (Phase 4.5, 4.6); what it wrote is in `valueSources`. */
	writeValue(file: string, value: TriedValue): Promise<Result<null>>;
	/** The pictures of the shown design system's components, for the grid view (P5). */
	componentPictures(): Promise<Result<ComponentPictures>>;
	/**
	 * A change's branch, of any kind (`ChangeKinds`), by its scope: a component's story file, or null for the design system
	 * whole (its tokens, its voice and tone). Null when none is kept, or its branch is gone, or its pull request was merged or
	 * closed (then it is forgotten). A hand-over's is read from git now.
	 */
	changeBranch<K extends ChangeKind>(kind: K, scope: string | null): Promise<Result<ChangeBranchOf<K> | null>>;
	/** The scopes with a branch of `kind` kept on the design system shown (the design system whole as an empty one): what the panel's Changes lists. */
	changeScopes(kind: ChangeKind): Promise<Result<string[]>>;
	/**
	 * Saves a change as one commit on its branch, made from the library's branch on the first save, nothing checked out;
	 * pushed when it is proposed, and on every save after. Refused while another branch is shown. A voice and tone save is
	 * refused when the file on the library's branch is no longer the one it was opened at.
	 */
	saveChange<K extends SavedKind>(kind: K, scope: string | null, change: ChangeKinds[K]): Promise<Result<ChangeBranchOf<K>>>;
	/**
	 * Pushes a change's branch and opens its draft pull request, or says the one open. A hand-over's only at `seen.tip`, the
	 * commit the person looked at, and one the rules flag only when `seen.confirmed`; the others take null. Refused while
	 * another branch is shown.
	 */
	proposeChange<K extends ChangeKind>(
		kind: K,
		scope: string | null,
		seen: { tip: string; confirmed: boolean } | null,
	): Promise<Result<ChangeBranchOf<K>>>;
	/** Forgets a change's branch, to start a new one; the branch and any pull request stay. */
	forgetChange(kind: ChangeKind, scope: string | null): Promise<Result<null>>;
	/** The voice and tone file as the library's branch has it, read after bringing the branch up to date (T9). */
	voiceAndTone(): Promise<Result<VoiceAndTone>>;
	/** Runs the install command the repository declares (`install`), and nothing else. Its output arrives through `onInstallLine`. */
	installPackages(root: string): Promise<Result<null>>;
	/** Stops an install that is running. */
	cancelInstall(): Promise<Result<null>>;
	onInstallLine(listener: (line: string) => void): () => void;
	stopCommand(root: string, commandId: string): Promise<Result<PreviewStatus>>;
	onRunLog(listener: (line: RunLogLine) => void): () => void;
	onPreviewStatus(listener: (status: PreviewStatus) => void): () => void;

	/** Where publishing has got to. */
	publishStatus(): Promise<Result<PublishStatus>>;
	/** Publish now, for the person who wants to see it done. Never needed: it happens by itself. */
	publishNow(): Promise<Result<PublishStatus>>;
	onPublishStatus(listener: (status: PublishStatus) => void): () => void;

	/**
	 * Pushes the work's branch, opens a draft pull request for it, waits for the repository's
	 * deploy workflow and records the preview address. Resolves at once with where it has got to;
	 * progress arrives through `onShareStatus`, because the build takes minutes.
	 */
	shareWork(root: string, projectId: string, name: string): Promise<Result<ShareStatus>>;
	onShareStatus(listener: (status: ShareStatus) => void): () => void;

	agentStatus(): Promise<Result<AgentStatus>>;
	/** Stops the agent's run, whatever it is doing: Stop on a build, where a shell shows one (the VS Code extension). */
	stopAgent(): Promise<Result<null>>;
	// Prototypes: one page, no product repository needed. Recording one makes the project too when it is new; building
	// runs the agent in the app's own folder; saving puts the page in the design repository; opening serves it to the
	// preview from this machine.
	/**
	 * `from`: the repository on this machine and a branch in it to model the page on. `folder`: the folder a new project is
	 * put in (the folders plan); a project that has a brief already stays where it is.
	 */
	createPrototype(
		projectId: string,
		title: string,
		note: string,
		from?: { root: string; branch: string },
		folder?: string | null,
	): Promise<Result<Work>>;
	/**
	 * The same build, handed to Claude Code in the repository `root` instead of run here, as Build in the codebase is: its
	 * whole task is written beside the prototype, and a conversation starts with a line pointing at it: in VS Code's panel
	 * when it is here (`editor`), or the command that starts it in a terminal, put on the clipboard (`command`). Nothing is
	 * saved or checked from here: the prototype is saved when it is opened.
	 */
	handPrototypeBuild(root: string, projectId: string, name: string, request: string): Promise<Result<BuildInCodebase>>;
	/**
	 * Address on one comment on a prototype, run here to its end: the agent makes the change in the version commented on,
	 * in place, or in a new version from it when `newVersion` asks for one; then a changed prototype is built, recorded when
	 * it is a new version, and saved, and the comment is marked with where the change is. There is no batch. Says whether
	 * anything changed, in which version, the new version's record when one was made, and the comment as it is marked now;
	 * or that the person stopped it, when the change is finished the next time the prototype is opened.
	 */
	addressPrototype(projectId: string, name: string, comment: CommentRef, newVersion: boolean): Promise<Result<JobEnd<PrototypeAddressed>>>;
	/** Whether the version is on its published page, asked of GitHub. */
	publishedPage(projectId: string, name: string): Promise<Result<PageStatus>>;
	/**
	 * Publishes the version now: the same publish that runs by itself when it is saved, asked for after one stopped, or
	 * before it would. Says how the page stands once it has started.
	 */
	publishPage(projectId: string, name: string): Promise<Result<PageStatus>>;
	/**
	 * Saves a prototype Claude Code builds once it is built (`saved`): its page a build of its source as it is now, and that
	 * source not the one saved already; `waiting` otherwise. What watches a build handed to Claude Code asks, as often as it
	 * likes: each build is saved once, then published as every save is.
	 */
	saveBuilt(projectId: string, name: string): Promise<Result<'saved' | 'waiting'>>;
	openPrototype(projectId: string, name: string): Promise<Result<OpenedPrototype>>;
	/** What building a prototype in the codebase would do in this checkout, asked before it is offered. */
	buildInCodebasePlan(root: string, projectId: string, name: string): Promise<Result<BuildInCodebasePlan>>;
	/** Whether a prototype can be built from this repository on this machine, and with which design system version. */
	prototypeReadiness(root: string): Promise<Result<PrototypeReadiness>>;
	/**
	 * Build in the codebase, from a prototype: makes the project's codebase branch (from `from`) and its record, then
	 * hands the building to Claude Code in the repository: VS Code's panel when it is here (`editor`), or the command
	 * that starts it in a terminal, put on the clipboard (`command`).
	 */
	buildInCodebase(root: string, projectId: string, name: string, from?: string): Promise<Result<BuildInCodebase>>;
	/** Asked when new work is about to be started: is Claude Code installed here, and signed in? */
	agentReadiness(): Promise<Result<AgentReadiness>>;
	/**
	 * Handoff on a project's codebase work, run here to its end: the product's gate, both reviews, their fixes, and
	 * HANDOFF.md. Refused unless the checkout is on the work's branch and the agent is free (a Handoff of it already going
	 * is waited on). Says whether it found the work ready (its verdict, and HANDOFF.md committed since; null when that
	 * cannot be told), or that the person stopped it.
	 */
	handOff(root: string, projectId: string): Promise<Result<JobEnd<{ ready: boolean | null }>>>;
	/**
	 * Run locally: codebase work on its branch, once its agent has finished, and its preview started at the work's own route.
	 * `uncommitted`: the checkout had changes nobody committed, and no agent made them here.
	 */
	runLocally(root: string, projectId: string, name: string): Promise<Result<{ url: string; uncommitted: boolean }>>;
	onAgentLog(listener: (line: RunLogLine) => void): () => void;

	signInState(): Promise<Result<SignInState>>;
	signOut(): Promise<Result<null>>;
	onSignInChanged(listener: (state: SignInState) => void): () => void;

	/** Reviewer mode: everything below reads the design repo through the API. */
	listProjects(): Promise<Result<Project[]>>;
	/**
	 * Makes sure every prototype built on this machine has a current picture: draws those that do not, one at a time, keeps
	 * each in the design repository and names it on the prototype's record. Says which it made. Nothing while an agent works.
	 */
	ensureCovers(): Promise<Result<MadeCover[]>>;
	/** A prototype's picture, by the hash on its record, as a data URL; null when there is none to read. */
	projectCover(projectId: string, name: string, cover: string): Promise<Result<string | null>>;
	/** A review thread's comments. `branch`: the work's branch, which its thread is filed under (a prototype's is its key). */
	readComments(projectId: string, branch: string): Promise<Result<ReviewComment[]>>;
	/** Puts a project in a folder, or in none for null, in its brief in the design repository (the folders plan). */
	assignFolder(projectId: string, folder: string | null): Promise<Result<null>>;
	postComment(projectId: string, branch: string, body: string, anchor: CommentAnchor | null, picture?: string | null): Promise<Result<ReviewComment>>;

	/** Saves where a comment's pin now is. Only the comment's author can. */
	moveComment(comment: CommentRef, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** Deletes a comment for good. GitHub decides who is allowed, and keeps no copy. */
	deleteComment(comment: CommentRef): Promise<Result<null>>;
	/** Marks a comment resolved, or open again. GitHub decides who is allowed. */
	resolveComment(comment: CommentRef, resolved: boolean): Promise<Result<ReviewComment>>;
}

/**
 * The window's whole reach, as one table: every call it can make (`INVOKE`, each on the channel `workspace:<name>`) and
 * every event it can hear (`EVENTS`, each on the channel `workspace:event:<name>`, its method's name without `on`). The
 * pages build their API from it (`workspaceApi.ts`), the core registers and sends by it, and the check below fails the typecheck when
 * a method of `WorkspaceApi` is in neither, so the three cannot drift.
 */
export const INVOKE = [
	'readCheckout',
	'designSystemCatalog',
	'designSystems',
	'storyPreview',
	'componentTokens',
	'tokenUsers',
	'changeReach',
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
	'agentStatus',
	'stopAgent',
	'agentReadiness',
	'handOff',
	'runLocally',
	'createPrototype',
	'assignFolder',
	'handPrototypeBuild',
	'addressPrototype',
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
	onAgentLog: 'agentLog',
	onSignInChanged: 'signInChanged',
	onLibraryShown: 'libraryShown',
} as const satisfies Partial<Record<keyof WorkspaceApi, string>>;

export type InvokeName = (typeof INVOKE)[number];

export type EventName = keyof typeof EVENTS;

/** What a call answers when it works: the `T` of its `Result<T>`. */
export type Answer<K extends InvokeName> = Awaited<ReturnType<WorkspaceApi[K]>> extends Result<infer T> ? T : never;

/** What an event carries: the argument its listener is given. */
export type Payload<K extends EventName> = Parameters<Parameters<WorkspaceApi[K]>[0]>[0];

// Every method of WorkspaceApi is a call or an event: a new method left out of the table is a type error here.
const everyMethod: [Exclude<keyof WorkspaceApi, InvokeName | EventName>] extends [never] ? true : never = true;
void everyMethod;

export const invokeChannel = (name: InvokeName): string => `workspace:${name}`;

export const eventChannel = (name: EventName): string => `workspace:event:${EVENTS[name]}`;

/** Each call's channel, by name. */
export const CHANNELS = Object.fromEntries(INVOKE.map((name) => [name, invokeChannel(name)])) as { readonly [K in InvokeName]: `workspace:${K}` };
