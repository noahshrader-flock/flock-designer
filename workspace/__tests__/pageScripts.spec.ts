// @vitest-environment node
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { CANCEL_PICK_SCRIPT, PICK_SCRIPT, resolveScript } from '../src/main/services/pageScripts';
import type { CommentAnchor, MarkerRequest } from '../src/shared/contract';

const page = (html: string, url = 'http://localhost:3000/users#/list') => {
	const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
		url,
		runScripts: 'outside-only',
		pretendToBeVisual: true,
	});
	const w = dom.window as unknown as Window & { eval: (s: string) => unknown; document: Document };
	// jsdom has no layout or animation; give the scripts what they need to run.
	w.Element.prototype.scrollIntoView = () => undefined;
	(w.Element.prototype as unknown as { animate: () => void }).animate = () => undefined;
	return w;
};

const click = (w: Window, el: Element) =>
	el.dispatchEvent(new (w as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('click', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));

const CARD = `
  <main>
    <div class="row"><button>Save</button></div>
    <div class="row"><button data-e2e-ref="users-invite">Invite users</button></div>
    <ul><li>Alpha</li><li>Beta</li></ul>
  </main>`;

describe('picking an element', () => {
	it('prefers data-e2e-ref, and describes where it is', async () => {
		const w = page(CARD);
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w, w.document.querySelector('[data-e2e-ref]')!);
		const a = await picked;
		expect(a.selector).toBe('[data-e2e-ref="users-invite"]');
		expect(a.route).toBe('/users#/list');
		expect(a.nearbyText).toBe('Invite users');
		expect(a.viewport.width).toBeGreaterThan(0);
	});

	it('records which state of the page it was, from the query string', async () => {
		const w = page(CARD, 'http://localhost:3000/users?state=error#/list');
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w, w.document.querySelector('main')!);
		expect((await picked).state).toBe('?state=error');

		const plain = page(CARD);
		const p2 = plain.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(plain, plain.document.querySelector('main')!);
		expect((await p2).state).toBe('');
	});

	it('builds a selector that finds exactly that element when there is no ref', async () => {
		const w = page(CARD);
		const target = w.document.querySelectorAll('li')[1]!;
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w, target);
		const a = await picked;
		expect(w.document.querySelectorAll(a.selector)).toHaveLength(1);
		expect(w.document.querySelector(a.selector)).toBe(target);
	});

	it('does not rely on an id that React generates, which changes between renders', async () => {
		const w = page('<main><div><input id=":r1:" /></div><div><input id="search" /></div></main>');
		const generated = w.document.getElementById(':r1:')!;
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w, generated);
		const a = await picked;
		expect(a.selector).not.toContain(':r1:');
		expect(w.document.querySelector(a.selector)).toBe(generated);

		const stable = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w, w.document.getElementById('search')!);
		expect((await stable).selector).toBe('#search');
	});

	it('swallows the click, so choosing a button does not press it', async () => {
		const w = page('<button id="b">Go</button>');
		let pressed = 0;
		w.document.getElementById('b')!.addEventListener('click', () => pressed++);
		const picked = w.eval(PICK_SCRIPT) as Promise<unknown>;
		click(w, w.document.getElementById('b')!);
		await picked;
		expect(pressed).toBe(0);
	});

	it('leaves the page as it found it, and gives null when cancelled', async () => {
		const w = page(CARD);
		const before = w.document.documentElement.outerHTML;
		const picked = w.eval(PICK_SCRIPT) as Promise<unknown>;
		expect(w.document.querySelector('style[data-fd]')).not.toBeNull();
		w.eval(CANCEL_PICK_SCRIPT);
		expect(await picked).toBeNull();
		expect(w.document.documentElement.outerHTML).toBe(before);
	});

	it('Escape cancels', async () => {
		const w = page(CARD);
		const picked = w.eval(PICK_SCRIPT) as Promise<unknown>;
		w.document.dispatchEvent(new (w as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', { key: 'Escape' }));
		expect(await picked).toBeNull();
	});
});

const req = (id: number, anchor: Partial<CommentAnchor>): MarkerRequest => ({
	id,
	number: id,
	anchor: { route: '/users#/list', selector: 'x', nearbyText: '', viewport: { width: 1, height: 1 }, commit: '', ...anchor },
});

describe('placing comments on reopening', () => {
	it('finds an element by its selector and draws a numbered marker', () => {
		const w = page(CARD);
		const out = w.eval(resolveScript([req(1, { selector: '[data-e2e-ref="users-invite"]', offset: { x: 0.5, y: 0.5 } })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('found');
		expect(w.document.querySelector('[data-fd-layer]')?.textContent).toBe('1');
	});

	it('follows the text when the markup changed', () => {
		const w = page('<section><p>Totally different markup</p><span>Invite users</span></section>');
		const out = w.eval(resolveScript([req(1, { selector: '[data-e2e-ref="users-invite"]', nearbyText: 'Invite users' })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('moved');
		expect(w.document.querySelector('[data-fd-layer]')).not.toBeNull();
	});

	it('degrades to a page-level comment when the element is gone', () => {
		const w = page('<p>Nothing here</p>');
		const out = w.eval(resolveScript([req(1, { selector: '#gone', nearbyText: 'Invite users' })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('missing');
		expect(w.document.querySelector('[data-fd-layer]')).toBeNull();
	});

	it('does not match an ambiguous selector, rather than pick the wrong element', () => {
		const w = page('<p class="a">One</p><p class="a">Two</p>');
		const out = w.eval(resolveScript([req(1, { selector: '.a' })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('missing');
	});

	it('leaves comments for other pages alone', () => {
		const w = page(CARD);
		const out = w.eval(resolveScript([req(1, { route: '/orgs', selector: 'main' })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('elsewhere');
	});

	it('does not draw a comment made in another state of the page, and says so', () => {
		const w = page(CARD, 'http://localhost:3000/users?state=loaded#/list');
		const out = w.eval(resolveScript([req(1, { selector: 'main', state: '?state=error' })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('otherState');
		expect(w.document.querySelector('[data-fd-layer]')).toBeNull();
	});

	it('draws it again once the page is in the state it was made in', () => {
		const w = page(CARD, 'http://localhost:3000/users?state=error#/list');
		const out = w.eval(resolveScript([req(1, { selector: 'main', state: '?state=error' })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('found');
	});

	it('treats an empty state as the default, which is not the same as a state', () => {
		const w = page(CARD, 'http://localhost:3000/users?state=error#/list');
		expect((w.eval(resolveScript([req(1, { selector: 'main', state: '' })], 'nonce')) as Array<{ state: string }>)[0]?.state).toBe('otherState');
	});

	it('still draws comments from before the state was recorded, wherever they are', () => {
		const w = page(CARD, 'http://localhost:3000/users?state=error#/list');
		expect((w.eval(resolveScript([req(1, { selector: 'main' })], 'nonce')) as Array<{ state: string }>)[0]?.state).toBe('found');
	});

	it('replaces earlier markers, and clears them when given nothing', () => {
		const w = page(CARD);
		w.eval(resolveScript([req(1, { selector: 'main' })], 'nonce'));
		w.eval(resolveScript([req(2, { selector: 'ul' })], 'nonce'));
		expect(w.document.querySelectorAll('[data-fd-layer]')).toHaveLength(1);
		w.eval(resolveScript([], 'nonce'));
		expect(w.document.querySelector('[data-fd-layer]')).toBeNull();
	});

	it('survives a comment whose text would break out of the script', () => {
		const w = page(CARD);
		const nasty = req(1, { selector: 'main', nearbyText: '"});alert(1);(function(){' });
		expect(() => w.eval(resolveScript([nasty], 'nonce'))).not.toThrow();
	});
});

describe('pins that can be clicked and dragged', () => {
	const setup = (movable: boolean) => {
		const w = page(CARD);
		const said: Array<Record<string, unknown>> = [];
		(w as unknown as { console: { debug: (m: string) => void } }).console.debug = (m: string) => {
			if (m.startsWith('__fd:')) said.push(JSON.parse(m.slice(5)));
		};
		const target = w.document.querySelector('[data-e2e-ref="users-invite"]')!;
		w.document.elementsFromPoint = () => [target];
		w.eval(resolveScript([{ ...req(5, { selector: 'main' }), movable }], 'secret'));
		const pin = w.document.querySelector('[data-fd-layer] > div > div') as HTMLElement;
		const fire = (type: string, x = 0, y = 0) =>
			pin.dispatchEvent(new (w as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
		return { w, said, pin, fire };
	};

	it('reports a click, with the secret, so the app can highlight the comment', () => {
		const { said, fire } = setup(true);
		fire('pointerdown', 10, 10);
		fire('pointerup', 10, 10);
		expect(said).toEqual([{ t: 'click', id: 5, n: 'secret' }]);
	});

	it('reports a drop with where it landed, once it has moved far enough to be a drag', () => {
		const { said, fire } = setup(true);
		fire('pointerdown', 10, 10);
		fire('pointermove', 200, 120);
		fire('pointerup', 200, 120);
		expect(said).toHaveLength(1);
		expect(said[0]).toMatchObject({ t: 'move', id: 5, n: 'secret' });
		expect((said[0]?.anchor as { selector: string }).selector).toBe('[data-e2e-ref="users-invite"]');
	});

	it('treats a small wobble as a click, not a drag', () => {
		const { said, fire } = setup(true);
		fire('pointerdown', 10, 10);
		fire('pointermove', 12, 11);
		fire('pointerup', 12, 11);
		expect(said.map((m) => m.t)).toEqual(['click']);
	});

	it("does not move someone else's pin: dragging it only selects it", () => {
		const { said, fire } = setup(false);
		fire('pointerdown', 10, 10);
		fire('pointermove', 200, 120);
		fire('pointerup', 200, 120);
		expect(said.map((m) => m.t)).toEqual(['click']);
	});

	it("does not hand the page's own handlers a click on a pin", () => {
		const { w, fire } = setup(true);
		let reached = 0;
		w.document.addEventListener('pointerdown', () => reached++);
		fire('pointerdown', 10, 10);
		expect(reached).toBe(0);
	});
});
