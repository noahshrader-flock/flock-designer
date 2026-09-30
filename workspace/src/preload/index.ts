import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/contract';
import type {
	AgentStatus,
	Checkout,
	ContextReceipt,
	Iteration,
	PreviewStatus,
	Result,
	RunLogLine,
	WorkspaceApi,
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
	createIteration: (root, projectId, note) => invoke<Iteration>(CHANNELS.createIteration, root, projectId, note),
	continueIteration: (root, projectId, name) => invoke<Iteration>(CHANNELS.continueIteration, root, projectId, name),

	startCommand: (root, commandId) => invoke<PreviewStatus>(CHANNELS.startCommand, root, commandId),
	stopCommand: (root, commandId) => invoke<PreviewStatus>(CHANNELS.stopCommand, root, commandId),
	commandStatus: (root, commandId) => invoke<PreviewStatus>(CHANNELS.commandStatus, root, commandId),
	onRunLog: (listener) => subscribe<RunLogLine>(CHANNELS.runLog, listener),
	onPreviewStatus: (listener) => subscribe<PreviewStatus>(CHANNELS.previewStatus, listener),

	startAgent: (root, projectId, task) => invoke<AgentStatus>(CHANNELS.startAgent, root, projectId, task),
	agentStatus: () => invoke<AgentStatus>(CHANNELS.agentStatus),
	onAgentLog: (listener) => subscribe<RunLogLine>(CHANNELS.agentLog, listener),
};

contextBridge.exposeInMainWorld('workspace', api);
