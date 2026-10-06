import { type BrowserWindow, type WebContentsView, nativeImage } from 'electron';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { assertPreviewUrl } from '../shared/anchor';
import type { PinEvent } from '../shared/contract';
import { PageView } from './services/pageView';

/**
 * Drives the real preview view against a real local page, in real Electron.
 *
 * The unit tests run the in-page scripts in jsdom, which has no layout, no
 * sandbox and no real clicks. This is what proves the parts jsdom cannot: that
 * the preview has no bridge to the app, that a genuine mouse click is picked,
 * that markers survive a resize, and that a page cannot navigate the view away.
 * Run with `npm run smoke:page`.
 */

const PAGES: Record<string, string> = {
	'1': '<body style="margin:0"><button data-e2e-ref="users-invite" style="margin:40px;width:200px;height:60px">Invite users</button><p>Other</p></body>',
	'2': '<body style="margin:0"><section><span style="display:block;margin:40px">Invite users</span></section></body>',
	'3': '<body style="margin:0"><p>Nothing relevant</p></body>',
};

const fail = (msg: string): never => {
	throw new Error(msg);
};

export const runPageSmoke = async (window: BrowserWindow): Promise<void> => {
	let version = '1';
	const server = createServer((req, res) => {
		if (req.url?.startsWith('/users')) {
			res.setHeader('content-type', 'text/html');
			res.end(PAGES[version]);
		} else {
			res.statusCode = 404;
			res.end();
		}
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	// A hidden window does not render or take input, which is the thing under test.
	window.setPosition(-3000, -3000);
	window.showInactive();

	const routes: string[] = [];
	const pins: PinEvent[] = [];
	const page = new PageView(window, (r) => routes.push(r), (e) => pins.push(e));
	page.setBounds({ x: 0, y: 0, width: 800, height: 600 });
	await page.open(`${origin}/users`);

	const view = window.contentView.children[0] as WebContentsView;
	const wc = view.webContents;
	const js = <T>(code: string) => wc.executeJavaScript(code, true) as Promise<T>;
	await new Promise((r) => setTimeout(r, 300));

	// 1. Isolation: nothing of the app is visible to the page.
	console.log('smoke-page: step 1');
	const seen = await js<string>('JSON.stringify([typeof window.workspace, typeof require, typeof process, typeof electron])');
	if (seen !== '["undefined","undefined","undefined","undefined"]') fail(`the preview can see the app: ${seen}`);

	// 2. A real mouse click is picked, and not delivered to the page.
	console.log('smoke-page: step 2');
	await js('window.__pressed = 0; document.addEventListener("click", () => window.__pressed++)');
	const picking = page.pick();
	await new Promise((r) => setTimeout(r, 200));
	wc.sendInputEvent({ type: 'mouseDown', x: 100, y: 70, button: 'left', clickCount: 1 });
	wc.sendInputEvent({ type: 'mouseUp', x: 100, y: 70, button: 'left', clickCount: 1 });
	const picked = await picking;
	if (picked === null) return fail('nothing was picked');
	const anchor = picked.anchor;
	// The click's own position comes back too: the comment box is placed beside the pin with it.
	if (Math.abs(picked.at.x - 100) > 2 || Math.abs(picked.at.y - 70) > 2) fail(`the click position was wrong: ${JSON.stringify(picked.at)}`);
	if (anchor.selector !== '[data-e2e-ref="users-invite"]') fail(`wrong element picked: ${JSON.stringify(anchor)}`);
	if (anchor.route !== '/users') fail(`wrong route: ${anchor.route}`);
	if ((await js<number>('window.__pressed')) !== 0) fail('the click reached the page');

	// 2b. A picture of the spot came back with the click: a small, real JPEG that fits in a comment.
	console.log('smoke-page: step 2b');
	const first = picked.picture;
	if (!first?.startsWith('data:image/jpeg;base64,')) return fail(`no picture came with the click: ${String(first).slice(0, 40)}`);
	const bytes = Buffer.from(first.split(',')[1] as string, 'base64');
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) fail('the picture is not a JPEG');
	if (bytes.length > 12_000) fail(`the picture is ${bytes.length} bytes, over the 12,000 allowed`);
	const decoded = nativeImage.createFromDataURL(first).getSize();
	if (decoded.width < 80 || decoded.width > 240 || decoded.height < 40) fail(`the picture is an odd size: ${JSON.stringify(decoded)}`);
	console.log(`smoke-page: picture ${bytes.length} bytes, ${decoded.width}x${decoded.height}`);

	// 3. Reopened on the same page: found, and the marker sits on the element.
	console.log('smoke-page: step 3');
	const items = [{ id: 7, number: 1, anchor, movable: true }];
	let r = await page.showMarkers(items);
	if (r[0]?.state !== 'found') fail(`expected found, got ${JSON.stringify(r)}`);
	// The pin's tip is the wrapper's position, and it must be where the click was: inside the element.
	const markerOnElement = () =>
		js<boolean>(`(function(){var m=document.querySelector('[data-fd-layer] > div').getBoundingClientRect();var e=document.querySelector('[data-e2e-ref]').getBoundingClientRect();return m.left>=e.left-1&&m.left<=e.right+1&&m.top>=e.top-1&&m.top<=e.bottom+1;})()`);
	if (!(await markerOnElement())) fail('the marker is not on the element');

	// 3a. With a pin already on the page, a picture of that spot does not show the pin.
	console.log('smoke-page: step 3a');
	const blue = (img: Electron.NativeImage) => {
		const bmp = img.toBitmap();
		let n = 0;
		for (let i = 0; i + 3 < bmp.length; i += 4) {
			const b = bmp[i] as number, g = bmp[i + 1] as number, r = bmp[i + 2] as number;
			if (Math.abs(r - 37) < 30 && Math.abs(g - 99) < 30 && Math.abs(b - 235) < 30) n++;
		}
		return n;
	};
	// Control: the pin really is in an ordinary capture, so finding none below means something.
	// (The pin was only just drawn: let the page paint it first, as the app's own snapshot does.)
	await js('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
	const control = blue(await wc.capturePage({ x: 20, y: 20, width: 160, height: 100 }));
	if (control < 20) fail(`the control capture does not show the pin (${control} blue pixels), so the check below proves nothing`);
	const again = page.pick();
	await new Promise((res) => setTimeout(res, 200));
	// Elsewhere on the same button, not on the pin itself (which would also select the pin), but
	// close enough that the pin is inside the area the picture is cropped from.
	wc.sendInputEvent({ type: 'mouseDown', x: 200, y: 85, button: 'left', clickCount: 1 });
	wc.sendInputEvent({ type: 'mouseUp', x: 200, y: 85, button: 'left', clickCount: 1 });
	const second = await again;
	if (!second?.picture) return fail('no picture with the second click');
	const inPicture = blue(nativeImage.createFromDataURL(second.picture));
	if (inPicture > 3) fail(`the picture shows the pin (${inPicture} blue pixels), but it should show the thing and not the pin`);
	if ((await js<string>("document.querySelector('[data-fd-layer]').style.visibility")) !== 'visible') fail('the pins were left hidden after the picture');

	// 3b. A pin can be clicked, and dragged, with the real mouse. The pin's body hangs above its tip.
	const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
	console.log('smoke-page: step 3b');
	wc.sendInputEvent({ type: 'mouseDown', x: 100, y: 51, button: 'left', clickCount: 1 });
	wc.sendInputEvent({ type: 'mouseUp', x: 100, y: 51, button: 'left', clickCount: 1 });
	await wait(300);
	if (pins.length !== 1 || pins[0]?.kind !== 'click' || pins[0].id !== 7) fail(`a click on the pin was not reported: ${JSON.stringify(pins)}`);
	wc.sendInputEvent({ type: 'mouseDown', x: 100, y: 51, button: 'left', clickCount: 1 });
	for (const [x, y] of [[140, 90], [220, 200], [300, 300]] as const) {
		wc.sendInputEvent({ type: 'mouseMove', x, y, modifiers: ['leftbuttondown'] });
		await wait(50);
	}
	wc.sendInputEvent({ type: 'mouseUp', x: 300, y: 300, button: 'left', clickCount: 1 });
	await wait(300);
	const moved = pins[1];
	if (pins.length !== 2 || moved?.kind !== 'move' || moved.id !== 7 || moved.anchor.route !== '/users') fail(`a drag was not reported as a move: ${JSON.stringify(pins)}`);
	// A page that writes the same kind of message without knowing the secret is ignored.
	await js(`console.debug('__fd:' + JSON.stringify({ n: 'guess', t: 'click', id: 7 }))`);
	await js(`console.debug('__fd:' + JSON.stringify({ t: 'move', id: 7, anchor: {} }))`);
	await wait(300);
	if (pins.length !== 2) fail(`a forged message was accepted: ${JSON.stringify(pins.slice(2))}`);
	await page.showMarkers(items); // redrawn from the saved comment, back on its element

	// 4. After the window is resized the marker is still on it.
	console.log('smoke-page: step 4');
	page.setBounds({ x: 0, y: 0, width: 420, height: 380 });
	await new Promise((res) => setTimeout(res, 700));
	if (!(await markerOnElement())) fail('the marker came off the element after a resize');

	// 5. The markup changed: it follows the text. Then the element is gone: page-level.
	console.log('smoke-page: step 5');
	version = '2';
	await wc.loadURL(`${origin}/users`);
	r = await page.showMarkers(items);
	if (r[0]?.state !== 'moved') fail(`expected moved, got ${JSON.stringify(r)}`);
	version = '3';
	await wc.loadURL(`${origin}/users`);
	r = await page.showMarkers(items);
	if (r[0]?.state !== 'missing') fail(`expected missing, got ${JSON.stringify(r)}`);

	// 5b. The same page in another state (`?state=error`) is not the page the comment was made on.
	console.log('smoke-page: step 5b');
	version = '1';
	await wc.loadURL(`${origin}/users?state=error`);
	r = await page.showMarkers(items);
	if (r[0]?.state !== 'otherState') fail(`expected otherState, got ${JSON.stringify(r)}`);
	if (await js<boolean>("document.querySelector('[data-fd-layer]') !== null")) fail('a pin was drawn for a comment made in another state');
	const inState = page.pick();
	await new Promise((res) => setTimeout(res, 200));
	wc.sendInputEvent({ type: 'mouseDown', x: 100, y: 70, button: 'left', clickCount: 1 });
	wc.sendInputEvent({ type: 'mouseUp', x: 100, y: 70, button: 'left', clickCount: 1 });
	const stated = (await inState)?.anchor.state;
	if (stated !== '?state=error') fail(`a click in ?state=error recorded state ${JSON.stringify(stated)}`);
	await wc.loadURL(`${origin}/users`);
	await new Promise((res) => setTimeout(res, 300));

	// 6. The page cannot take the view somewhere else.
	console.log('smoke-page: step 6');
	await js('setTimeout(function(){ location.assign("http://127.0.0.1:1/away") }, 0)');
	await new Promise((res) => setTimeout(res, 500));
	if (!wc.getURL().startsWith(origin)) fail(`the preview navigated away: ${wc.getURL()}`);

	// 6b. Hiding the preview hands the keyboard to the window, so a box drawn by the window can be typed into.
	console.log('smoke-page: step 6b');
	let handedOver = 0;
	const realFocus = window.webContents.focus.bind(window.webContents);
	window.webContents.focus = () => {
		handedOver++;
		realFocus();
	};
	page.hold('popover', true);
	if (handedOver !== 1) fail(`hiding the preview did not hand the keyboard to the window (${handedOver} times)`);
	page.hold('popover', false);
	if (handedOver !== 1) fail('showing the preview again took the keyboard from the window');
	window.webContents.focus = realFocus;

	// 7. Addresses a preview may not have are refused before a view exists.
	console.log('smoke-page: step 7');
	for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'http://example.com']) {
		try {
			assertPreviewUrl(bad);
			fail(`accepted ${bad}`);
		} catch (e) {
			if ((e as Error).message.startsWith('accepted')) throw e;
		}
	}

	if (!routes.includes('/users')) fail(`the route was never reported: ${JSON.stringify(routes)}`);
	page.close();
	server.close();
	console.log('smoke-page: isolation, real click, markers, resize, move/missing and navigation all behave');
};
