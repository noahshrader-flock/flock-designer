import { describe, expect, it, vi } from 'vitest';
import { connectPage } from '../extension/webview/workspace';

/**
 * The window's API in DSNR's panel (Phase 3.1): the app's own `createApi`, carried by webview messages. A call goes out
 * with an id and comes back by it; an event comes to whoever listens for it by name.
 */

const wire = () => {
	const sent: unknown[] = [];
	let deliver: (m: unknown) => void = () => undefined;
	const page = connectPage(
		(m) => sent.push(m),
		(listener) => (deliver = listener),
	);
	const api = page.workspace as unknown as Record<string, (...a: unknown[]) => unknown>;
	return { api, asks: page.asks, sent, deliver: (m: unknown) => deliver(m) };
};

describe('the panel’s calls to the core', () => {
	it('send a call by its name with an id, and resolve with the answer that comes back with it', async () => {
		const { api, sent, deliver } = wire();
		const a = api.listProjects?.() as Promise<unknown>;
		const b = api.readCheckout?.('/a') as Promise<unknown>;
		expect(sent).toEqual([
			{ type: 'call', id: 1, name: 'listProjects', args: [] },
			{ type: 'call', id: 2, name: 'readCheckout', args: ['/a'] },
		]);
		deliver({ type: 'answer', id: 2, result: { ok: true, value: 'b' } });
		deliver({ type: 'answer', id: 1, result: { ok: true, value: 'a' } });
		await expect(a).resolves.toEqual({ ok: true, value: 'a' });
		await expect(b).resolves.toEqual({ ok: true, value: 'b' });
	});

	it('send the extension’s asks the same way, by name, numbered with the core’s calls', async () => {
		const { api, asks, sent, deliver } = wire();
		void api.listProjects?.();
		const opened = asks.openComponent('src/A.stories.tsx');
		expect(sent.at(-1)).toEqual({ type: 'call', id: 2, name: 'openComponent', args: ['src/A.stories.tsx'] });
		deliver({ type: 'answer', id: 2, result: { ok: true, value: null } });
		await expect(opened).resolves.toEqual({ ok: true, value: null });
	});

	it('ignore an answer to nothing asked', () => {
		const { deliver } = wire();
		expect(() => deliver({ type: 'answer', id: 99, result: { ok: true, value: null } })).not.toThrow();
	});
});

describe('the core’s events in the panel', () => {
	it('reach each listener for that event, until it stops', () => {
		const { api, deliver } = wire();
		const heard = vi.fn();
		const stop = api.onSignInChanged?.(heard) as () => void;
		deliver({ type: 'event', name: 'onSignInChanged', payload: { state: 'signedOut' } });
		deliver({ type: 'event', name: 'onRunLog', payload: 'not this one' });
		stop();
		deliver({ type: 'event', name: 'onSignInChanged', payload: { state: 'signedOut' } });
		expect(heard.mock.calls).toEqual([[{ state: 'signedOut' }]]);
	});
});
