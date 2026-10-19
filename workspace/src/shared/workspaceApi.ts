import { EVENTS, type EventName, INVOKE, type InvokeName, type WorkspaceApi } from './contract';

/**
 * Each method is one name in the contract's table, so no unlisted call can be reached and no name passed in. Arguments are
 * checked where they arrive.
 */
export const createApi = (
	invoke: (name: InvokeName, args: unknown[]) => Promise<unknown>,
	subscribe: (name: EventName, listener: (payload: unknown) => void) => () => void,
): WorkspaceApi =>
	Object.fromEntries([
		...INVOKE.map((name) => [name, (...args: unknown[]) => invoke(name, args)]),
		...(Object.keys(EVENTS) as EventName[]).map((name) => [name, (listener: (payload: unknown) => void) => subscribe(name, listener)]),
	]) as unknown as WorkspaceApi;
