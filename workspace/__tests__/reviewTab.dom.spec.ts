import { afterEach, describe, expect, it, vi } from 'vitest';
import { startReviewTab } from '../src/page/reviewTab';

/** The tab's own page, as VS Code serves it: one frame, the review's bar, on the review page's origin. */
const PAGE = 'http://127.0.0.1:5000';

const tab = () => {
	document.body.innerHTML = '<iframe src="about:blank"></iframe>';
	document.body.className = 'vscode-dark';
	const frame = document.querySelector('iframe') as HTMLIFrameElement;
	const toFrame = vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
	const toVsCode = vi.fn();
	(globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({ postMessage: toVsCode });
	startReviewTab(PAGE);
	const fromFrame = (data: unknown, origin = PAGE, source: unknown = frame.contentWindow) =>
		window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
	const told = () => toFrame.mock.calls.map(([m]) => (m as { dsnr: string }).dsnr);
	return { frame, toFrame, toVsCode, fromFrame, told };
};

afterEach(() => {
	document.body.innerHTML = '';
	delete (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
});

describe('the review tab’s hello to its bar', () => {
	it('is said as the frame loads, with VS Code’s theme', () => {
		const t = tab();
		t.frame.dispatchEvent(new Event('load'));
		expect(t.told()).toEqual(['hello', 'scheme']);
		expect(t.toFrame.mock.calls[1]?.[0]).toMatchObject({ dsnr: 'scheme', theme: { kind: 'vscode-dark' } });
		expect(t.toFrame.mock.calls.every(([, origin]) => (origin as unknown) === PAGE)).toBe(true);
	});

	it('is said again when the bar says it is listening, as one reloaded after the load does, and that goes no further', () => {
		const t = tab();
		t.frame.dispatchEvent(new Event('load'));
		t.fromFrame({ dsnr: 'listening' });
		expect(t.told()).toEqual(['hello', 'scheme', 'hello', 'scheme']);
		expect(t.toVsCode).not.toHaveBeenCalled();
	});

	it('is not said for a listening from anything but its own frame, on its page’s origin, in exactly that shape', () => {
		const t = tab();
		t.fromFrame({ dsnr: 'listening' }, 'https://elsewhere.example');
		t.fromFrame({ dsnr: 'listening' }, PAGE, window);
		t.fromFrame({ dsnr: 'listening', more: 1 });
		expect(t.told()).toEqual([]);
	});

	it('passes the bar’s asks on to VS Code, as before', () => {
		const t = tab();
		const ask = { dsnr: 'ask', id: 1, name: 'signInState', args: [] };
		t.fromFrame(ask);
		expect(t.toVsCode).toHaveBeenCalledExactlyOnceWith(ask);
	});
});
