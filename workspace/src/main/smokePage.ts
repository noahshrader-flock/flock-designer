import { type BrowserWindow, type WebContentsView } from 'electron';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { assertPreviewUrl } from '../shared/anchor';
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
	const page = new PageView(window, (r) => routes.push(r));
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
	const anchor = picked;
	if (anchor.selector !== '[data-e2e-ref="users-invite"]') fail(`wrong element picked: ${JSON.stringify(anchor)}`);
	if (anchor.route !== '/users') fail(`wrong route: ${anchor.route}`);
	if ((await js<number>('window.__pressed')) !== 0) fail('the click reached the page');

	// 3. Reopened on the same page: found, and the marker sits on the element.
	console.log('smoke-page: step 3');
	const items = [{ id: 7, number: 1, anchor }];
	let r = await page.showMarkers(items);
	if (r[0]?.state !== 'found') fail(`expected found, got ${JSON.stringify(r)}`);
	const markerOnElement = () =>
		js<boolean>(`(function(){var m=document.querySelector('[data-fd-layer] div').getBoundingClientRect();var e=document.querySelector('[data-e2e-ref]').getBoundingClientRect();return m.left+11>=e.left-1&&m.left+11<=e.right+1&&m.top+11>=e.top-1&&m.top+11<=e.bottom+1;})()`);
	if (!(await markerOnElement())) fail('the marker is not on the element');

	// 4. After the window is resized the marker is still on it.
	console.log('smoke-page: step 4');
	page.setBounds({ x: 0, y: 0, width: 420, height: 380 });
	await new Promise((res) => setTimeout(res, 700));
	if (!(await markerOnElement())) fail('the marker came off the element after a resize');

	// 5. The markup changed: it follows the text. Then the element is gone: page-level.
	console.log('smoke-page: step 5');
	version = '2';
	await wc.loadURL(`${origin}/users?x=2`);
	r = await page.showMarkers(items);
	if (r[0]?.state !== 'moved') fail(`expected moved, got ${JSON.stringify(r)}`);
	version = '3';
	await wc.loadURL(`${origin}/users?x=3`);
	r = await page.showMarkers(items);
	if (r[0]?.state !== 'missing') fail(`expected missing, got ${JSON.stringify(r)}`);

	// 6. The page cannot take the view somewhere else.
	console.log('smoke-page: step 6');
	await js('setTimeout(function(){ location.assign("http://127.0.0.1:1/away") }, 0)');
	await new Promise((res) => setTimeout(res, 500));
	if (!wc.getURL().startsWith(origin)) fail(`the preview navigated away: ${wc.getURL()}`);

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
