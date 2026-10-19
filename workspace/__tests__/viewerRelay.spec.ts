import { describe, expect, it, vi } from 'vitest';
import { versionAddress, keyFromAddress, listenForDsnr, relayComments, serverRelay } from '../src/viewer/relay';

const TAB = 'vscode-webview://0a1b2c';

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

describe('the tab’s theme', () => {
	it('is taken from the tab that said hello, as it changes, and from no other', () => {
		const page = pageAt('127.0.0.1');
		const theme = vi.fn();
		listenForDsnr(page.win, () => undefined, theme);
		const dark = { kind: 'vscode-dark', colors: { '--vscode-foreground': '#cccccc' } };
		const light = { kind: 'vscode-light', colors: {} };
		page.say({ dsnr: 'scheme', theme: dark });
		page.say({ dsnr: 'hello' });
		page.say({ dsnr: 'scheme', theme: dark }, { origin: 'vscode-webview://other' });
		page.say({ dsnr: 'scheme', theme: dark }, { source: {} });
		page.say({ dsnr: 'scheme', dark: true });
		expect(theme).not.toHaveBeenCalled();
		page.say({ dsnr: 'scheme', theme: dark });
		page.say({ dsnr: 'scheme', theme: light });
		expect(theme.mock.calls).toEqual([[dark], [light]]);
	});
});

describe('the comments, through DSNR', () => {
	it('are the core’s comment calls for this version, and the viewer is who is signed in', async () => {
		const ask = vi.fn(async (name: string) =>
			name === 'signInState' ? { ok: true as const, value: { state: 'signedIn', user: { login: 'noah' } } } : { ok: true as const, value: null },
		);
		const store = relayComments({ ask }, { projectId: 'demo', branch: 'prototype/demo/v1' });
		const ref = { thread: 7, id: 70 };
		const anchor = { selector: 'h1' } as never;
		await store.read();
		await store.post('Bigger', anchor, 'data:image/jpeg;base64,AAAA');
		await store.resolve(ref, true);
		await store.move(ref, anchor);
		await store.remove(ref);
		expect(ask.mock.calls).toEqual([
			['readComments', ['demo', 'prototype/demo/v1']],
			// No picture of the spot: a page cannot take one of itself.
			['postComment', ['demo', 'prototype/demo/v1', 'Bigger', anchor, null]],
			['resolveComment', [ref, true]],
			['moveComment', [ref, anchor]],
			['deleteComment', [ref]],
		]);
		expect(await store.viewer()).toBe('noah');
	});
});

const opened = (host: string, hash: string, kept: string | null = null) => {
	const store = new Map<string, string>(kept === null ? [] : [['dsnr.review-key', kept]]);
	const replaced: string[] = [];
	const win = {
		location: { hostname: host, hash, pathname: '/review/demo/v1/', search: '' },
		history: { replaceState: (_: unknown, __: string, url: string) => void replaced.push(url) },
		sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
	};
	return { win, store, replaced };
};
const KEY = 'AbC-_x9yZAbC-_x9yZAbCd';

describe('the key a page opened from DSNR carries', () => {
	it('is taken from the fragment, kept for this tab, and taken out of the address', () => {
		const page = opened('127.0.0.1', `#dsnr-key-${KEY}`);
		expect(keyFromAddress(page.win)).toBe(KEY);
		expect(page.store.get('dsnr.review-key')).toBe(KEY);
		expect(page.replaced).toEqual(['/review/demo/v1/']);
	});

	it('is the one kept, after the page moves to another version (whose address has none)', () => {
		const page = opened('127.0.0.1', '', KEY);
		expect(keyFromAddress(page.win)).toBe(KEY);
		expect(page.replaced).toEqual([]);
	});

	it('is none on a page not served from this machine, or for what is not a key', () => {
		expect(keyFromAddress(opened('noahshrader-flock.github.io', `#dsnr-key-${KEY}`).win)).toBeNull();
		expect(keyFromAddress(opened('127.0.0.1', '#dsnr-key-short').win)).toBeNull();
		expect(keyFromAddress(opened('127.0.0.1', '#/route').win)).toBeNull();
		expect(keyFromAddress(opened('127.0.0.1', '', 'not a key!').win)).toBeNull();
	});
});

describe('asking DSNR through this machine’s server', () => {
	const answering = (respond: (init: RequestInit) => Promise<Response>) => {
		const sent: { url: string; init: RequestInit }[] = [];
		const fetcher = vi.fn(async (url: string, init: RequestInit) => {
			sent.push({ url, init });
			return respond(init);
		});
		return { relay: serverRelay(KEY, fetcher as unknown as typeof fetch), sent };
	};
	const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

	it('asks as a tab does, at the server’s ask, with its key, and takes the answer to that ask', async () => {
		const { relay, sent } = answering(async (init) => {
			const ask = JSON.parse(init.body as string) as { id: number };
			return json({ dsnr: 'answer', id: ask.id, result: { ok: true, value: 'signed in' } });
		});
		expect(await relay.ask('signInState', [])).toEqual({ ok: true, value: 'signed in' });
		expect(sent[0]!.url).toBe('/_dsnr/ask');
		expect(sent[0]!.init.method).toBe('POST');
		expect(sent[0]!.init.headers).toEqual({ 'content-type': 'application/json', 'x-dsnr-key': KEY });
		expect(JSON.parse(sent[0]!.init.body as string)).toEqual({ dsnr: 'ask', id: 1, name: 'signInState', args: [] });
	});

	it('says why, in words, when it was not answered: an old key, DSNR closed, or an answer that is not one', async () => {
		const refused = answering(async () => new Response('Not yours', { status: 403 }));
		expect(await refused.relay.ask('readComments', [])).toEqual({ ok: false, error: expect.stringMatching(/Open in browser/) });
		const closed = answering(async () => Promise.reject(new TypeError('Failed to fetch')));
		expect(await closed.relay.ask('readComments', [])).toEqual({ ok: false, error: expect.stringMatching(/VS Code/) });
		const wrong = answering(async () => json({ dsnr: 'answer', id: 99, result: { ok: true, value: 'another’s' } }));
		expect(await wrong.relay.ask('readComments', [])).toEqual({ ok: false, error: expect.any(String) });
		const garbled = answering(async () => new Response('<html>', { status: 200 }));
		expect(await garbled.relay.ask('readComments', [])).toEqual({ ok: false, error: expect.any(String) });
	});
});

describe('where a page in the browser goes after Address (BROWSER_COMMENTS_PLAN 3.2)', () => {
	const here = 'http://127.0.0.1:5000/review/demo/v1/';
	it('is the version it showed, under the same project, as the site lays them out', () => {
		expect(versionAddress('../', 'v3', here)).toBe('http://127.0.0.1:5000/review/demo/v3/');
		expect(versionAddress('../', 'v2', here)).toBe('http://127.0.0.1:5000/review/demo/v2/');
	});

	it('is this page again when the change is in it, and nowhere for what is not a version', () => {
		expect(versionAddress('../', 'v1', here)).toBe(here);
		expect(versionAddress('../', '../../etc', here)).toBeNull();
		expect(versionAddress('../', 'v1-i2', here)).toBeNull();
	});
});
