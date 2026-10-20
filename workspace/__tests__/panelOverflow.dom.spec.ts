import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Panel } from '../extension/webview/Panel';
import type { Context } from '../src/core/services/projects/findContext';
import { SAMPLE_CATALOG, SAMPLE_PROJECTS } from './extensionSamples';
import { panelCss } from './panelStyles';
import { NO_CHROME, OWN_WINDOW, inChrome } from './realChrome';
import { press } from './ui';
import { answer, mountPage, share, shareCatalog } from './webviewHarness';

/**
 * The panel sits in VS Code's side bar, which is narrow and has no room for a sideways scroll: nothing in any view may be
 * wider than the bar. A rule that gives a box `width: 100%` and also padding or a border, with no `box-sizing`, is wider by
 * that padding, which is how a section header once ran 20px past the edge.
 */

const OPEN: Context = {
	product: '/work/flock-coke',
	designSystem: { root: '/work/flock-react-component-lib', how: 'beside' },
	designRepository: '/work/flock-designer/projects',
	productRepository: 'flocksafety/flock-coke',
	source: { state: 'usable', root: '/work/flock-react-component-lib', how: 'beside' },
	missing: [],
};

const shown = async () => {
	await mountPage(createElement(Panel));
	await share('placed', { context: OPEN, unreadable: null, setup: null });
	await share('agent', { name: 'Claude Code' });
	await answer('listProjects', SAMPLE_PROJECTS);
};
const tab = async (name: string) =>
	press([...document.querySelectorAll<HTMLElement>('[role="radiogroup"] [role="radio"]')].find((o) => o.textContent === name)!);

/** What sticks out past the bar at each width: the page's own width against the bar's, and the first boxes beyond it. */
const stickingOut = async (html: string): Promise<string[]> => {
	const css = panelCss();
	return inChrome(async (browser) => {
		const found: string[] = [];
		for (const width of [220, 300, 400]) {
			const page = await browser.newPage(OWN_WINDOW);
			await page.setViewport({ width, height: 800 });
			await page.setContent(
				`<!doctype html><html><head><meta charset="utf-8"><style>:root{--vscode-foreground:#cccccc;--vscode-descriptionForeground:#888888;--vscode-font-size:13px}${css}</style></head><body>${html}</body></html>`,
			);
			found.push(
				...(await page.evaluate((w) => {
					const bar = document.documentElement.clientWidth;
					if (document.documentElement.scrollWidth <= bar) return [];
					const past = [...document.querySelectorAll<HTMLElement>('body *')]
						.filter((e) => e.getBoundingClientRect().right > bar + 0.5)
						.slice(0, 4)
						.map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`);
					return [`${w}px: ${document.documentElement.scrollWidth - bar}px too wide, at ${past.join(', ')}`];
				}, width)),
			);
		}
		return found;
	});
};

describe.skipIf(NO_CHROME)('the panel in a narrow side bar, in the browser on this machine', () => {
	it('has no sideways scroll in its projects', async () => {
		await shown();
		expect(await stickingOut(document.body.innerHTML)).toEqual([]);
	}, 60_000);

	it.each(['Components', 'Tokens'])(
		'has no sideways scroll in the design system’s %s',
		async (name) => {
			await shown();
			await tab('Design System');
			await shareCatalog(SAMPLE_CATALOG);
			await tab(name);
			expect(await stickingOut(document.body.innerHTML)).toEqual([]);
		},
		60_000,
	);
});
