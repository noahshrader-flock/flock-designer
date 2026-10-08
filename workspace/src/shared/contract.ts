/**
 * The only vocabulary the renderer has.
 *
 * Everything the window can ask for is a named operation on this contract. There
 * is no generic `invoke(channel, args)` and no shell: a capability the renderer
 * does not have a method for is a capability it does not have. Adding one is a
 * deliberate edit to this file, which is the point.
 */

/** A repository the designer has opened. */
export interface Checkout {
	/** Absolute path to the repository root. */
	root: string;
	/** Directory name, for display. */
	name: string;
	/** Current branch, or null on a detached HEAD. */
	branch: string | null;
	/** True when the working tree has no uncommitted changes. */
	clean: boolean;
}

/**
 * What a repository says about itself, read from `.flkd/workspace.json`.
 *
 * Workspace hard-codes nothing about Coke. A repository that wants to be opened
 * here declares where its context lives, what may be run, and how a prototype is
 * addressed. A repository without this file can be opened read-only, but nothing
 * can be run in it.
 */
export interface WorkspaceDescriptor {
	/** Schema version, so an older app can refuse a newer descriptor honestly. */
	version: 1;
	/** Human name for the product this repository holds. */
	product: string;
	/** Path to the agent-context directory, relative to the root. */
	contextDir: string;
	/** Where prototype directories live, relative to the root. */
	prototypeRoot: string;
	/** Branch naming, with `<project-id>` and `<n>` placeholders. */
	branchPattern: { prototype: string; codebase: string };
	/** Every command Workspace may run. Nothing else is runnable. */
	commands: WorkspaceCommand[];
	/** How the resolved design-system version is discovered. */
	designSystem: { package: string };
	/** How this repository turns a branch into a link a reviewer can open. Absent: it cannot be shared from here. */
	share?: ShareDescriptor;
}

/**
 * The repository's own account of how a shared preview comes about, so Workspace
 * hard-codes nothing about one product's CI. A draft pull request is opened for
 * the branch; the repository's deploy workflow builds it; the address follows a
 * fixed pattern.
 */
export interface ShareDescriptor {
	/** The preview's address, with `<pr>` where the pull request number goes. Must be https. */
	url: string;
	/** Name of the workflow whose success means the preview is up. */
	workflow: string;
	/** Which kinds of work get a preview from this repository's CI. */
	kinds: IterationKind[];
}

export interface WorkspaceCommand {
	/** Stable id the renderer refers to, e.g. `preview`, `typecheck`. */
	id: string;
	/** What a designer would call it. */
	label: string;
	/** Executable and arguments, already split — never a shell string. */
	argv: string[];
	/** Set when the command serves a preview, so Workspace knows to watch for a URL. */
	servesPreviewOn?: number;
}

/** What was grounded before the agent ran. Shown before anything is generated. */
export interface ContextReceipt {
	checkout: Checkout;
	product: string;
	/** Resolved from the checkout's lockfile — the version a prototype would build against. */
	designSystem: { package: string; resolved: string | null; source: string };
	/** Context files found, relative to the root. */
	contextFiles: string[];
	/** Commands this repository permits. */
	commands: { id: string; label: string }[];
	/** Anything that makes the repository not ready, in the designer's words. */
	problems: string[];
}

/** One named attempt at the question, tied to a branch and a commit. */
export interface Iteration {
	projectId: string;
	/** `i1`, `i2`, … */
	name: string;
	branch: string;
	/** Null until the iteration has a commit. */
	commit: string | null;
	createdAt: string;
	note: string;
	/** People who have committed on this branch. Refreshed whenever the iteration is opened or shared. */
	contributors?: Person[];
	/** Where a reviewer can open this iteration, once it has been shared. */
	previewUrl?: string;
	/** Codebase work's pull request, once it has been shared: what the project's page links to as built in code. */
	pullRequest?: string;
	/**
	 * Where this iteration's work is in the running app, as a path within it (`/roles/compare`).
	 * Written by whoever built the work, so opening the iteration lands on what was changed rather
	 * than at the app's front door. Checked with `asRoute` wherever it is read back: it comes from a
	 * file an agent wrote, and it is joined onto the preview's own address.
	 */
	route?: string;
	/**
	 * For a prototype: the product code it was modelled on, so moving it into the code later knows
	 * what it was looking at. Absent when it was made without a repository on the machine.
	 */
	basedOn?: { repository: string; branch: string; commit: string | null };
}

/** Where sharing an iteration has got to. One at a time: it is a push, a pull request and a build. */
export type ShareStatus =
	| { state: 'idle' }
	| { state: 'running'; projectId: string; name: string; step: ShareStep; detail?: string }
	| { state: 'ready'; projectId: string; name: string; url: string; prUrl: string }
	| { state: 'failed'; projectId: string; name: string; message: string };

export type ShareStep = 'pushing' | 'opening' | 'building';

export type PreviewStatus =
	| { state: 'stopped' }
	| { state: 'starting'; commandId: string; projectId?: string }
	/** `projectId` is whose preview this is: every prototype shares one port, so the address alone cannot say. */
	| { state: 'running'; commandId: string; url: string; projectId?: string }
	| { state: 'failed'; commandId: string; detail: string };

/** A line of output from a running command, for the log surface. */
export interface RunLogLine {
	commandId: string;
	stream: 'stdout' | 'stderr';
	text: string;
}

/** Whether Claude Code is here and signed in, so new work can be built. `unknown`: it could not be told, which blocks nothing. */
export type AgentReadiness = { state: 'ready' } | { state: 'missing' } | { state: 'signedOut' } | { state: 'unknown' };

export type AgentStatus =
	| { state: 'idle' }
	/**
	 * `work`: which piece of work this run is for, so a screen opened again can tell its own run from another.
	 * `purpose`: set for a Handoff, which ends in a report rather than a preview.
	 */
	| { state: 'running'; startedAt: string; work?: string; purpose?: 'handoff' }
	| { state: 'finished'; exitCode: number; work?: string; purpose?: 'handoff' }
	| { state: 'unavailable'; detail: string };

/**
 * A result that carries its failure instead of throwing across the bridge.
 *
 * An exception crossing IPC arrives as a string with no shape. Every operation
 * that can fail for an ordinary reason -- no descriptor, dirty tree, command not
 * allowed -- returns this, so the renderer can say what happened.
 */
/**
 * The two kinds of work. A **prototype** is one page built from the real components, saved in the design
 * repository and numbered i1, i2, … (the older ones made as code on `fd/` branches count as prototypes too).
 * **Codebase** work is the real change, on the project's one `feature/` branch.
 */
export type IterationKind = 'prototype' | 'codebase';

/** What moving a prototype into the code would do here, so the person is told before it does it. */
export interface MoveToCodePlan {
	/** The project's one codebase branch, as this repository names it. */
	branch: string;
	/** That branch already exists in this checkout: the work continues on it rather than starting a new one. */
	exists: boolean;
	/** The project already has codebase work recorded, so there is nothing to start. */
	recorded: boolean;
	repository: string;
	/** What the prototype was modelled on, if it says. */
	basedOn: { repository: string; branch: string } | null;
	/** The checkout's current branch, and whether it is free of uncommitted changes (which blocks creating a branch). */
	current: string | null;
	clean: boolean;
}

/** Whether a prototype can be built from a repository here: its design system installed, and the bundler present. */
export type PrototypeReadiness =
	| { ready: true; designSystem: string; version: string | null }
	| {
			ready: false;
			why: 'not-installed' | 'no-bundler';
			designSystem: string;
			repository: string;
			/** The repository declares how it installs (`install`), so the app can run it when asked. */
			canInstall?: boolean;
	  };

/** Something that could not be published, and why, in words a person can act on. */
export interface PublishProblem {
	what: string;
	why: string;
}

/**
 * Whether the person's work is published, which is the app's job and nobody else's to remember:
 * their work branches in the product repository, and their project records in the design repository.
 * It happens by itself, so this only reports.
 */
export type PublishStatus =
	/** Nothing to publish from here: no product repository, or no design repository beside it. */
	| { state: 'unavailable' }
	| { state: 'working' }
	| { state: 'shared'; at: string }
	| { state: 'held'; problems: PublishProblem[]; at: string };

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

/** The previews of the library's stories, built from its branch (DESIGN_SYSTEM_PLAN.md, P1). */
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
	| { state: 'ready'; branch: string; commit: string; committedAt: string; update: CatalogUpdate; components: CatalogComponent[] }
	/**
	 * No clone of the library on this machine. `repository` is `owner/repo`; `lost` is the folder connected before, when it
	 * is no longer there or no longer the library.
	 */
	| { state: 'no-clone'; repository: string; lost: string | null }
	/** A clone with no copy of its design system's branch from GitHub to read. Another branch is never read instead. */
	| { state: 'no-branch'; root: string; branch: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WorkspaceApi {
	/** Native directory picker. Resolves to null if the designer cancels. */
	chooseCheckout(): Promise<Result<Checkout | null>>;
	/** Open a checkout by path, validating it is a repository. */
	openCheckout(root: string): Promise<Result<Checkout>>;
	/** Read the repository's descriptor and resolve what it points at. */
	readContextReceipt(root: string): Promise<Result<ContextReceipt>>;

	listIterations(root: string, projectId: string): Promise<Result<Iteration[]>>;
	/**
	 * Starts codebase work: its branch, from `from` (a local branch) or else the current one, and its record. Refuses
	 * if the tree is dirty; never discards work. A prototype is made by `createPrototype`.
	 */
	createIteration(root: string, projectId: string, note: string, from?: string): Promise<Result<Iteration>>;
	/**
	 * Every repository the signed-in person can see on GitHub, most recently pushed first, each with its clone on
	 * this machine where there is one; then clones here GitHub did not list. Listing one trusts nothing.
	 */
	listRepositories(): Promise<Result<Repository[]>>;
	/** The branches of an opened repository, here or only on GitHub, most recently worked on first: what new work can start from. */
	listBaseBranches(root: string): Promise<Result<string[]>>;
	/** Of those, the ones with the Flock Designer setup, which codebase work can start from. */
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
	 * A repository found on this machine by its `.flkd/workspace.json`, offered for the
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
	/**
	 * Connects the design system from a folder the person chooses with the system's folder picker, after checking it is a
	 * clone of the library. False if they cancel; refused, in words, if it is not the library.
	 */
	locateDesignSystem(): Promise<Result<boolean>>;
	/**
	 * Clones the design system library into the clone folder, with progress on `onCloneProgress`, and connects it. Only a
	 * repository that is a design system is cloned; `cancelClone` stops it.
	 */
	cloneDesignSystem(repository: string): Promise<Result<null>>;
	/** The previews of the library's stories, built from its branch once per commit; waits for the build. */
	storyPreview(): Promise<Result<StoryPreview>>;
	/** Where this person's clones go: the folder they chose, or the default. */
	cloneFolder(): Promise<Result<string>>;
	/** Asks for the clone folder with the system's folder picker, and keeps it. Null if the person cancels. */
	chooseCloneFolder(): Promise<Result<string | null>>;
	/** What cloning a repository from the person's GitHub list would do: where it goes, and whether the design repository comes too. */
	clonePlan(repository: string): Promise<Result<ClonePlan>>;
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
	 * Reads the iteration's comments from GitHub now, writes them to `comments.md`, and starts the agent
	 * on them. Refused if the agent is busy, the checkout is not on this iteration's branch, the tree
	 * is dirty, or there is nothing open. Progress is the agent's own (`agentStatus`, `onAgentLog`).
	 */
	/**
	 * Asks the agent to act on one comment, named by its id. There is no batch: comments are not alike,
	 * and the designer picks the one that is a clear change from the comment itself.
	 */
	addressComments(root: string, projectId: string, name: string, commentId: number): Promise<Result<AgentStatus>>;

	/** Hands the task to the locally installed agent. Never bundles credentials. */
	startAgent(root: string, projectId: string, task: string): Promise<Result<AgentStatus>>;
	agentStatus(): Promise<Result<AgentStatus>>;
	/** The current or last run's recent lines, so a screen opened again can show where the agent has got to. */
	agentRecent(): Promise<Result<{ work: string | null; lines: string[] }>>;
	/**
	 * Prototypes: one page, no product repository needed. Recording one makes the project too when
	 * it is new; building runs the agent in the app's own folder; saving puts the page in the design
	 * repository; opening serves it to the preview from this machine.
	 */
	/** `from`: the repository on this machine and a branch in it to model the page on. */
	createPrototype(projectId: string, title: string, note: string, from?: { root: string; branch: string }): Promise<Result<Iteration>>;
	buildPrototype(projectId: string, name: string, request: string): Promise<Result<AgentStatus>>;
	/**
	 * Starts the agent on one comment on a prototype. There is no batch. The change goes in the newest iteration of the
	 * prototype's version, or, when others have commented on that, in the next one.
	 */
	addressPrototype(projectId: string, name: string, commentId: number): Promise<Result<AgentStatus>>;
	/**
	 * Once that agent has finished: a changed prototype is built, recorded when it is a new iteration, and saved, and the
	 * comment is marked with where the change is. Says whether anything changed, in which iteration, the new
	 * iteration's record when one was made, and the comment as it is marked now.
	 */
	finishPrototypeAddress(commentId: number): Promise<Result<PrototypeAddressed>>;
	/** Whether the iteration is on its published page, asked of GitHub. */
	publishedPage(projectId: string, name: string): Promise<Result<PageStatus>>;
	/** Opens the iteration's published page in the person's browser. Its address is worked out there, not taken from here. */
	openPublishedPage(projectId: string, name: string): Promise<Result<null>>;
	savePrototype(projectId: string, name: string): Promise<Result<null>>;
	/** The project's selected version, or null when none is. */
	selectedVersion(projectId: string): Promise<Result<number | null>>;
	/** Selects a version (null: none), and publishes it: the site's `latest` follows it. */
	selectVersion(projectId: string, version: number | null): Promise<Result<null>>;
	openPrototype(projectId: string, name: string): Promise<Result<string>>;
	/** What moving a prototype into the code would do in this checkout, asked before it is offered. */
	moveToCodePlan(root: string, projectId: string, name: string): Promise<Result<MoveToCodePlan>>;
	/** Whether a prototype can be built from this repository on this machine, and with which design system version. */
	prototypeReadiness(root: string): Promise<Result<PrototypeReadiness>>;
	/** The task that moves a prototype into the codebase: an audit of it against the real code, then the work. */
	prepareMoveToCode(projectId: string, name: string): Promise<Result<string>>;
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
	editorState(root: string, branch: string): Promise<Result<{ editor: boolean; session: boolean }>>;
	/** Opens the checkout in VS Code (or the folder, without it). */
	openInEditor(root: string): Promise<Result<null>>;
	/** Continues this branch's latest agent conversation in VS Code (or copies the command), taking over the app's run of it. */
	continueInClaude(root: string, branch: string): Promise<Result<'editor' | 'terminal'>>;
	onAgentLog(listener: (line: RunLogLine) => void): () => void;

	/** Begins device-flow sign-in. Resolves as soon as there is a code to show. */
	signInStart(): Promise<Result<DeviceCodeStart>>;
	signInCancel(): Promise<Result<null>>;
	signInState(): Promise<Result<SignInState>>;
	signOut(): Promise<Result<null>>;
	onSignInChanged(listener: (state: SignInState) => void): () => void;

	/** Reviewer mode: everything below reads the design repo through the API. */
	listProjects(): Promise<Result<Project[]>>;
	readComments(projectId: string, iteration: string): Promise<Result<ReviewComment[]>>;
	/** The text of one file in a project's folder (its brief, its review notes, …): this machine's copy if it has one, else GitHub's. */
	readRecord(projectId: string, name: string): Promise<Result<string>>;
	postComment(
		projectId: string,
		iteration: string,
		body: string,
		anchor: CommentAnchor | null,
		picture?: string | null,
	): Promise<Result<ReviewComment>>;

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

	/** Comment mode: resolves with the next element clicked, or null if cancelled. */
	pagePick(): Promise<Result<PickedPoint | null>>;
	pageCancelPick(): Promise<Result<null>>;
	pageShowMarkers(items: MarkerRequest[]): Promise<Result<MarkerResult[]>>;
	pageFocusMarker(id: number): Promise<Result<null>>;
	/** The preview moved to another page. */
	onPageRoute(listener: (route: string) => void): () => void;
	/** A pin on the page was clicked or moved. */
	onPinEvent(listener: (event: PinEvent) => void): () => void;
	/** Saves where a comment's pin now is. Only the comment's author can. */
	moveComment(commentId: number, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** Deletes a comment for good. GitHub decides who is allowed, and keeps no copy. */
	deleteComment(commentId: number): Promise<Result<null>>;
	/** Marks a comment resolved, or open again. GitHub decides who is allowed. */
	resolveComment(commentId: number, resolved: boolean): Promise<Result<ReviewComment>>;
	/**
	 * Records that the agent acted on a comment, with the commit it made, or clears that with null.
	 * Never resolves it: that is the person's to say, after looking at the change.
	 */
	markAddressed(commentId: number, commit: string | null): Promise<Result<ReviewComment>>;
	/** The commit an iteration's branch is at on this machine, to say what a comment was made against. Null if unknown. */
	iterationCommit(root: string, projectId: string, name: string): Promise<Result<string | null>>;
}

/** Who is signed in. */
export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** What the person types in, and where. */
export interface DeviceCodeStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export type SignInState =
  | { state: 'signedOut' }
  | { state: 'awaitingDevice'; userCode: string; verificationUri: string; expiresAt: string }
  | { state: 'signedIn'; user: GitHubUser };

/**
 * A project, read from the design repository through the API.
 *
 * Reviewers never clone anything: this is assembled from the repo's contents,
 * not from a checkout. Authors still work from a real checkout -- that is the
 * difference between the two modes.
 */
/** A repository discovery found, which the person has not accepted yet. */
/** A repository new work could start in. */
export interface Repository {
	/** `owner/repo` on GitHub; a folder name for a clone with no GitHub remote. */
	name: string;
	/** Its clone on this machine, or null when it has none. */
	root: string | null;
}

/** Where a repository would be placed in the clone folder, and whether it can be. */
export type ClonePlace =
	/** Nothing there, or an empty folder: it can be cloned here. */
	| { state: 'free'; path: string }
	/** A clone of this same repository is already there: it is used, not cloned again. */
	| { state: 'cloned'; path: string }
	/** Something else is there. It is never cloned over. */
	| { state: 'taken'; path: string; why: string };

/** What cloning a repository would do, said before it is done. */
export interface ClonePlan {
	/** `owner/repo`, as GitHub names it. */
	repository: string;
	place: ClonePlace;
	/** The place as a person reads it: `~/Documents/GitHub/flock-coke`. */
	where: string;
	/** The design repository, when it is not beside it yet: cloned too, since the work's records go there. */
	design: ClonePlace | null;
}

/** Where a clone has got to: which repository, git's phase ("Receiving objects"), and how far through it. */
export interface CloneProgress {
	repository: string;
	step: string;
	percent: number | null;
}

export interface CheckoutSuggestion {
  root: string;
  name: string;
  /** What the repository calls itself, read from its descriptor. */
  product: string;
}

export interface Project {
  /** Directory name under `projects/`, which is also the project id. */
  id: string;
  /** First heading of `brief.md`, or the id if it has none. */
  title: string;
  /** Files present in the project folder, for showing what a project has. */
  records: string[];
  /** Iterations found as branches, newest first. */
  iterations: ProjectIteration[];
  /** Everyone who has committed to the project: code on any iteration, or its design-repo folder. */
  people: Person[];
  /** Open comment count across the project's iterations. */
  openComments: number;
  /** True when the project exists only on this machine: built here, not yet shared. */
  localOnly?: boolean;
}

export interface ProjectIteration {
  name: string;
  branch: string;
  /** The issue that carries this iteration's comments, once one exists. */
  issueNumber: number | null;
  /** Preview URL recorded when the iteration was shared, if any. */
  previewUrl: string | null;
  /** The commit the iteration was last recorded at, so a comment can say what it was made against. */
  commit: string | null;
  contributors: Person[];
  /**
   * When the work was started, as an ISO date: its record's, or for work found only as a branch, its first
   * commit. Null when neither is known. A project's date is its earliest iteration's, and orders the list.
   */
  createdAt: string | null;
  /**
   * Where the work is in the running app (`/roles/compare`), so opening the iteration lands on what
   * was changed instead of the app's front door. Null when the record does not say.
   */
  route: string | null;
  /** True when this iteration exists only on this machine. */
  localOnly?: boolean;
}

/** Someone who has committed to a project. The login is known only when we could resolve one. */
export interface Person {
  name: string;
  login: string | null;
}

/** One reviewer comment, stored as a GitHub issue comment. */
/**
 * Whether a prototype iteration is on the published site: `published` with its link,
 * `publishing` while it is being put there, `unpublished` when it is saved but not deployed (with why, when a publish
 * was tried and stopped), `unavailable` when GitHub would not say, and `none` when there is no site to be on.
 */
export type PageStatus =
	| { state: 'none' }
	| { state: 'publishing' }
	| { state: 'unpublished'; why?: string }
	| { state: 'unavailable'; why: string }
	| { state: 'published'; url: string };

/** How an Address run on a prototype ended: see `finishPrototypeAddress`. */
export interface PrototypeAddressed {
	changed: boolean;
	iteration: string;
	made: Iteration | null;
	comment: ReviewComment;
}

export interface ReviewComment {
  id: number;
  author: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  resolved: boolean;
  /**
   * The commit the agent made when it acted on this comment, or null. Not the same as resolved: it
   * says a change is waiting for the person's verdict, which only they can give.
   */
  addressedAt: string | null;
  /** On a prototype, the iteration that change is in: the next one, when others had commented on this one. */
  addressedIn: string | null;
  /** Present once C2 anchors comments to an element; absent for page-level ones. */
  anchor: CommentAnchor | null;
  /** A small picture of the spot, as a JPEG data URL, taken when the comment was placed. Absent on older comments. */
  picture: string | null;
}

/**
 * Where a comment points.
 *
 * Recorded as several independent clues on purpose: a selector alone breaks the
 * moment the markup changes, and a comment that cannot be placed must degrade to
 * a page-level comment rather than vanish.
 */
export interface CommentAnchor {
  route: string;
  selector: string;
  nearbyText: string;
  viewport: { width: number; height: number };
  commit: string;
  /** Where in the element the click landed, 0 to 1 each way, so a marker sits where the comment was made. */
  offset?: { x: number; y: number };
  /** The kind of element it is (`p`, `button`), so "this subtext" and "this button" are told apart in words. */
  tag?: string;
  /**
   * The named containers it sits inside, outermost first, at most three: "Notification Preferences",
   * "Hotlist Hits". Text a person or an agent can search for, which a path of nth-of-type cannot be.
   */
  inside?: string[];
  /**
   * The page's query string when the comment was made (`?state=error`), which is what tells one state of a
   * prototype from another. Empty for the default state. Absent on comments made before this was recorded,
   * which are shown wherever their element is.
   */
  state?: string;
}

/** A comment to place on the page, numbered as it is listed beside it. */
export interface MarkerRequest {
  id: number;
  number: number;
  anchor: CommentAnchor;
  /** True for the viewer's own pins, which can be dragged. */
  movable?: boolean;
}

/** What a pin on the page reports: it was clicked, or it was dragged and dropped. */
export type PinEvent =
  | { kind: 'click'; id: number }
  | { kind: 'move'; id: number; anchor: CommentAnchor };

/** How a comment was placed on the page. `moved` follows the text; `missing` degrades to a page-level comment. */
export type MarkerState = 'found' | 'moved' | 'missing' | 'elsewhere' | 'otherState';
export interface MarkerResult {
  id: number;
  state: MarkerState;
}

/** Where a click landed: the anchor to store, and the point in the page, which is only for placing the comment box. */
export interface PickedPoint {
  anchor: CommentAnchor;
  at: { x: number; y: number };
  /** The element's own box in the page, so the picture can frame the element. Absent if it could not be measured. */
  box: { x: number; y: number; width: number; height: number } | null;
  /** The spot cropped from the page before any pin was drawn, if it could be taken. */
  picture: string | null;
}

/** Why the preview is hidden. A closed set, so the window cannot invent reasons. */
export const PAGE_HOLD_REASONS = ['popover', 'resize'] as const;
export type PageHoldReason = (typeof PAGE_HOLD_REASONS)[number];

/** Where the preview sits, in the window's own coordinates. */
export interface PageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Channel names, in one place so main and preload cannot drift. */
export const CHANNELS = {
	chooseCheckout: 'workspace:chooseCheckout',
	openCheckout: 'workspace:openCheckout',
	readContextReceipt: 'workspace:readContextReceipt',
	listIterations: 'workspace:listIterations',
	createIteration: 'workspace:createIteration',
	continueIteration: 'workspace:continueIteration',
	startCommand: 'workspace:startCommand',
	lastCheckout: 'workspace:lastCheckout',
	suggestCheckout: 'workspace:suggestCheckout',
	useCheckout: 'workspace:useCheckout',
	designSystemCatalog: 'workspace:designSystemCatalog',
	locateDesignSystem: 'workspace:locateDesignSystem',
	cloneDesignSystem: 'workspace:cloneDesignSystem',
	storyPreview: 'workspace:storyPreview',
	cloneFolder: 'workspace:cloneFolder',
	chooseCloneFolder: 'workspace:chooseCloneFolder',
	clonePlan: 'workspace:clonePlan',
	cloneRepository: 'workspace:cloneRepository',
	cancelClone: 'workspace:cancelClone',
	installPackages: 'workspace:installPackages',
	cancelInstall: 'workspace:cancelInstall',
	installLine: 'workspace:event:installLine',
	cloneProgress: 'workspace:event:cloneProgress',
	listRepositories: 'workspace:listRepositories',
	listBaseBranches: 'workspace:listBaseBranches',
	branchesWithSetup: 'workspace:branchesWithSetup',
	stopCommand: 'workspace:stopCommand',
	commandStatus: 'workspace:commandStatus',
	startAgent: 'workspace:startAgent',
	agentStatus: 'workspace:agentStatus',
	agentRecent: 'workspace:agentRecent',
	agentReadiness: 'workspace:agentReadiness',
	editorState: 'workspace:editorState',
	startHandoff: 'workspace:startHandoff',
	handoffResult: 'workspace:handoffResult',
	openInEditor: 'workspace:openInEditor',
	continueInClaude: 'workspace:continueInClaude',
	createPrototype: 'workspace:createPrototype',
	buildPrototype: 'workspace:buildPrototype',
	addressPrototype: 'workspace:addressPrototype',
	finishPrototypeAddress: 'workspace:finishPrototypeAddress',
	publishedPage: 'workspace:publishedPage',
	openPublishedPage: 'workspace:openPublishedPage',
	savePrototype: 'workspace:savePrototype',
	selectedVersion: 'workspace:selectedVersion',
	selectVersion: 'workspace:selectVersion',
	openPrototype: 'workspace:openPrototype',
	prepareMoveToCode: 'workspace:prepareMoveToCode',
	prototypeReadiness: 'workspace:prototypeReadiness',
	moveToCodePlan: 'workspace:moveToCodePlan',
	addressComments: 'workspace:addressComments',
	shareIteration: 'workspace:shareIteration',
	shareStatus: 'workspace:shareStatus',
	publishStatus: 'workspace:publishStatus',
	publishNow: 'workspace:publishNow',
	publishStatusChanged: 'workspace:event:publishStatus',
	shareStatusChanged: 'workspace:event:shareStatus',
	previewReachable: 'workspace:previewReachable',
	runLog: 'workspace:event:runLog',
	previewStatus: 'workspace:event:previewStatus',
	agentLog: 'workspace:event:agentLog',
	signInStart: 'workspace:signInStart',
	signInCancel: 'workspace:signInCancel',
	signInState: 'workspace:signInState',
	signOut: 'workspace:signOut',
	listProjects: 'workspace:listProjects',
	readComments: 'workspace:readComments',
	readRecord: 'workspace:readRecord',
	postComment: 'workspace:postComment',
	signInChanged: 'workspace:event:signInChanged',
	pageOpen: 'workspace:pageOpen',
	pageClose: 'workspace:pageClose',
	openPreviewInBrowser: 'workspace:openPreviewInBrowser',
	pageSetBounds: 'workspace:pageSetBounds',
	pageHold: 'workspace:pageHold',
	pageSnapshot: 'workspace:pageSnapshot',
	pagePick: 'workspace:pagePick',
	pageCancelPick: 'workspace:pageCancelPick',
	pageShowMarkers: 'workspace:pageShowMarkers',
	pageFocusMarker: 'workspace:pageFocusMarker',
	pageRoute: 'workspace:event:pageRoute',
	pinEvent: 'workspace:event:pinEvent',
	moveComment: 'workspace:moveComment',
	resolveComment: 'workspace:resolveComment',
	markAddressed: 'workspace:markAddressed',
	deleteComment: 'workspace:deleteComment',
	iterationCommit: 'workspace:iterationCommit',
} as const;
