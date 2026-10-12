import { contextBridge, ipcRenderer } from 'electron';
import { EVENTS, type EventName, INVOKE, type WorkspaceApi, eventChannel, invokeChannel } from '../shared/contract';

/**
 * The entire surface the window can see, built from the one table of it (`INVOKE` and `EVENTS`, in the contract).
 *
 * Each method forwards to one named channel. There is no way to reach a channel that is not listed there, and no way to
 * pass a channel name in -- which is the difference between a bridge and a hole. Arguments go as given: what the window
 * sends is checked in the main process, never trusted here.
 */

/** Subscribes and returns the unsubscribe, so a component cannot leak a listener. */
const subscribe = (channel: string, listener: (payload: unknown) => void): (() => void) => {
	const handler = (_event: unknown, payload: unknown) => listener(payload);
	ipcRenderer.on(channel, handler);
	return () => {
		ipcRenderer.removeListener(channel, handler);
	};
};

const api = Object.fromEntries([
	...INVOKE.map((name) => {
		const channel = invokeChannel(name);
		return [name, (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)];
	}),
	...(Object.keys(EVENTS) as EventName[]).map((name) => {
		const channel = eventChannel(name);
		return [name, (listener: (payload: unknown) => void) => subscribe(channel, listener)];
	}),
]) as unknown as WorkspaceApi;

contextBridge.exposeInMainWorld('workspace', api);
