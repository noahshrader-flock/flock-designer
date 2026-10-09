import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/contract';
import type {
	BuildInClaude,
	Catalog,
	StoryPreview,
	AgentStatus,
	Checkout,
	ClonePlan,
	CloneProgress,
	CheckoutSuggestion,
	DeviceCodeStart,
	ContextReceipt,
	Iteration,
	MarkerResult,
	PickedPoint,
	PinEvent,
	PublishStatus,
	ShareStatus,
	PreviewStatus,
	Project,
	Result,
	ReviewComment,
	RunLogLine,
	SignInState,
	WorkspaceApi,
	Repository,
	AgentReadiness,
	PrototypeReadiness,
	MoveToCodePlan,
	PrototypeAddressed,
	PageStatus,
} from '../shared/contract';

/**
 * The entire surface the window can see.
 *
 * Each method forwards to one named channel. There is no way to reach a channel
 * that is not listed here, and no way to pass a channel name in -- which is the
 * difference between a bridge and a hole.
 */

const invoke = <T>(channel: string, ...args: unknown[]): Promise<Result<T>> =>
	ipcRenderer.invoke(channel, ...args) as Promise<Result<T>>;

/** Subscribes and returns the unsubscribe, so a component cannot leak a listener. */
const subscribe = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
	const handler = (_event: unknown, payload: T) => listener(payload);
	ipcRenderer.on(channel, handler);
	return () => {
		ipcRenderer.removeListener(channel, handler);
	};
};

const api: WorkspaceApi = {
	chooseCheckout: () => invoke<Checkout | null>(CHANNELS.chooseCheckout),
	openCheckout: (root) => invoke<Checkout>(CHANNELS.openCheckout, root),
	readContextReceipt: (root) => invoke<ContextReceipt>(CHANNELS.readContextReceipt, root),

	listIterations: (root, projectId) => invoke<Iteration[]>(CHANNELS.listIterations, root, projectId),
	listRepositories: () => invoke<Repository[]>(CHANNELS.listRepositories),
	listBaseBranches: (root) => invoke<string[]>(CHANNELS.listBaseBranches, root),
	branchesWithSetup: (root) => invoke<string[]>(CHANNELS.branchesWithSetup, root),
	continueIteration: (root, projectId, name) => invoke<Iteration>(CHANNELS.continueIteration, root, projectId, name),

	startCommand: (root, commandId, projectId) => invoke<PreviewStatus>(CHANNELS.startCommand, root, commandId, projectId),
	lastCheckout: () => invoke<Checkout | null>(CHANNELS.lastCheckout),
	suggestCheckout: () => invoke<CheckoutSuggestion | null>(CHANNELS.suggestCheckout),
	useCheckout: (root) => invoke<Checkout>(CHANNELS.useCheckout, root),
	designSystemCatalog: (refresh) => invoke<Catalog>(CHANNELS.designSystemCatalog, refresh),
	locateDesignSystem: () => invoke<boolean>(CHANNELS.locateDesignSystem),
	cloneDesignSystem: (repository) => invoke<null>(CHANNELS.cloneDesignSystem, repository),
	storyPreview: () => invoke<StoryPreview>(CHANNELS.storyPreview),
	cloneFolder: () => invoke<string>(CHANNELS.cloneFolder),
	chooseCloneFolder: () => invoke<string | null>(CHANNELS.chooseCloneFolder),
	clonePlan: (repository) => invoke<ClonePlan>(CHANNELS.clonePlan, repository),
	cloneRepository: (repository) => invoke<Checkout>(CHANNELS.cloneRepository, repository),
	cancelClone: () => invoke<null>(CHANNELS.cancelClone),
	installPackages: (root) => invoke<null>(CHANNELS.installPackages, root),
	cancelInstall: () => invoke<null>(CHANNELS.cancelInstall),
	onInstallLine: (listener) => subscribe<string>(CHANNELS.installLine, listener),
	onCloneProgress: (listener) => subscribe<CloneProgress>(CHANNELS.cloneProgress, listener),
	stopCommand: (root, commandId) => invoke<PreviewStatus>(CHANNELS.stopCommand, root, commandId),
	commandStatus: (root, commandId) => invoke<PreviewStatus>(CHANNELS.commandStatus, root, commandId),
	onRunLog: (listener) => subscribe<RunLogLine>(CHANNELS.runLog, listener),
	onPreviewStatus: (listener) => subscribe<PreviewStatus>(CHANNELS.previewStatus, listener),

	startAgent: (root, projectId, task) => invoke<AgentStatus>(CHANNELS.startAgent, root, projectId, task),
	agentStatus: () => invoke<AgentStatus>(CHANNELS.agentStatus),
	agentRecent: () => invoke<{ work: string | null; lines: string[] }>(CHANNELS.agentRecent),
	agentReadiness: () => invoke<AgentReadiness>(CHANNELS.agentReadiness),
	editorState: (root, branch) => invoke<{ editor: boolean; session: boolean }>(CHANNELS.editorState, root, branch),
	startHandoff: (root, projectId) => invoke<AgentStatus>(CHANNELS.startHandoff, root, projectId),
	handoffResult: (root) => invoke<boolean | null>(CHANNELS.handoffResult, root),
	openInEditor: (root) => invoke<null>(CHANNELS.openInEditor, root),
	continueInClaude: (root, branch) => invoke<'editor' | 'terminal'>(CHANNELS.continueInClaude, root, branch),
	createPrototype: (projectId, title, note, from) => invoke<Iteration>(CHANNELS.createPrototype, projectId, title, note, from ?? null),
	buildPrototype: (projectId, name, request) => invoke<AgentStatus>(CHANNELS.buildPrototype, projectId, name, request),
	addressPrototype: (projectId, name, commentId) => invoke<AgentStatus>(CHANNELS.addressPrototype, projectId, name, commentId),
	finishPrototypeAddress: (commentId) => invoke<PrototypeAddressed>(CHANNELS.finishPrototypeAddress, commentId),
	publishedPage: (projectId, name) => invoke<PageStatus>(CHANNELS.publishedPage, projectId, name),
	openPublishedPage: (projectId, name) => invoke<null>(CHANNELS.openPublishedPage, projectId, name),
	savePrototype: (projectId, name) => invoke<null>(CHANNELS.savePrototype, projectId, name),
	openPrototype: (projectId, name) => invoke<string>(CHANNELS.openPrototype, projectId, name),
	prototypeReadiness: (root) => invoke<PrototypeReadiness>(CHANNELS.prototypeReadiness, root),
	moveToCodePlan: (root, projectId, name) => invoke<MoveToCodePlan>(CHANNELS.moveToCodePlan, root, projectId, name),
	buildInClaude: (root, projectId, name, from) => invoke<BuildInClaude>(CHANNELS.buildInClaude, root, projectId, name, from),
	addressComments: (root, projectId, name, commentId) => invoke<AgentStatus>(CHANNELS.addressComments, root, projectId, name, commentId),
	shareIteration: (root, projectId, name) => invoke<ShareStatus>(CHANNELS.shareIteration, root, projectId, name),
	shareStatus: () => invoke<ShareStatus>(CHANNELS.shareStatus),
	publishStatus: () => invoke<PublishStatus>(CHANNELS.publishStatus),
	publishNow: () => invoke<PublishStatus>(CHANNELS.publishNow),
	onPublishStatus: (listener) => subscribe<PublishStatus>(CHANNELS.publishStatusChanged, listener),
	onShareStatus: (listener) => subscribe<ShareStatus>(CHANNELS.shareStatusChanged, listener),
	previewReachable: (url) => invoke<boolean>(CHANNELS.previewReachable, url),
	onAgentLog: (listener) => subscribe<RunLogLine>(CHANNELS.agentLog, listener),

	signInStart: () => invoke<DeviceCodeStart>(CHANNELS.signInStart),
	signInCancel: () => invoke<null>(CHANNELS.signInCancel),
	signInState: () => invoke<SignInState>(CHANNELS.signInState),
	signOut: () => invoke<null>(CHANNELS.signOut),
	onSignInChanged: (listener) => subscribe<SignInState>(CHANNELS.signInChanged, listener),

	listProjects: () => invoke<Project[]>(CHANNELS.listProjects),
	readRecord: (projectId, name) => invoke<string>(CHANNELS.readRecord, projectId, name),
	readComments: (projectId, iteration) => invoke<ReviewComment[]>(CHANNELS.readComments, projectId, iteration),
	postComment: (projectId, iteration, body, anchor, picture) =>
		invoke<ReviewComment>(CHANNELS.postComment, projectId, iteration, body, anchor, picture ?? null),

	pageOpen: (url) => invoke<null>(CHANNELS.pageOpen, url),
	pageClose: () => invoke<null>(CHANNELS.pageClose),
	openPreviewInBrowser: () => invoke<null>(CHANNELS.openPreviewInBrowser),
	pageSetBounds: (bounds) => invoke<null>(CHANNELS.pageSetBounds, bounds),
	pageHold: (reason, held) => invoke<null>(CHANNELS.pageHold, reason, held),
	pageSnapshot: () => invoke<string | null>(CHANNELS.pageSnapshot),
	pagePick: () => invoke<PickedPoint | null>(CHANNELS.pagePick),
	pageCancelPick: () => invoke<null>(CHANNELS.pageCancelPick),
	pageShowMarkers: (items) => invoke<MarkerResult[]>(CHANNELS.pageShowMarkers, items),
	pageFocusMarker: (id) => invoke<null>(CHANNELS.pageFocusMarker, id),
	onPageRoute: (listener) => subscribe<string>(CHANNELS.pageRoute, listener),
	onPinEvent: (listener) => subscribe<PinEvent>(CHANNELS.pinEvent, listener),
	deleteComment: (commentId) => invoke<null>(CHANNELS.deleteComment, commentId),
	resolveComment: (commentId, resolved) => invoke<ReviewComment>(CHANNELS.resolveComment, commentId, resolved),
	markAddressed: (commentId, commit) => invoke<ReviewComment>(CHANNELS.markAddressed, commentId, commit),
	iterationCommit: (root, projectId, name) => invoke<string | null>(CHANNELS.iterationCommit, root, projectId, name),
	moveComment: (commentId, anchor) => invoke<ReviewComment>(CHANNELS.moveComment, commentId, anchor),
};

contextBridge.exposeInMainWorld('workspace', api);
