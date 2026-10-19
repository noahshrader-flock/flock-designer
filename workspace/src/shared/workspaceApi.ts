import { EVENTS, type EventName, INVOKE, type InvokeName, type WorkspaceApi } from './contract';

/**
 * The window's API from the contract's one table, whatever carries it (a webview's messages in VS Code, a relay's on the
 * published page). Each method is one name in the table, so no unlisted call can be reached and no name passed in: the
 * difference between a bridge and a hole. Arguments are checked where they arrive.
 */
export const createApi = (
	invoke: (name: InvokeName, args: unknown[]) => Promise<unknown>,
	subscribe: (name: EventName, listener: (payload: unknown) => void) => () => void,
): WorkspaceApi =>
	Object.fromEntries([
		...INVOKE.map((name) => [name, (...args: unknown[]) => invoke(name, args)]),
		...(Object.keys(EVENTS) as EventName[]).map((name) => [name, (listener: (payload: unknown) => void) => subscribe(name, listener)]),
	]) as unknown as WorkspaceApi;
