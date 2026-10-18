import { describe, expect, it, vi } from 'vitest';
import { framePage } from '../src/viewer/browserAdapter';

/**
 * The review bar's side (the README's Review isolation): it hears its frame's page only from that frame's own window and
 * address, and only with the secret it said hello with; it asks nothing of a page that has not said it is up.
 */

const world = (src = 'http://127.0.0.1:4100/review/a/v1/page.html', sandbox: string | null = null) => {
	const listeners: ((e: unknown) => void)[] = [];
	const pageWindow = { postMessage: vi.fn() };
	const frame = {
		getAttribute: (name: string) => (name === 'src' ? src : name === 'sandbox' ? sandbox : null),
		contentWindow: pageWindow,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	};
	const win = {
		location: { href: 'http://127.0.0.1:4000/review/a/v1/', origin: 'http://127.0.0.1:4000' },
		addEventListener: (_t: string, l: (e: unknown) => void) => void listeners.push(l),
		removeEventListener: vi.fn(),
	};
	const page = framePage(frame as never, win as never);
	const hello = pageWindow.postMessage.mock.calls[0]?.[0] as { args: [string] };
	const nonce = hello.args[0];
	const hear = (data: unknown, { source = pageWindow as unknown, origin = 'http://127.0.0.1:4100' } = {}) =>
		listeners.forEach((l) => l({ data, source, origin }));
	return { page, pageWindow, nonce, hear, hello: pageWindow.postMessage.mock.calls[0] };
};

describe('the bar, with its page framed with no origin of its own (the published site)', () => {
	const published = () => world('page.html', 'allow-scripts allow-forms allow-popups allow-modals');

	it('says hello to `*`, the only address a page with no origin has', () => {
		const { hello } = published();
		expect(hello?.[0]).toMatchObject({ dsnr: 'page-ask', id: 0, call: 'hello' });
		expect(hello?.[1]).toBe('*');
	});

	it('hears it from the origin `null`, and only from its frame’s window, with the secret', () => {
		const { page, nonce, hear } = published();
		const ready = vi.fn();
		page.onReady(ready);
		// From the bar's own address (a page that had one), from another window, or without the secret: not the page.
		hear({ dsnr: 'page-ready', n: nonce, route: '/x' }, { origin: 'http://127.0.0.1:4000' });
		hear({ dsnr: 'page-ready', n: nonce, route: '/x' }, { origin: 'null', source: {} });
		hear({ dsnr: 'page-ready', n: 'guessed', route: '/x' }, { origin: 'null' });
		expect(ready).not.toHaveBeenCalled();
		hear({ dsnr: 'page-ready', n: nonce, route: '/x' }, { origin: 'null' });
		expect(ready).toHaveBeenCalledWith('/x');
	});

	it('keeps to the page’s own address when the sandbox gives it its own origin (VS Code)', () => {
		const { hello } = world(undefined, 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
		expect(hello?.[1]).toBe('http://127.0.0.1:4100');
	});
});

describe('the bar, as it hears its page', () => {
	it('says hello with a secret, to the page’s own address', () => {
		const { hello } = world();
		expect(hello?.[0]).toMatchObject({ dsnr: 'page-ask', id: 0, call: 'hello' });
		expect(hello?.[1]).toBe('http://127.0.0.1:4100');
	});

	it('hears the page say it is up only from its frame’s window and address, with the secret', () => {
		const { page, nonce, hear } = world();
		const ready = vi.fn();
		page.onReady(ready);
		hear({ dsnr: 'page-ready', n: nonce, route: '/x' }, { source: {} });
		hear({ dsnr: 'page-ready', n: nonce, route: '/x' }, { origin: 'http://evil.example' });
		hear({ dsnr: 'page-ready', n: 'guessed', route: '/x' });
		expect(ready).not.toHaveBeenCalled();
		hear({ dsnr: 'page-ready', n: nonce, route: '/x' });
		expect(ready).toHaveBeenCalledWith('/x');
		// One that listens after it said so is told at once.
		const late = vi.fn();
		page.onReady(late);
		expect(late).toHaveBeenCalledWith('/x');
	});

	it('asks nothing of a page that has not said it is up, and reads its answers as it always has', async () => {
		const { page, pageWindow, nonce, hear } = world();
		expect(await page.showMarkers([])).toEqual({ ok: true, value: [] });
		expect(pageWindow.postMessage).toHaveBeenCalledTimes(1);
		hear({ dsnr: 'page-ready', n: nonce, route: '/x' });
		const drawing = page.showMarkers([{ id: 1 } as never]);
		const ask = pageWindow.postMessage.mock.calls.at(-1)?.[0] as { id: number };
		// What the page answers is read by the readers: only the pins asked for, in a state there is.
		hear({
			dsnr: 'page-answer',
			n: nonce,
			id: ask.id,
			value: [
				{ id: 1, state: 'found' },
				{ id: 9, state: 'found' },
				{ id: 1, state: 'owned' },
			],
		});
		expect(await drawing).toEqual({ ok: true, value: [{ id: 1, state: 'found' }] });
	});

	it('takes a pin’s report only as the pins say one, with the secret inside it too', () => {
		const { page, nonce, hear } = world();
		const pins = vi.fn();
		page.onPinEvent(pins);
		hear({ dsnr: 'page-pin', n: nonce, text: `__fd:${JSON.stringify({ t: 'click', id: 2, n: 'other' })}` });
		hear({ dsnr: 'page-pin', n: nonce, text: `__fd:${JSON.stringify({ t: 'click', id: 2, n: nonce })}` });
		expect(pins.mock.calls).toEqual([[{ kind: 'click', id: 2 }]]);
	});
});
