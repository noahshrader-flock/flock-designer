import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EVENTS, type EventName, INVOKE, type WorkspaceApi, eventChannel, invokeChannel } from '../src/shared/contract';

/** The preload as the window gets it: what it puts in the page, and what each method sends where. */
const sent: unknown[][] = [];
const heard: string[] = [];
let exposed: Record<string, (...args: unknown[]) => unknown> = {};
vi.mock('electron', () => ({
	contextBridge: { exposeInMainWorld: (_key: string, api: Record<string, (...args: unknown[]) => unknown>) => void (exposed = api) },
	ipcRenderer: {
		invoke: (...args: unknown[]) => (sent.push(args), Promise.resolve({ ok: true, value: null })),
		on: (channel: string) => void heard.push(channel),
		removeListener: () => undefined,
	},
}));

beforeAll(async () => {
	await import('../src/preload/index');
});

describe('what the window can reach', () => {
	it('is every method of the API, and nothing else', () => {
		expect(Object.keys(exposed).sort()).toEqual([...INVOKE, ...Object.keys(EVENTS)].sort());
	});

	it('sends each call on its own channel, with its arguments as given', async () => {
		for (const name of INVOKE) await exposed[name]?.('a', 2, null);
		expect(sent).toEqual(INVOKE.map((name) => [invokeChannel(name), 'a', 2, null]));
	});

	it('hears each event on its own channel, the two older names included', () => {
		const names = Object.keys(EVENTS) as EventName[];
		for (const name of names) exposed[name]?.(() => undefined);
		expect(heard).toEqual(names.map(eventChannel));
		expect(eventChannel('onPublishStatus' satisfies keyof WorkspaceApi)).toBe('workspace:event:publishStatus');
	});
});
