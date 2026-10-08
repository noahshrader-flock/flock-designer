// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignRepo } from '../src/main/services/designRepo';
import { Review } from '../src/renderer/Review';
import type { CommentAnchor } from '../src/shared/contract';
import { Viewer } from '../src/viewer/Viewer';
import { browserComments, framePage, tokenApi } from '../src/viewer/browserAdapter';
import { PAGE_CONFIG, fakeGitHub, sitePage } from './pageHarness';
import { button, cards, fail, fakeApp, menuItem, ok, openMenu, press, render, reviewProps, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * The round trip (M8 of the Pages plan): a comment made on a prototype's published page reaches the app, and what the
 * app does with it reaches the page, through one GitHub. Each side is the real thing: the page's viewer, and the app's
 * review screen, whose calls go through the app's own GitHub code (`DesignRepo`) as its main process does. Run on
 * every change, so the two can never drift apart unnoticed.
 */

const REF = { owner: PAGE_CONFIG.owner, repo: PAGE_CONFIG.repo };
const BRANCH = `prototype/${PAGE_CONFIG.projectId}/${PAGE_CONFIG.name}`;
const PROTOTYPE = '<main><h1>Alert history</h1><button data-e2e-ref="clear-filter-button">Clear Filter</button></main>';

let gh: ReturnType<typeof fakeGitHub>;
let current: Awaited<ReturnType<typeof render>> | null = null;
const close = async () => {
	if (current) await unmountAll(current.root);
	current = null;
};

/** The page, signed in as the reviewer. */
const openPage = async () => {
	localStorage.setItem('flock-designer.github-token', 'good-token');
	const page = sitePage();
	current = await render(createElement(Viewer, { config: PAGE_CONFIG, slots: page.slots }));
	return page;
};

/**
 * The app, signed in as Noah: its review screen on the same iteration, its comments through the app's own GitHub code,
 * and its preview a frame of the same prototype, where the same pin scripts run as in the native preview.
 */
const openApp = async (address?: { iteration: string }) => {
	const repo = new DesignRepo(tokenApi('app-token', gh.fetch as never), REF);
	const result = async <T>(work: Promise<T>) => {
		try {
			return ok(await work);
		} catch (err) {
			return fail(err instanceof Error ? err.message : String(err));
		}
	};
	// The app's preview, up before the screen draws its pins on it.
	document.body.innerHTML = '';
	const preview = document.createElement('iframe');
	document.body.append(preview);
	(preview.contentDocument as Document).body.innerHTML = PROTOTYPE;
	const fw = preview.contentWindow as unknown as { Element: { prototype: Record<string, unknown> } };
	fw.Element.prototype.scrollIntoView = () => undefined;
	fw.Element.prototype.animate = () => undefined;
	const app = fakeApp({
		signInState: async () => ok({ state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } }),
		readComments: (projectId: string, branch: string) => result(repo.readComments(projectId, branch)),
		postComment: (projectId: string, branch: string, body: string, anchor: CommentAnchor) => result(repo.postComment(projectId, branch, body, anchor, null)),
		resolveComment: (id: number, resolved: boolean) => result(repo.setResolved(id, resolved)),
		deleteComment: (id: number) => result(repo.deleteComment(id).then(() => null)),
		moveComment: (id: number, anchor: CommentAnchor) => result(repo.moveComment(id, anchor)),
		pageShowMarkers: (items: never) => framePage(preview).showMarkers(items),
		// Address, as the main process finishes it: the change made, and the comment marked (and resolved) where it is.
		addressPrototype: async () => ok({ state: 'running', startedAt: 'now' }),
		agentStatus: async () => ok({ state: 'finished', exitCode: 0 }),
		finishPrototypeAddress: async (id: number) =>
			ok({ changed: true, iteration: address?.iteration ?? 'v1-i1', made: null, comment: await repo.setAddressed(id, 'abc1234def56', address?.iteration ?? 'v1-i1') }),
	});
	(window as unknown as { workspace: unknown }).workspace = app.api;
	current = await render(createElement(Review, reviewProps() as never));
	return { app, preview: preview.contentDocument as Document };
};

const sidebar = async () => {
	await press(button('Show all comments'));
	await settle();
};
const cardFor = (text: string) => {
	const c = cards().find((el) => el.textContent?.includes(text));
	if (!c) throw new Error(`no card for ${text}: ${cards().map((x) => x.textContent).join(' | ')}`);
	return c;
};
/** A comment made on the page, as a reviewer makes one: Comment, a click on the prototype, the words, Save. */
const commentOnPage = async (doc: Document, selector: string, words: string) => {
	await press(button('Comment'));
	await settle();
	await press(doc.querySelector(selector) as Element);
	await settle();
	await typeInto(document.querySelector('#comment-draft') as HTMLTextAreaElement, words);
	await press(button('Save'));
	await settle();
	// Comment mode carries on, waiting for the next click: the reviewer is done.
	await press(button('Comment'));
	await settle();
};
const pinsIn = (doc: Document) => doc.querySelector('[data-fd-layer="pins"]')?.textContent ?? '';

beforeEach(() => {
	gh = fakeGitHub();
	vi.stubGlobal('fetch', gh.fetch);
	localStorage.clear();
});
afterEach(async () => {
	await close();
	vi.unstubAllGlobals();
});

describe('the round trip, through one GitHub', () => {
	it('a comment made on the page is in the app, by its author, pinned on the same element', async () => {
		const page = await openPage();
		await commentOnPage(page.doc, '[data-e2e-ref="clear-filter-button"]', 'Make this primary');
		await close();

		const { preview } = await openApp();
		await sidebar();
		expect(cardFor('Make this primary').textContent).toContain('pat');
		// Placed on its element, not followed by text nor shown as a page comment.
		expect(cardFor('Make this primary').textContent).not.toMatch(/no longer on the page|follows its text/);
		expect(pinsIn(preview)).toContain('1');
	});

	it('appears in an app already open when its window comes back to the front', async () => {
		const { preview } = await openApp();
		await sidebar();
		expect(document.body.textContent).toContain('No comments yet');
		// Meanwhile, on the page.
		const store = browserComments(tokenApi('good-token', gh.fetch as never), REF, { projectId: PAGE_CONFIG.projectId, branch: BRANCH });
		const anchor = { route: '/', selector: 'h1', nearbyText: 'Alert history', viewport: { width: 1, height: 1 }, commit: '' };
		expect((await store.post('Bigger title', anchor, null)).ok).toBe(true);
		window.dispatchEvent(new Event('focus'));
		await settle();
		expect(cardFor('Bigger title').textContent).toContain('pat');
		expect(pinsIn(preview)).toContain('1');
	});

	it('resolved in the app, it is resolved on the page, and its pin is gone there', async () => {
		let page = await openPage();
		await commentOnPage(page.doc, 'h1', 'Bigger title');
		await close();

		await openApp();
		await sidebar();
		await press(menuItem(await openMenu(button('Comment actions', cardFor('Bigger title'))), 'Resolve'));
		await settle();
		await close();

		page = await openPage();
		await settle();
		expect(pinsIn(page.doc)).toBe('');
		await press(button('Show all comments'));
		await settle();
		expect(cardFor('Bigger title').textContent).toContain('Resolved');
	});

	it('deleted on the page, it is gone from the app', async () => {
		const page = await openPage();
		await commentOnPage(page.doc, 'h1', 'Keep this');
		await commentOnPage(page.doc, '[data-e2e-ref="clear-filter-button"]', 'Never mind');
		await press(button('Show all comments'));
		await settle();
		await press(menuItem(await openMenu(button('Comment actions', cardFor('Never mind'))), 'Delete'));
		await press(button('Delete', cardFor('Never mind')));
		await settle();
		await close();

		await openApp();
		await sidebar();
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Keep this')]);
	});

	it('addressed from the app, the page says so, and where the change is', async () => {
		let page = await openPage();
		await commentOnPage(page.doc, 'h1', 'Remove this');
		await close();

		// Someone other than its maker commented, so the change is in the next iteration.
		await openApp({ iteration: 'v1-i2' });
		await sidebar();
		await press(menuItem(await openMenu(button('Comment actions', cardFor('Remove this'))), 'Address'));
		await new Promise((r) => setTimeout(r, 1100));
		await settle();
		expect(cardFor('Remove this').textContent).toContain('The agent addressed this in V1 · I2');
		await close();

		page = await openPage();
		await settle();
		await press(button('Show all comments'));
		await settle();
		expect(cardFor('Remove this').textContent).toContain('Resolved');
		expect(cardFor('Remove this').textContent).toContain('The agent addressed this in V1 · I2');
		expect(pinsIn(page.doc)).toBe('');
	});
});
