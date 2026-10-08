// @vitest-environment node
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { CANCEL_PICK_SCRIPT, PICK_SCRIPT, layerVisibleScript, resolveScript } from '../src/shared/pageScripts';
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

	it('finds the element again after the code around it is rearranged', async () => {
		// Two cards that look alike. The comment is on the subtext of the second, which has no stable
		// name of its own: the ordinary case for "remove this subtext".
		const cards = (open = '', close = '') =>
			'<main><section data-e2e-ref="alerts-card"><h3>Alerts</h3><div class="row"><p>Notify me by email</p></div></section>' +
			`<section data-e2e-ref="billing-card"><h3>Billing</h3>${open}<div class="row"><p>Notify me by email</p></div>${close}</section></main>`;
		const w = page(cards());
		const target = w.document.querySelectorAll('p')[1]!;
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w, target);
		const { selector } = await picked;
		expect(w.document.querySelector(selector)).toBe(target);

		// An agent wraps the row in a layout div, which is what restyling does. A path of direct
		// children breaks here; being scoped to the named card does not.
		const after = page(cards('<div class="stack">', '</div>'));
		expect(after.document.querySelectorAll(selector)).toHaveLength(1);
		// And it is the billing card's subtext, not the identical one in the alerts card.
		expect(after.document.querySelector(selector)!.closest('section')!.getAttribute('data-e2e-ref')).toBe('billing-card');
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

	it('still follows the text when the page changed a little since the comment', () => {
		// The real case. The stored text is cut at 80 characters, often mid-word, and the page it was
		// taken from has since changed slightly. Demanding the whole prefix still match made the pin
		// disappear over a single character, which is how a comment on text still plainly on the page
		// came back as "the element is no longer on the page".
		const stored = '< Roles Compare Roles See what a user gains and loses when they move from one ro';
		const w = page('<div><a>< Roles</a><h1>Compare Roles</h1><p>See what a user gains and loses when they move from one role to another.</p></div>');
		const out = w.eval(resolveScript([req(1, { selector: '#root > div:nth-of-type(3)', nearbyText: stored })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('moved');
		expect(w.document.querySelector('[data-fd-layer]')).not.toBeNull();
	});

	it('follows the text when the element was shortened, not only lengthened', () => {
		const w = page('<section><p>Invite</p></section>');
		const out = w.eval(resolveScript([req(1, { selector: '#gone', nearbyText: 'Invite users to the organisation' })], 'nonce')) as Array<{ state: string }>;
		expect(out[0]?.state).toBe('moved');
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

	it('outlines what the pin would attach to while it is being dragged, and only then', () => {
		const { w, fire } = setup(true);
		const seen = () => Array.from(w.document.querySelectorAll('[data-fd-layer="hover"]')) as HTMLElement[];
		expect(seen()).toHaveLength(0); // nothing before the drag

		fire('pointerdown', 10, 10);
		fire('pointermove', 200, 120);
		const [outline, chip] = seen();
		expect(outline?.style.display).toBe('block');
		// The same element the drop would re-attach to, named the same way as when a pin is placed.
		expect(chip?.textContent).toContain('<button>');
		expect(chip?.textContent).toContain('Invite users');

		fire('pointerup', 200, 120);
		expect(seen()).toHaveLength(0); // and gone again afterwards
	});

	it('shows no outline for a wobble, or for a pin that cannot be moved', () => {
		const wobble = setup(true);
		wobble.fire('pointerdown', 10, 10);
		wobble.fire('pointermove', 12, 11);
		expect(wobble.w.document.querySelectorAll('[data-fd-layer="hover"]')).toHaveLength(0);

		const theirs = setup(false);
		theirs.fire('pointerdown', 10, 10);
		theirs.fire('pointermove', 200, 120);
		expect(theirs.w.document.querySelectorAll('[data-fd-layer="hover"]')).toHaveLength(0);
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

describe('redrawing the pins', () => {
	const pins = (w: Window) => w.document.querySelectorAll('[data-fd-layer]:not([data-fd-layer="hover"])');

	it('removes the pins that were there, even while a comment is being placed', () => {
		const w = page(CARD);
		const draw = (items: MarkerRequest[]) => w.eval(resolveScript(items, 'nonce'));
		draw([req(1, { selector: '[data-e2e-ref="users-invite"]' })]);
		// Comment mode puts its outline on the page, after the pins; a later redraw puts the pins after it.
		void (w.eval(PICK_SCRIPT) as Promise<unknown>);
		draw([req(1, { selector: '[data-e2e-ref="users-invite"]' })]);
		expect(pins(w)).toHaveLength(1);
		// The comment was deleted: nothing is left to draw, and nothing may be left on the page.
		draw([]);
		expect(pins(w)).toHaveLength(0);
		// ...and the outline belongs to comment mode, which is still on.
		expect(w.document.querySelectorAll('[data-fd-layer="hover"]').length).toBeGreaterThan(0);
	});
});

describe('hiding the pins for a picture', () => {
	it('hides the app\'s own pins and shows them again, leaving the page alone', async () => {
		const w = page(CARD);
		w.eval(resolveScript([req(1, { selector: '[data-e2e-ref="users-invite"]' })], 'nonce'));
		const layer = w.document.querySelector('[data-fd-layer]') as HTMLElement;
		await (w.eval(layerVisibleScript(false)) as Promise<unknown>);
		expect(layer.style.visibility).toBe('hidden');
		await (w.eval(layerVisibleScript(true)) as Promise<unknown>);
		expect(layer.style.visibility).toBe('visible');
		expect(w.document.querySelector('main')?.getAttribute('style')).toBeNull();
	});

	it('is harmless when there are no pins', async () => {
		const w = page(CARD);
		await expect(w.eval(layerVisibleScript(false)) as Promise<unknown>).resolves.toBe(true);
	});
});

describe('choosing what a pin attaches to', () => {
	const FORM = `
	  <main>
	    <section id="prefs">
	      <h2>Notification Preferences</h2>
	      <div aria-label="Hotlist Hits"><p id="sub">Notify me when a plate on one of my hotlists is detected.</p></div>
	    </section>
	  </main>`;

	/** jsdom has no layout and no elementsFromPoint, so give an element a box, and say what is "under the pointer". */
	const under = (w: Window & { document: Document }, el: Element, rect = { left: 10, top: 20, width: 100, height: 30 }) => {
		(el as HTMLElement).getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;
		const chain: Element[] = [];
		for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
		(w.document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => chain;
	};
	const move = (w: Window, x = 12, y = 22) =>
		w.document.dispatchEvent(new (w as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
	const press = (w: Window, key: string) => {
		const ev = new (w as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
		w.document.dispatchEvent(ev);
		return ev;
	};
	const layers = (w: Window & { document: Document }) => [...w.document.querySelectorAll('[data-fd-layer="hover"]')] as HTMLElement[];
	const outlineOf = (w: Window & { document: Document }) => layers(w)[0] as HTMLElement;
	const chipOf = (w: Window & { document: Document }) => layers(w)[1] as HTMLElement;

	it('outlines the element under the pointer, where it is, and names it, before anything is clicked', () => {
		const w = page(FORM);
		const sub = w.document.getElementById('sub') as HTMLElement;
		void w.eval(PICK_SCRIPT);
		under(w, sub);
		move(w);
		expect(outlineOf(w).style.display).toBe('block');
		expect([outlineOf(w).style.left, outlineOf(w).style.top, outlineOf(w).style.width, outlineOf(w).style.height]).toEqual(['10px', '20px', '100px', '30px']);
		expect(chipOf(w).textContent).toContain('<p> Notify me when a plate');
		expect(chipOf(w).textContent).toContain('container');
	});

	it('records the element that is outlined, with its kind and the containers it sits inside', async () => {
		const w = page(FORM);
		const sub = w.document.getElementById('sub') as HTMLElement;
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor & { box: unknown }>;
		under(w, sub);
		move(w);
		click(w, sub);
		const a = await picked;
		expect(a.tag).toBe('p');
		expect(a.selector).toBe('#sub');
		expect(a.inside).toEqual(['Notification Preferences', 'Hotlist Hits']);
		expect(a.box).toEqual({ x: 10, y: 20, width: 100, height: 30 });
	});

	it('climbs to the container with the up arrow, and back with the down arrow', async () => {
		const w = page(FORM);
		const sub = w.document.getElementById('sub') as HTMLElement;
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		under(w, sub);
		move(w);
		const up = press(w, 'ArrowUp');
		expect(up.defaultPrevented).toBe(true); // the page does not scroll
		expect(chipOf(w).textContent).toContain('<div>');
		press(w, 'ArrowUp');
		expect(chipOf(w).textContent).toContain('<section>');
		press(w, 'ArrowDown');
		expect(chipOf(w).textContent).toContain('<div>');
		// The click lands on the paragraph, but what was chosen was the container, and that is what is recorded.
		click(w, sub);
		const a = await picked;
		expect(a.tag).toBe('div');
		expect(w.document.querySelector(a.selector)?.getAttribute('aria-label')).toBe('Hotlist Hits');
	});

	it('does not climb past the page itself', () => {
		const w = page('<p id="only">Hi</p>');
		void w.eval(PICK_SCRIPT);
		under(w, w.document.getElementById('only') as HTMLElement);
		move(w);
		for (let i = 0; i < 5; i++) press(w, 'ArrowUp');
		expect(chipOf(w).textContent).toContain('<p>');
		expect(chipOf(w).textContent).not.toContain('<body>');
	});

	it('starts again from the new element when the pointer moves to another', () => {
		const w = page(FORM);
		void w.eval(PICK_SCRIPT);
		under(w, w.document.getElementById('sub') as HTMLElement);
		move(w);
		press(w, 'ArrowUp');
		under(w, w.document.querySelector('h2') as HTMLElement);
		move(w);
		expect(chipOf(w).textContent).toContain('<h2> Notification Preferences');
	});

	it('names only what is nameable, never repeats the element itself, and keeps at most three', async () => {
		const w = page(`
		  <main aria-label="Admin">
		    <section aria-label="Settings"><div aria-label="Alerts"><div aria-label="Hotlist Hits"><p id="deep">Deep</p></div></div></section>
		  </main>`);
		const picked = w.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w, w.document.getElementById('deep') as HTMLElement);
		expect((await picked).inside).toEqual(['Settings', 'Alerts', 'Hotlist Hits']);

		const w2 = page('<section><h2>Same words</h2></section>');
		const p2 = w2.eval(PICK_SCRIPT) as Promise<CommentAnchor>;
		click(w2, w2.document.querySelector('h2') as HTMLElement);
		expect((await p2).inside).toEqual([]);
	});

	it('takes the outline and its label away when the click is made, and when it is cancelled, leaving the page as it was', async () => {
		const w = page(FORM);
		const sub = w.document.getElementById('sub') as HTMLElement;
		const picked = w.eval(PICK_SCRIPT) as Promise<unknown>;
		under(w, sub);
		move(w);
		expect(layers(w)).toHaveLength(2);
		click(w, sub);
		await picked;
		expect(w.document.querySelector('[data-fd-layer]')).toBeNull();
		expect(w.document.querySelector('style[data-fd]')).toBeNull();

		const cancelled = w.eval(PICK_SCRIPT) as Promise<unknown>;
		move(w);
		press(w, 'Escape');
		expect(await cancelled).toBeNull();
		expect(w.document.querySelector('[data-fd-layer]')).toBeNull();
	});

	it('does not outline one of the app\'s own pins as if it were the page', () => {
		const w = page(FORM);
		const sub = w.document.getElementById('sub') as HTMLElement;
		w.eval(resolveScript([req(1, { selector: '#sub' })], 'nonce'));
		void w.eval(PICK_SCRIPT);
		const pin = w.document.querySelector('[data-fd-layer]') as HTMLElement;
		(w.document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [pin, sub, sub.parentElement as Element];
		move(w);
		expect(chipOf(w)).toBeDefined();
		expect(chipOf(w).textContent).toContain('<p>');
	});

	it('hides the outline too while a picture is taken, with every other layer', async () => {
		const w = page(FORM);
		void w.eval(PICK_SCRIPT);
		under(w, w.document.getElementById('sub') as HTMLElement);
		move(w);
		await (w.eval(layerVisibleScript(false)) as Promise<unknown>);
		expect(layers(w).every((l) => l.style.visibility === 'hidden')).toBe(true);
	});
});

