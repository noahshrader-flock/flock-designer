import { type BrowserWindow, ipcMain } from 'electron';
import { eventChannel, invokeChannel } from '../shared/contract';
import { type EventSink, served } from './handle';

/**
 * The app's way to the window: Electron's IPC. Every call the core registered (`handle`) is answered on its channel, and
 * every event the core sends goes to the window on its own. The one place the core's table meets Electron.
 */
export const serveOverIpc = (): void => {
	for (const [name, route] of served()) ipcMain.handle(invokeChannel(name), (_event, ...sent: unknown[]) => route(...sent));
};

/** Sends each event the core tells (`EventSink`) to `window`, on the event's own channel. */
export const sendOverIpc =
	(window: BrowserWindow): EventSink =>
	(name, payload) =>
		window.webContents.send(eventChannel(name), payload);
