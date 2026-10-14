import type { Appearance } from '../appearance';
import type { AccessibilityResult } from '../domain/accessibility';
import type { DeviceCodeStart, SignInState } from '../domain/account';
import type { AgentReadiness, AgentRecent, AgentStatus, ContinuedIn, EditorState } from '../domain/agent';
import type {
	Checkout,
	CheckoutSuggestion,
	ClonePlan,
	CloneProgress,
	ContextReceipt,
	PreviewStatus,
	RepositoryList,
	RunLogLine,
} from '../domain/checkout';
import type {
	CommentAnchor,
	CommentRef,
	MarkerRequest,
	MarkerResult,
	PageBounds,
	PageHoldReason,
	PickedPoint,
	PinEvent,
	ReviewComment,
} from '../domain/comments';
import type {
	Catalog,
	ComponentPictures,
	ComponentTokens,
	ConnectedDesignSystems,
	DesignSystemConnection,
	StoryPreview,
	TokenBranch,
	TokenEdit,
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
	/** Native directory picker. Resolves to null if the designer cancels. */
	chooseCheckout(): Promise<Result<Checkout | null>>;
	/** Re-read a checkout already opened (its branch, whether it is clean). It never trusts a folder the window names. */
	readCheckout(root: string): Promise<Result<Checkout>>;
	/** Read the repository's descriptor and resolve what it points at. */
	readContextReceipt(root: string): Promise<Result<ContextReceipt>>;

	listIterations(root: string, projectId: string): Promise<Result<Iteration[]>>;
	/**
	 * Every repository the signed-in person can see on GitHub, most recently pushed first, each with its clone on
	 * this machine where there is one; then clones here GitHub did not list. Listing one trusts nothing.
	 */
	listRepositories(): Promise<Result<RepositoryList>>;
	/** The branches of an opened repository, here or only on GitHub, most recently worked on first: what new work can start from. */
	listBaseBranches(root: string): Promise<Result<string[]>>;
	/** Of those, the ones with the DSNR setup, which codebase work can start from. */
	branchesWithSetup(root: string): Promise<Result<string[]>>;
	/** Checks out an existing iteration's branch. */
	continueIteration(root: string, projectId: string, name: string): Promise<Result<Iteration>>;

	/** `projectId` fills `<project-id>` in a command that serves one project. */
	startCommand(root: string, commandId: string, projectId?: string): Promise<Result<PreviewStatus>>;
	/**
	 * The product checkout in use, if one has already been trusted: a repository this
	 * person opened before. Discovery alone never lands here -- see `suggestCheckout`.
	 */
	lastCheckout(): Promise<Result<Checkout | null>>;
	/**
	 * A repository found on this machine by its `.dsnr/workspace.json`, offered for the
	 * person to confirm. Finding it grants nothing: nothing may run in it until
	 * `useCheckout` is called, which is what a click does.
	 */
	suggestCheckout(): Promise<Result<CheckoutSuggestion | null>>;
	/** Accepts a suggested repository. This is the step that trusts it. */
	useCheckout(root: string): Promise<Result<Checkout>>;
	/**
	 * The component library's catalog, from its clone's copy of its branch on GitHub. Without `refresh` it answers at once
	 * with what the clone already has and starts bringing the branch up to date; with it, it waits for that and answers with the
	 * outcome. Nothing in the clone's branches or files is changed.
	 */
	designSystemCatalog(refresh: boolean): Promise<Result<Catalog>>;
	/** The design systems connected, and which is shown (P4). */
	designSystems(): Promise<Result<ConnectedDesignSystems>>;
	/**
	 * Connects a design system from one of the person's repositories: cloned into the clone folder (with progress on
	 * `onCloneProgress`, `cancelClone` stopping it) or used where it already is, its default branch read, and the design
	 * system found in it. Refused, in words, when there is none; several to choose from when there are.
	 */
	connectDesignSystem(repository: string): Promise<Result<DesignSystemConnection>>;
	/** Connects one of the design systems `connectDesignSystem` found in a repository, by its folder. */
	chooseDesignSystem(repository: string, folder: string): Promise<Result<DesignSystemConnection>>;
	/** Shows another of those connected. */
	selectDesignSystem(id: string): Promise<Result<null>>;
	/** Removes one connected: nothing on disk is deleted, only the connection. */
	removeDesignSystem(id: string): Promise<Result<null>>;
	/**
	 * The previews of the library's stories, built from its branch once per commit; waits for the build. With `edits`, the
	 * same stories built with those tokens changed (T3), written nowhere; with none, as the branch has them.
	 */
	storyPreview(edits: TokenEdit[]): Promise<Result<StoryPreview>>;
	/** Which tokens a component draws with, by its story file (T6); `building` while every story is drawn, the first time. */
	componentTokens(file: string): Promise<Result<ComponentTokens>>;
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
	/** Where this person's clones go: the folder they chose, or the default. */
	cloneFolder(): Promise<Result<string>>;
	/** Asks for the clone folder with the system's folder picker, and keeps it. Null if the person cancels. */
	chooseCloneFolder(): Promise<Result<string | null>>;
	/**
	 * What cloning a repository from the person's GitHub list would do: where it goes, and whether the design repository
	 * comes too. `forDesignSystem`: a design system is read, not worked in, so it is cloned with no design repository.
	 */
	clonePlan(repository: string, forDesignSystem?: boolean): Promise<Result<ClonePlan>>;
	/**
	 * Clones it into the clone folder (and the design repository beside it, when missing), then opens it as `useCheckout`
	 * does. Only a repository the person's GitHub list returned; never to a path the window names.
	 */
	cloneRepository(repository: string): Promise<Result<Checkout>>;
	/** Stops a clone that is running. What it made is removed. */
	cancelClone(): Promise<Result<null>>;
	/** Runs the install command the repository declares (`install`), and nothing else. Its output arrives through `onInstallLine`. */
	installPackages(root: string): Promise<Result<null>>;
	/** Stops an install that is running. */
	cancelInstall(): Promise<Result<null>>;
	onInstallLine(listener: (line: string) => void): () => void;
	onCloneProgress(listener: (progress: CloneProgress) => void): () => void;
	stopCommand(root: string, commandId: string): Promise<Result<PreviewStatus>>;
	commandStatus(root: string, commandId: string): Promise<Result<PreviewStatus>>;
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
	shareStatus(): Promise<Result<ShareStatus>>;
	onShareStatus(listener: (status: ShareStatus) => void): () => void;
	/** Whether a shared preview's address answers yet, for the "still building" screen. */
	previewReachable(url: string): Promise<Result<boolean>>;

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
	/** The current or last run's recent lines, so a screen opened again can show where the agent has got to. */
	agentRecent(): Promise<Result<AgentRecent>>;
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
	buildPrototype(projectId: string, name: string, request: string): Promise<Result<AgentStatus>>;
	/**
	 * The same build, handed to Claude Code in the repository `root` instead of run here, as Build in the codebase is: its
	 * whole task is written beside the prototype, and a conversation starts with a line pointing at it: in VS Code's panel
	 * when it is here (`editor`), or the command that starts it in a terminal, put on the clipboard (`command`). Nothing is
	 * saved or checked from here: the prototype is saved when it is opened.
	 */
	handPrototypeBuild(root: string, projectId: string, name: string, request: string): Promise<Result<BuildInCodebase>>;
	/** What a prototype's accessibility check found, handed to Claude Code to fix, the same way as its build (`handPrototypeBuild`). */
	handPrototypeFix(root: string, projectId: string, name: string): Promise<Result<BuildInCodebase>>;
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
	/**
	 * A prototype's saved page checked for accessibility at its product's target (T7): kept, and made again only when the
	 * page, axe-core, the tags or the target change. Takes a few seconds the first time.
	 */
	checkAccessibility(projectId: string, name: string): Promise<Result<AccessibilityResult>>;
	/** Starts the prototype's agent on what its last check found, and nothing else: one round of its own check (T7). */
	fixAccessibility(projectId: string, name: string): Promise<Result<AgentStatus>>;
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
	/** Whether this work can be handed to the person here: VS Code with Claude Code, and a conversation to continue. */
	editorState(root: string, branch: string): Promise<Result<EditorState>>;
	/** Opens the checkout in VS Code (or the folder, without it). */
	openInEditor(root: string): Promise<Result<null>>;
	/** Continues this branch's latest agent conversation in VS Code (or copies the command), taking over the app's run of it. */
	continueInClaude(root: string, branch: string): Promise<Result<ContinuedIn>>;
	onAgentLog(listener: (line: RunLogLine) => void): () => void;

	/** Begins device-flow sign-in. Resolves as soon as there is a code to show. */
	signInStart(): Promise<Result<DeviceCodeStart>>;
	signInCancel(): Promise<Result<null>>;
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
	/** The app's appearance (Settings): Auto, Light or Dark. */
	appearance(): Promise<Result<Appearance>>;
	/** Sets it: applied to the whole app at once (its pages and previews too), and kept for the next time it opens. */
	setAppearance(appearance: Appearance): Promise<Result<Appearance>>;
	/** Puts a project in a folder, or in none for null, in its brief in the design repository (the folders plan). */
	assignFolder(projectId: string, folder: string | null): Promise<Result<null>>;
	postComment(projectId: string, branch: string, body: string, anchor: CommentAnchor | null, picture?: string | null): Promise<Result<ReviewComment>>;

	/** The preview, shown inside the window at the given place. It cannot call back into the app. */
	pageOpen(url: string): Promise<Result<null>>;
	pageClose(): Promise<Result<null>>;
	/** Opens the page the preview is showing in the person's own browser. It never happens by itself. */
	openPreviewInBrowser(): Promise<Result<null>>;
	pageSetBounds(bounds: PageBounds): Promise<Result<null>>;
	/**
	 * Hides the preview while something drawn by the window needs the space it
	 * occupies. Several things can want that at once, so each says *why*: the
	 * preview comes back only when every reason has let go.
	 */
	pageHold(reason: PageHoldReason, held: boolean): Promise<Result<null>>;
	/**
	 * The preview as an image, so the window can draw over where it is. The preview is a native
	 * layer, always drawn above the window's own content, so a popover cannot be laid over it:
	 * the preview is swapped for a picture of itself while the popover is open. Null if there is
	 * no preview.
	 */
	pageSnapshot(): Promise<Result<string | null>>;

	/** Comment mode: resolves with the next element clicked, or null if canceled. */
	pagePick(): Promise<Result<PickedPoint | null>>;
	pageCancelPick(): Promise<Result<null>>;
	pageShowMarkers(items: MarkerRequest[]): Promise<Result<MarkerResult[]>>;
	pageFocusMarker(id: number): Promise<Result<null>>;
	/** The preview moved to another page. */
	onPageRoute(listener: (route: string) => void): () => void;
	/** A pin on the page was clicked or moved. */
	onPinEvent(listener: (event: PinEvent) => void): () => void;
	/** Saves where a comment's pin now is. Only the comment's author can. */
	moveComment(comment: CommentRef, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** Deletes a comment for good. GitHub decides who is allowed, and keeps no copy. */
	deleteComment(comment: CommentRef): Promise<Result<null>>;
	/** Marks a comment resolved, or open again. GitHub decides who is allowed. */
	resolveComment(comment: CommentRef, resolved: boolean): Promise<Result<ReviewComment>>;
	/**
	 * Records that the agent acted on a comment, with the commit it made, or clears that with null.
	 * Never resolves it: that is the person's to say, after looking at the change.
	 */
	markAddressed(comment: CommentRef, commit: string | null): Promise<Result<ReviewComment>>;
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
	'chooseCheckout',
	'readCheckout',
	'readContextReceipt',
	'listIterations',
	'continueIteration',
	'startCommand',
	'lastCheckout',
	'suggestCheckout',
	'useCheckout',
	'designSystemCatalog',
	'designSystems',
	'connectDesignSystem',
	'chooseDesignSystem',
	'selectDesignSystem',
	'removeDesignSystem',
	'storyPreview',
	'componentTokens',
	'componentPictures',
	'tokenBranch',
	'saveTokens',
	'proposeTokens',
	'forgetTokenBranch',
	'voiceAndTone',
	'saveVoiceAndTone',
	'proposeVoiceAndTone',
	'forgetVoiceBranch',
	'cloneFolder',
	'chooseCloneFolder',
	'clonePlan',
	'cloneRepository',
	'cancelClone',
	'installPackages',
	'cancelInstall',
	'listRepositories',
	'listBaseBranches',
	'branchesWithSetup',
	'stopCommand',
	'commandStatus',
	'startAgent',
	'agentStatus',
	'agentRecent',
	'stopAgent',
	'agentReadiness',
	'editorState',
	'startHandoff',
	'handoffResult',
	'openInEditor',
	'continueInClaude',
	'createPrototype',
	'assignFolder',
	'appearance',
	'setAppearance',
	'buildPrototype',
	'handPrototypeBuild',
	'handPrototypeFix',
	'addressPrototype',
	'finishPrototypeAddress',
	'publishedPage',
	'openPublishedPage',
	'publishPage',
	'savePrototype',
	'prototypeProgress',
	'openPrototype',
	'checkAccessibility',
	'fixAccessibility',
	'buildInCodebase',
	'prototypeReadiness',
	'buildInCodebasePlan',
	'addressComments',
	'shareIteration',
	'shareStatus',
	'publishStatus',
	'publishNow',
	'previewReachable',
	'signInStart',
	'signInCancel',
	'signInState',
	'signOut',
	'listProjects',
	'ensureCovers',
	'projectCover',
	'readComments',
	'readRecord',
	'postComment',
	'pageOpen',
	'pageClose',
	'openPreviewInBrowser',
	'pageSetBounds',
	'pageHold',
	'pageSnapshot',
	'pagePick',
	'pageCancelPick',
	'pageShowMarkers',
	'pageFocusMarker',
	'moveComment',
	'resolveComment',
	'markAddressed',
	'deleteComment',
	'iterationCommit',
] as const satisfies readonly (keyof WorkspaceApi)[];

export const EVENTS = {
	onInstallLine: 'installLine',
	onCloneProgress: 'cloneProgress',
	onPublishStatus: 'publishStatus',
	onShareStatus: 'shareStatus',
	onRunLog: 'runLog',
	onPreviewStatus: 'previewStatus',
	onAgentLog: 'agentLog',
	onSignInChanged: 'signInChanged',
	onPageRoute: 'pageRoute',
	onPinEvent: 'pinEvent',
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
