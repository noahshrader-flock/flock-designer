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
}

export type PreviewStatus =
	| { state: 'stopped' }
	| { state: 'starting'; commandId: string }
	| { state: 'running'; commandId: string; url: string }
	| { state: 'failed'; commandId: string; detail: string };

/** A line of output from a running command, for the log surface. */
export interface RunLogLine {
	commandId: string;
	stream: 'stdout' | 'stderr';
	text: string;
}

export type AgentStatus =
	| { state: 'idle' }
	| { state: 'running'; startedAt: string }
	| { state: 'finished'; exitCode: number }
	| { state: 'unavailable'; detail: string };

/**
 * A result that carries its failure instead of throwing across the bridge.
 *
 * An exception crossing IPC arrives as a string with no shape. Every operation
 * that can fail for an ordinary reason -- no descriptor, dirty tree, command not
 * allowed -- returns this, so the renderer can say what happened.
 */
/** Whether an iteration's record reached the design repository, where reviewers read it. */
export type PublishOutcome = { state: 'published' } | { state: 'skipped'; reason: string };

/** An iteration, plus what happened when its record was shared. The local save never depends on it. */
export type SavedIteration = Iteration & { published: PublishOutcome };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface WorkspaceApi {
	/** Native directory picker. Resolves to null if the designer cancels. */
	chooseCheckout(): Promise<Result<Checkout | null>>;
	/** Open a checkout by path, validating it is a repository. */
	openCheckout(root: string): Promise<Result<Checkout>>;
	/** Read the repository's descriptor and resolve what it points at. */
	readContextReceipt(root: string): Promise<Result<ContextReceipt>>;

	listIterations(root: string, projectId: string): Promise<Result<Iteration[]>>;
	/** Creates the branch. Refuses if the tree is dirty; never discards work. */
	createIteration(root: string, projectId: string, note: string): Promise<Result<SavedIteration>>;
	/** Checks out an existing iteration's branch. */
	continueIteration(root: string, projectId: string, name: string): Promise<Result<SavedIteration>>;

	startCommand(root: string, commandId: string): Promise<Result<PreviewStatus>>;
	stopCommand(root: string, commandId: string): Promise<Result<PreviewStatus>>;
	commandStatus(root: string, commandId: string): Promise<Result<PreviewStatus>>;
	onRunLog(listener: (line: RunLogLine) => void): () => void;
	onPreviewStatus(listener: (status: PreviewStatus) => void): () => void;

	/** Hands the task to the locally installed agent. Never bundles credentials. */
	startAgent(root: string, projectId: string, task: string): Promise<Result<AgentStatus>>;
	agentStatus(): Promise<Result<AgentStatus>>;
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
	postComment(projectId: string, iteration: string, body: string): Promise<Result<ReviewComment>>;
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
export interface Project {
  /** Directory name under `projects/`, which is also the project id. */
  id: string;
  /** First heading of `brief.md`, or the id if it has none. */
  title: string;
  /** Files present in the project folder, for showing what a project has. */
  records: string[];
  /** Iterations found as branches, newest first. */
  iterations: ProjectIteration[];
  /** Open comment count across the project's iterations. */
  openComments: number;
}

export interface ProjectIteration {
  name: string;
  branch: string;
  /** The issue that carries this iteration's comments, once one exists. */
  issueNumber: number | null;
  /** Preview URL recorded when the iteration was shared, if any. */
  previewUrl: string | null;
}

/** One reviewer comment, stored as a GitHub issue comment. */
export interface ReviewComment {
  id: number;
  author: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  resolved: boolean;
  /** Present once C2 anchors comments to an element; absent for page-level ones. */
  anchor: CommentAnchor | null;
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
	stopCommand: 'workspace:stopCommand',
	commandStatus: 'workspace:commandStatus',
	startAgent: 'workspace:startAgent',
	agentStatus: 'workspace:agentStatus',
	runLog: 'workspace:event:runLog',
	previewStatus: 'workspace:event:previewStatus',
	agentLog: 'workspace:event:agentLog',
	signInStart: 'workspace:signInStart',
	signInCancel: 'workspace:signInCancel',
	signInState: 'workspace:signInState',
	signOut: 'workspace:signOut',
	listProjects: 'workspace:listProjects',
	readComments: 'workspace:readComments',
	postComment: 'workspace:postComment',
	signInChanged: 'workspace:event:signInChanged',
} as const;
