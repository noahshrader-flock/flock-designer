import { describe, expect, it, vi } from 'vitest';
import { type AgentWindow, installAgent } from '../src/page/agent';

/**
 * A prototype's page agent (REVIEW_ISOLATION_PLAN 1.2): what the review bar used to do from outside the page, done inside
 * it when the bar asks, and the page's own news (ready, a route moved, a pin's report) told to the bar. It answers only
 * its parent, and only the address that said hello first; everything carries the bar's secret.
 */

const BAR = 'http://127.0.0.1:4000';
const world = () => {
	const parent = { postMessage: vi.fn() };
	const listeners: Record<string, ((e: unknown) => void)[]> = {};
	const win = {
		parent,
		location: { pathname: '/review/a/v1/i1/page.html', hash: '#/alerts' },
		addEventListener: (type: string, l: (e: unknown) => void) => void (listeners[type] ??= []).push(l),
	} as unknown as AgentWindow;
	const page = {
		pick: vi.fn(async () => ({ selector: 'main', at: { x: 1, y: 2 } })),
		drawPins: vi.fn(() => [{ id: 1, state: 'found' }]),
	};
	installAgent(win, page as never);
	const send = (data: unknown, { source = parent, origin = BAR }: { source?: unknown; origin?: string } = {}) =>
		listeners.message?.forEach((l) => l({ data, source, origin }));
	const told = () => parent.postMessage.mock.calls.map(([m, to]) => [m, to]);
	return { win, page, parent, send, told, listeners };
};
const hello = { dsnr: 'page-ask', id: 0, call: 'hello', args: ['n1'] };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a prototype’s page agent', () => {
	it('says it is ready, with its route, to the address that said hello, and to it alone', () => {
		const { send, told } = world();
		send(hello);
		expect(told()).toEqual([[{ dsnr: 'page-ready', n: 'n1', route: '/review/a/v1/i1/page.html#/alerts' }, BAR]]);
	});

	it('does what it is asked, as the scripts did from outside, and answers by the ask’s id', async () => {
		const { send, told, page } = world();
		send(hello);
		send({ dsnr: 'page-ask', id: 1, call: 'draw-pins', args: [[{ id: 1, number: 1 }]] });
		expect(page.drawPins).toHaveBeenCalledWith([{ id: 1, number: 1 }], 'n1');
		send({ dsnr: 'page-ask', id: 2, call: 'pick', args: [] });
		send({ dsnr: 'page-ask', id: 3, call: 'route', args: [] });
		await settle();
		expect(told().slice(1)).toEqual([
			[{ dsnr: 'page-answer', n: 'n1', id: 1, value: [{ id: 1, state: 'found' }] }, BAR],
			[{ dsnr: 'page-answer', n: 'n1', id: 3, value: '/review/a/v1/i1/page.html#/alerts' }, BAR],
			[{ dsnr: 'page-answer', n: 'n1', id: 2, value: { selector: 'main', at: { x: 1, y: 2 } } }, BAR],
		]);
	});

	it('focuses a pin and cancels a pick through the page code’s own hooks', () => {
		const { send, win } = world();
		const focus = vi.fn();
		const cancel = vi.fn();
		Object.assign(win, { __fdMarkers: { focus, stop: () => undefined }, __fdCancelPick: cancel });
		send(hello);
		send({ dsnr: 'page-ask', id: 1, call: 'focus', args: [4] });
		send({ dsnr: 'page-ask', id: 2, call: 'cancel-pick', args: [] });
		expect(focus).toHaveBeenCalledWith(4);
		expect(cancel).toHaveBeenCalled();
	});

	it('tells the bar a pin’s report and a route that moved, with its secret', () => {
		const { send, told, win, listeners } = world();
		send(hello);
		win.__fdReport?.('__fd:{"t":"click","id":1,"n":"n1"}');
		listeners.hashchange?.forEach((l) => l({}));
		expect(told().slice(1)).toEqual([
			[{ dsnr: 'page-pin', n: 'n1', text: '__fd:{"t":"click","id":1,"n":"n1"}' }, BAR],
			[{ dsnr: 'page-route', n: 'n1', route: '/review/a/v1/i1/page.html#/alerts' }, BAR],
		]);
	});

	it('answers nobody but its parent, nothing before a hello, and no other address once one has said hello', () => {
		const { send, told, page } = world();
		const ask = { dsnr: 'page-ask', id: 1, call: 'draw-pins', args: [[]] };
		send(ask);
		send(hello, { source: { postMessage: vi.fn() } });
		expect(told()).toEqual([]);
		send(hello);
		send(ask, { origin: 'http://evil.example' });
		send({ ...hello, args: ['n2'] }, { origin: 'http://evil.example' });
		send({ dsnr: 'page-ask', id: 9, call: 'eval', args: ['x'] });
		expect(page.drawPins).not.toHaveBeenCalled();
		expect(told()).toHaveLength(1);
	});

	it('says nothing at all until it is said hello to', () => {
		const { told, win, listeners } = world();
		win.__fdReport?.('__fd:{}');
		listeners.hashchange?.forEach((l) => l({}));
		expect(told()).toEqual([]);
	});
});
