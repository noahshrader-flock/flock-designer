import { describe, expect, it, vi } from 'vitest';
import { listenForDsnr, relayComments } from '../src/viewer/relay';

/**
 * The review page's side of commenting through DSNR (4.2): it listens only when it is served from this machine and in a
 * frame, takes DSNR's review tab as the one that said hello from VS Code, and from then on asks only it.
 */

const TAB = 'vscode-webview://0a1b2c';

/** A page at `host`, framed (or not), whose parent keeps what is posted to it. */
const pageAt = (host: string, framed = true) => {
	const posted: { message: unknown; origin: string }[] = [];
	let heard: ((e: { source: unknown; origin: string; data: unknown }) => void) | null = null;
	const parent = { postMessage: (message: unknown, origin: string) => void posted.push({ message, origin }) };
	const win = {
		location: { hostname: host },
		addEventListener: (_: string, l: typeof heard) => void (heard = l),
		removeEventListener: () => void (heard = null),
	} as unknown as Window & { parent: unknown };
	(win as { parent: unknown }).parent = framed ? parent : win;
	const say = (data: unknown, { origin = TAB, source = parent }: { origin?: string; source?: unknown } = {}) => heard?.({ source, origin, data });
	return { win, posted, say, listening: () => heard !== null };
};

describe('listening for DSNR', () => {
	it('is only for a page served from this machine, in a frame', () => {
		expect(pageAt('127.0.0.1').listening()).toBe(false);
		for (const [host, framed, listens] of [
			['127.0.0.1', true, true],
			['localhost', true, true],
			['127.0.0.1', false, false],
			['noahshrader-flock.github.io', true, false],
		] as const) {
			const page = pageAt(host, framed);
			listenForDsnr(page.win, () => undefined);
			expect(page.listening()).toBe(listens);
		}
	});

	it('takes the tab that said hello from VS Code, and asks only it, answered by id', async () => {
		const page = pageAt('127.0.0.1');
		const found = vi.fn();
		listenForDsnr(page.win, found);
		page.say({ dsnr: 'hello' }, { origin: 'https://elsewhere.example' });
		page.say({ dsnr: 'hello' }, { source: {} });
		expect(found).not.toHaveBeenCalled();
		page.say({ dsnr: 'hello' });
		expect(found).toHaveBeenCalledTimes(1);

		const relay = found.mock.calls[0]![0] as Parameters<Parameters<typeof listenForDsnr>[1]>[0];
		const asked = relay.ask('signInState', []);
		expect(page.posted).toEqual([{ message: { dsnr: 'ask', id: 1, name: 'signInState', args: [] }, origin: TAB }]);
		// An answer from anywhere else, or not in its shape, is not taken.
		page.say({ dsnr: 'answer', id: 1, result: { ok: true, value: 'forged' } }, { origin: 'vscode-webview://other' });
		page.say({ dsnr: 'answer', id: 1, result: 'forged' });
		page.say({ dsnr: 'answer', id: 1, result: { ok: true, value: { state: 'signedOut' } } });
		expect(await asked).toEqual({ ok: true, value: { state: 'signedOut' } });
		// A second hello changes nothing.
		page.say({ dsnr: 'hello' });
		expect(found).toHaveBeenCalledTimes(1);
	});
});

describe('the comments, through DSNR', () => {
	it('are the core’s comment calls for this iteration, and the viewer is who is signed in', async () => {
		const ask = vi.fn(async (name: string) =>
			name === 'signInState' ? { ok: true as const, value: { state: 'signedIn', user: { login: 'noah' } } } : { ok: true as const, value: null },
		);
		const store = relayComments({ ask }, { projectId: 'demo', branch: 'prototype/demo/v1-i1' });
		const ref = { thread: 7, id: 70 };
		const anchor = { selector: 'h1' } as never;
		await store.read();
		await store.post('Bigger', anchor, 'data:image/jpeg;base64,AAAA');
		await store.resolve(ref, true);
		await store.move(ref, anchor);
		await store.remove(ref);
		expect(ask.mock.calls).toEqual([
			['readComments', ['demo', 'prototype/demo/v1-i1']],
			// No picture of the spot: a page cannot take one of itself.
			['postComment', ['demo', 'prototype/demo/v1-i1', 'Bigger', anchor, null]],
			['resolveComment', [ref, true]],
			['moveComment', [ref, anchor]],
			['deleteComment', [ref]],
		]);
		expect(await store.viewer()).toBe('noah');
		expect(await store.version()).toBe('');
	});
});
