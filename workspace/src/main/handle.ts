import { type BrowserWindow, ipcMain } from 'electron';
import { type Answer, type EventName, type InvokeName, type Payload, type Result, eventChannel, invokeChannel } from '../shared/contract';
import { fail, ok } from '../shared/result';

/**
 * How the main process meets the window: each call registered by its name in the contract's table, its answer checked
 * against `WorkspaceApi`, and each event sent by name with the payload its listener expects.
 *
 * A handler returns its answer or throws a sentence for a person; it never returns a Result itself. An exception
 * crossing IPC arrives as a shapeless string, which is how a real problem turns into "something went wrong", so this is
 * the one place a throw becomes a Result.
 */

export const guard =
	<Args extends unknown[], T>(fn: (...args: Args) => Promise<T> | T) =>
	async (_event: Electron.IpcMainInvokeEvent, ...args: Args): Promise<Result<T>> => {
		try {
			return ok(await fn(...args));
		} catch (err) {
			return fail(err);
		}
	};

/** Answers the window's call `name`. */
// The arguments are whatever the window sent; each handler says what it takes (MAIN-10 makes that a check).
export const handle = <K extends InvokeName>(name: K, fn: (...args: any[]) => Answer<K> | Promise<Answer<K>>): void =>
	ipcMain.handle(invokeChannel(name), guard(fn));

/** Tells the window that `name` happened. */
export const emit = <K extends EventName>(window: BrowserWindow, name: K, payload: Payload<K>): void =>
	window.webContents.send(eventChannel(name), payload);
