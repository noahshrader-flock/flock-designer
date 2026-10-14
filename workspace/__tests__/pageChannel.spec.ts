import { describe, expect, it } from 'vitest';
import { readPageAsk, readPageTell } from '../src/shared/pageChannel';

/**
 * How the review bar and a prototype's page talk (REVIEW_ISOLATION_PLAN, Phase 1): the bar asks, by message, what it used
 * to do from outside the page (pick a spot, draw the pins, focus one, say the route), and the page's agent answers and
 * reports, every message carrying the secret the bar gave it. Each side reads the other's messages in exactly their shape,
 * as anything else could be from a page that is not what it should be.
 */

const N = 'nonce-1';

describe('what the bar asks the page', () => {
	it.each([
		[{ dsnr: 'page-ask', id: 0, call: 'hello', args: [N] }],
		[{ dsnr: 'page-ask', id: 3, call: 'pick', args: [] }],
		[{ dsnr: 'page-ask', id: 4, call: 'cancel-pick', args: [] }],
		[{ dsnr: 'page-ask', id: 5, call: 'draw-pins', args: [[{ id: 1, number: 1 }]] }],
		[{ dsnr: 'page-ask', id: 6, call: 'focus', args: [7] }],
		[{ dsnr: 'page-ask', id: 7, call: 'route', args: [] }],
	])('%o is read', (m) => expect(readPageAsk(m)).toEqual(m));

	it.each([
		[null],
		['pick'],
		[{ dsnr: 'page-ask', id: 1, call: 'eval', args: ['alert(1)'] }],
		[{ dsnr: 'page-ask', id: -1, call: 'pick', args: [] }],
		[{ dsnr: 'page-ask', id: 1.5, call: 'pick', args: [] }],
		[{ dsnr: 'page-ask', id: 1, call: 'pick', args: 'x' }],
		[{ dsnr: 'page-ask', id: 1, call: 'pick', args: [], more: 1 }],
		[{ dsnr: 'ask', id: 1, call: 'pick', args: [] }],
		[{ dsnr: 'page-ask', id: 0, call: 'hello', args: [] }],
		[{ dsnr: 'page-ask', id: 0, call: 'hello', args: [''] }],
		[{ dsnr: 'page-ask', id: 0, call: 'hello', args: ['x'.repeat(201)] }],
	])('%o is dropped', (m) => expect(readPageAsk(m)).toBeNull());
});

describe('what the page says back', () => {
	it.each([
		[{ dsnr: 'page-ready', n: N, route: '/review/a/v1/i1/page.html#/alerts' }],
		[{ dsnr: 'page-route', n: N, route: '/x#/y' }],
		[{ dsnr: 'page-answer', n: N, id: 3, value: { anything: 'the readers check it' } }],
		[{ dsnr: 'page-answer', n: N, id: 4, value: null }],
		[{ dsnr: 'page-pin', n: N, text: '__fd:{"t":"click","id":1,"n":"nonce-1"}' }],
	])('%o is read, with the secret the bar gave', (m) => expect(readPageTell(m, N)).toEqual(m));

	it.each([
		[{ dsnr: 'page-ready', n: 'another', route: '/' }],
		[{ dsnr: 'page-ready', route: '/' }],
		[{ dsnr: 'page-route', n: N, route: 5 }],
		[{ dsnr: 'page-route', n: N, route: 'x'.repeat(2001) }],
		[{ dsnr: 'page-answer', n: N, id: 'three', value: 1 }],
		[{ dsnr: 'page-answer', n: N, id: 3 }],
		[{ dsnr: 'page-pin', n: N, text: 'x'.repeat(20_001) }],
		[{ dsnr: 'page-pin', n: N, text: 1 }],
		[{ dsnr: 'page-ready', n: N, route: '/', extra: true }],
		[{ dsnr: 'ask', id: 1, name: 'address', args: [] }],
		[null],
	])('%o is dropped', (m) => expect(readPageTell(m, N)).toBeNull());
});
