import { EVENTS, type EventName, INVOKE, type InvokeName, type WorkspaceApi } from './contract';

/**
 * The window's API, built from the contract's one table, whatever carries it: `invoke` sends a call by its name,
 * `subscribe` listens for an event by its name and returns how to stop. a webview's messages in the VS Code extension,
 * a relay's on the published page. Each method is one name in the table, so there is no way to reach a call that is not
 * listed and no way to pass a name in: the difference between a bridge and a hole. Arguments go as given, and are checked
 * where they arrive.
 */
export const createApi = (
	invoke: (name: InvokeName, args: unknown[]) => Promise<unknown>,
	subscribe: (name: EventName, listener: (payload: unknown) => void) => () => void,
): WorkspaceApi =>
	Object.fromEntries([
		...INVOKE.map((name) => [name, (...args: unknown[]) => invoke(name, args)]),
		...(Object.keys(EVENTS) as EventName[]).map((name) => [name, (listener: (payload: unknown) => void) => subscribe(name, listener)]),
	]) as unknown as WorkspaceApi;
