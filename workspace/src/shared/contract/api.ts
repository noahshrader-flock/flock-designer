import type { SignInState } from '../domain/account';
import type { AgentReadiness, AgentStatus } from '../domain/agent';
import type { Checkout, PreviewStatus, RunLogLine } from '../domain/checkout';
import type { CommentAnchor, CommentRef, ReviewComment } from '../domain/comments';
import type {
	Catalog,
	ComponentPictures,
	ChangeReach,
	ComponentTokens,
	ConnectedDesignSystems,
	StoryPreview,
	TokenBranch,
	TokenEdit,
	TriedValue,
	ComponentVariants,
	ValueBranch,
	ValueSources,
} from '../domain/designSystem';
import type {
	BuildInCodebase,
	Iteration,
	MadeCover,
	BuildInCodebasePlan,
	OpenedPrototype,
	PageStatus,
	Project,
	PrototypeAddressed,
	PrototypeReadiness,
} from '../domain/projects';
import type { PublishStatus, ShareStatus } from '../domain/publishing';
import type { VoiceAndTone, VoiceSave } from '../domain/voice';

/**
 * The only vocabulary the renderer has.
 *
 * Everything the window can ask for is a named operation on this contract. There
 * is no generic `invoke(channel, args)` and no shell: a capability the renderer
 * does not have a method for is a capability it does not have. Adding one is a
 * deliberate edit to this file, which is the point.
 */

/**
 * A result that carries its failure instead of throwing across the bridge.
 *
 * An exception crossing IPC arrives as a string with no shape. Every operation
 * that can fail for an ordinary reason -- no descriptor, dirty tree, command not
 * allowed -- returns this, so the renderer can say what happened.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WorkspaceApi {
	/** Re-read a checkout already opened (its branch, whether it is clean). It never trusts a folder the window names. */
	readCheckout(root: string): Promise<Result<Checkout>>;

	/** Of those, the ones with the DSNR setup, which codebase work can start from. */
	branchesWithSetup(root: string): Promise<Result<string[]>>;
	/** Checks out an existing iteration's branch. */
	continueIteration(root: string, projectId: string, name: string): Promise<Result<Iteration>>;

	/** `projectId` fills `<project-id>` in a command that serves one project. */
	startCommand(root: string, commandId: string, projectId?: string): Promise<Result<PreviewStatus>>;
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
	/** What a token change being tried reaches: each component it moves, and how (Phase 3); `building` while it is drawn. */
	changeReach(edits: TokenEdit[]): Promise<Result<ChangeReach>>;
	/** A component drawn in every case its declared props give, by its story file (Phase 5); `building` while it is drawn. */
	componentVariants(file: string): Promise<Result<ComponentVariants>>;
	/** Where the values tried on a component's instances are written, by its story file, and what writing them reaches (Phase 4). */
	valueSources(file: string, tried: TriedValue[]): Promise<Result<ValueSources>>;
	/** The branch a component's values are kept on, or null when none has been saved (Phase 4). */
	valueBranch(file: string): Promise<Result<ValueBranch | null>>;
	/** Has the agent write a value tried on a component, or make it follow a token (Phase 4.5, 4.6); what it wrote is in `valueSources`. */
	writeValue(file: string, value: TriedValue): Promise<Result<null>>;
	/** Saves the values tried on a component where they were found, as one commit on its branch, made the first time. */
	saveValues(file: string, tried: TriedValue[]): Promise<Result<ValueBranch>>;
	/** Pushes a component's values branch and opens a draft pull request for it. */
	proposeValues(file: string): Promise<Result<ValueBranch>>;
	/** Forgets a component's values branch, to start a new one; the branch and any pull request stay. */
	forgetValueBranch(file: string): Promise<Result<null>>;
	/** The pictures of the shown design system's components, for the grid view (P5). */
	componentPictures(): Promise<Result<ComponentPictures>>;
	/** The branch a change to the shown design system's tokens is kept on, or null when none has been saved (T4). */
	tokenBranch(): Promise<Result<TokenBranch | null>>;
	/** Saves the change as one commit on its branch, made on the first save; pushed when it is proposed (T4). */
	saveTokens(edits: TokenEdit[]): Promise<Result<TokenBranch>>;
	/** Pushes the branch and opens a draft pull request for it, or says the one already open (T5). */
	proposeTokens(): Promise<Result<TokenBranch>>;
	/** Forgets the branch, to start a new change: the branch and any pull request stay where they are. */
	forgetTokenBranch(): Promise<Result<null>>;
	/** The voice and tone file as GitHub has it now, and the change kept on a branch, if one is (T9). */
	voiceAndTone(): Promise<Result<VoiceAndTone>>;
	/**
	 * Saves the text as one commit on its branch, made from the default branch on the first save; refused when the file
	 * there is no longer the one at `against`, the sha the text was opened at (null: there was no file).
	 */
	saveVoiceAndTone(text: string, against: string | null): Promise<Result<VoiceSave>>;
	/** Opens a draft pull request for the branch, with the person's own GitHub command line, or says the one already open. */
	proposeVoiceAndTone(): Promise<Result<VoiceAndTone>>;
	/** Forgets the branch, to start again from the default branch's file: the branch and any pull request stay. */
	forgetVoiceBranch(): Promise<Result<null>>;
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
	 * Pushes the iteration's branch, opens a draft pull request for it, waits for the repository's
	 * deploy workflow and records the preview address. Resolves at once with where it has got to;
	 * progress arrives through `onShareStatus`, because the build takes minutes.
	 */
	shareIteration(root: string, projectId: string, name: string): Promise<Result<ShareStatus>>;
	onShareStatus(listener: (status: ShareStatus) => void): () => void;

	/**
	 * Asks the agent to act on one comment, named by its id: the iteration's comments are read from GitHub now and written
	 * to `comments.md`, then the agent is started on that one. There is no batch: comments are not alike, and the designer
	 * picks the one that is a clear change. Refused if the agent is busy, the checkout is not on this iteration's branch,
	 * the tree is dirty, or the comment is not open. Progress is the agent's own (`agentStatus`, `onAgentLog`).
	 */
	addressComments(root: string, projectId: string, name: string, comment: CommentRef): Promise<Result<AgentStatus>>;

	/** Hands the task to the locally installed agent. Never bundles credentials. */
	startAgent(root: string, projectId: string, task: string): Promise<Result<AgentStatus>>;
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
	): Promise<Result<Iteration>>;
	/**
	 * The same build, handed to Claude Code in the repository `root` instead of run here, as Build in the codebase is: its
	 * whole task is written beside the prototype, and a conversation starts with a line pointing at it: in VS Code's panel
	 * when it is here (`editor`), or the command that starts it in a terminal, put on the clipboard (`command`). Nothing is
	 * saved or checked from here: the prototype is saved when it is opened.
	 */
	handPrototypeBuild(root: string, projectId: string, name: string, request: string): Promise<Result<BuildInCodebase>>;
	/**
	 * Starts the agent on one comment on a prototype. There is no batch. The change goes in the newest iteration of the
	 * prototype's version, or, when others have commented on that, in the next one.
	 */
	addressPrototype(projectId: string, name: string, comment: CommentRef): Promise<Result<AgentStatus>>;
	/**
	 * Once that agent has finished: a changed prototype is built, recorded when it is a new iteration, and saved, and the
	 * comment is marked with where the change is. Says whether anything changed, in which iteration, the new
	 * iteration's record when one was made, and the comment as it is marked now.
	 */
	finishPrototypeAddress(comment: CommentRef): Promise<Result<PrototypeAddressed>>;
	/** Whether the iteration is on its published page, asked of GitHub. */
	publishedPage(projectId: string, name: string): Promise<Result<PageStatus>>;
	/** Opens the iteration's published page in the person's browser. Its address is worked out there, not taken from here. */
	openPublishedPage(projectId: string, name: string): Promise<Result<null>>;
	/**
	 * Publishes the iteration now: the same publish that runs by itself when it is saved, asked for after one stopped, or
	 * before it would. Says how the page stands once it has started.
	 */
	publishPage(projectId: string, name: string): Promise<Result<PageStatus>>;
	savePrototype(projectId: string, name: string): Promise<Result<null>>;
	/**
	 * When a prototype's source and page were last written on this machine (milliseconds, null when there is none): for what
	 * watches a build that Claude Code does, to save it once it has stopped changing.
	 */
	prototypeProgress(projectId: string, name: string): Promise<Result<{ sourceAt: number | null; pageAt: number | null }>>;
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
	 * Starts Handoff on a project's codebase work: the product's gate, both reviews, their fixes, and HANDOFF.md.
	 * Refused unless the checkout is on the work's branch and the agent is free.
	 */
	startHandoff(root: string, projectId: string): Promise<Result<AgentStatus>>;
	/** Whether the last Handoff here found the work ready (its verdict, and HANDOFF.md committed since); null if unknown. */
	handoffResult(root: string): Promise<Result<boolean | null>>;
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
	/** A review thread's comments. `branch`: the iteration's branch, which its thread is filed under (a prototype's is its key). */
	readComments(projectId: string, branch: string): Promise<Result<ReviewComment[]>>;
	/** The text of one file in a project's folder (its brief, its review notes, …): this machine's copy if it has one, else GitHub's. */
	readRecord(projectId: string, name: string): Promise<Result<string>>;
	/** Puts a project in a folder, or in none for null, in its brief in the design repository (the folders plan). */
	assignFolder(projectId: string, folder: string | null): Promise<Result<null>>;
	postComment(projectId: string, branch: string, body: string, anchor: CommentAnchor | null, picture?: string | null): Promise<Result<ReviewComment>>;

	/** Saves where a comment's pin now is. Only the comment's author can. */
	moveComment(comment: CommentRef, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** Deletes a comment for good. GitHub decides who is allowed, and keeps no copy. */
	deleteComment(comment: CommentRef): Promise<Result<null>>;
	/** Marks a comment resolved, or open again. GitHub decides who is allowed. */
	resolveComment(comment: CommentRef, resolved: boolean): Promise<Result<ReviewComment>>;
	/** The commit an iteration's branch is at on this machine, to say what a comment was made against. Null if unknown. */
	iterationCommit(root: string, projectId: string, name: string): Promise<Result<string | null>>;
}

/**
 * The window's whole reach, as one table: every call it can make (`INVOKE`, each on the channel `workspace:<name>`) and
 * every event it can hear (`EVENTS`, each on the channel `workspace:event:<name>`, its method's name without `on`). The
 * preload builds the window's API from it, main registers and sends by it, and the check below fails the typecheck when
 * a method of `WorkspaceApi` is in neither, so the three cannot drift.
 */
export const INVOKE = [
	'readCheckout',
	'continueIteration',
	'startCommand',
	'designSystemCatalog',
	'designSystems',
	'storyPreview',
	'componentTokens',
	'changeReach',
	'componentVariants',
	'valueSources',
	'valueBranch',
	'writeValue',
	'saveValues',
	'proposeValues',
	'forgetValueBranch',
	'componentPictures',
	'tokenBranch',
	'saveTokens',
	'proposeTokens',
	'forgetTokenBranch',
	'voiceAndTone',
	'saveVoiceAndTone',
	'proposeVoiceAndTone',
	'forgetVoiceBranch',
	'installPackages',
	'cancelInstall',
	'branchesWithSetup',
	'stopCommand',
	'startAgent',
	'agentStatus',
	'stopAgent',
	'agentReadiness',
	'startHandoff',
	'handoffResult',
	'createPrototype',
	'assignFolder',
	'handPrototypeBuild',
	'addressPrototype',
	'finishPrototypeAddress',
	'publishedPage',
	'openPublishedPage',
	'publishPage',
	'savePrototype',
	'prototypeProgress',
	'openPrototype',
	'buildInCodebase',
	'prototypeReadiness',
	'buildInCodebasePlan',
	'addressComments',
	'shareIteration',
	'publishStatus',
	'publishNow',
	'signInState',
	'signOut',
	'listProjects',
	'ensureCovers',
	'projectCover',
	'readComments',
	'readRecord',
	'postComment',
	'moveComment',
	'resolveComment',
	'deleteComment',
	'iterationCommit',
] as const satisfies readonly (keyof WorkspaceApi)[];

export const EVENTS = {
	onInstallLine: 'installLine',
	onPublishStatus: 'publishStatus',
	onShareStatus: 'shareStatus',
	onRunLog: 'runLog',
	onPreviewStatus: 'previewStatus',
	onAgentLog: 'agentLog',
	onSignInChanged: 'signInChanged',
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
