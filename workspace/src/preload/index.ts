import { contextBridge, ipcRenderer } from 'electron';
import { eventChannel, invokeChannel } from '../shared/contract';
import { createApi } from '../shared/workspaceApi';

/**
 * The entire surface the window can see, built from the one table of it (`createApi`), carried by Electron's IPC: each
 * call on its own channel, each event on its own. What the window sends is checked in the main process, never trusted
 * here.
 */
const api = createApi(
	(name, args) => ipcRenderer.invoke(invokeChannel(name), ...args),
	(name, listener) => {
		// Subscribes and returns the unsubscribe, so a component cannot leak a listener.
		const handler = (_event: unknown, payload: unknown) => listener(payload);
		ipcRenderer.on(eventChannel(name), handler);
		return () => {
			ipcRenderer.removeListener(eventChannel(name), handler);
		};
	},
);

contextBridge.exposeInMainWorld('workspace', api);
