import { describe, expect, it, vi } from 'vitest';
import { EVENTS, INVOKE } from '../src/shared/contract';
import { createApi } from '../src/shared/workspaceApi';

/**
 * The window's API, built one way from the contract's table (ELECTRON_MIGRATION_PLAN, Phase 1.2), whatever carries it:
 * Electron's IPC in the app's preload, a webview's messages in VS Code. A method is a call or an event by its name, and
 * nothing else: no generic invoke, no channel passed in.
 */

describe('the window’s API', () => {
	const make = () => {
		const unsubscribe = vi.fn();
		const invoke = vi.fn(async (name: string, args: unknown[]) => ({ ok: true, value: [name, args] }));
		const subscribe = vi.fn(() => unsubscribe);
		return { api: createApi(invoke, subscribe) as unknown as Record<string, (...a: unknown[]) => unknown>, invoke, subscribe, unsubscribe };
	};

	it('has every call and every event in the table, and nothing more', () => {
		expect(Object.keys(make().api).sort()).toEqual([...INVOKE, ...Object.keys(EVENTS)].sort());
	});

	it('sends a call by its name, with its arguments as given, and answers with what came back', async () => {
		const { api, invoke } = make();
		await expect(api.readCheckout?.('/a', 2)).resolves.toEqual({ ok: true, value: ['readCheckout', ['/a', 2]] });
		expect(invoke).toHaveBeenCalledWith('readCheckout', ['/a', 2]);
	});

	it('listens for an event by its name, and gives back the way to stop', () => {
		const { api, subscribe, unsubscribe } = make();
		const listener = vi.fn();
		const stop = api.onRunLog?.(listener) as () => void;
		expect(subscribe).toHaveBeenCalledWith('onRunLog', listener);
		stop();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});
});
