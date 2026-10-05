import { type BrowserWindow, type WebContentsView } from 'electron';
import { writeFileSync } from 'node:fs';
import { readDescriptor } from './services/descriptor';
import { PageView } from './services/pageView';
import { RuntimeManager } from './services/runtime';

/**
 * Runs a real prototype from a real Coke checkout the way the app does:
 * the declared preview command, with the project filled in, then the address it
 * reports opened in the preview view, then a pin placed with a real click.
 *
 *   FD_COKE=/path/to/flock-coke FD_PROJECT=users-inactivity-signal npm run smoke:local
 *
 * The checkout must already be on the project's prototype branch. Not part of
 * the default checks: it needs a Coke checkout with its dependencies installed.
 */
export const runLocalSmoke = async (window: BrowserWindow, coke: string, projectId: string): Promise<void> => {
	const log: string[] = [];
	const runtime = new RuntimeManager({
		onLog: (l) => log.push(l.text),
		onStatus: () => undefined,
	});
	window.setPosition(-3000, -3000);
	window.showInactive();

	const status = await runtime.start(coke, readDescriptor(coke), 'preview', projectId);
	if (status.state !== 'running') throw new Error(`the preview did not start: ${JSON.stringify(status)}\n${log.join('').slice(-800)}`);
	console.log(`smoke-local: preview running at ${status.url}`);

	const page = new PageView(window, () => undefined);
	page.setBounds({ x: 0, y: 0, width: 1100, height: 760 });
	await page.open(status.url);
	await new Promise((r) => setTimeout(r, 2500));
	const view = window.contentView.children[0] as WebContentsView;
	const wc = view.webContents;

	const picking = page.pick();
	await new Promise((r) => setTimeout(r, 200));
	wc.sendInputEvent({ type: 'mouseDown', x: 400, y: 300, button: 'left', clickCount: 1 });
	wc.sendInputEvent({ type: 'mouseUp', x: 400, y: 300, button: 'left', clickCount: 1 });
	const anchor = await picking;
	if (!anchor) throw new Error('no pin could be placed on the real prototype');
	const [result] = await page.showMarkers([{ id: 1, number: 1, anchor, movable: true }]);
	console.log(`smoke-local: pin placed on ${anchor.selector} (${result?.state})`);
	if (result?.state !== 'found') throw new Error(`the pin was not found again: ${JSON.stringify(result)}`);

	if (process.env.FD_SMOKE_SHOT) writeFileSync(process.env.FD_SMOKE_SHOT, (await wc.capturePage()).toPNG());
	page.close();
	await runtime.stop('preview');
	console.log('smoke-local: a real prototype ran from its declared command, opened in the preview, and took a pin');
};
