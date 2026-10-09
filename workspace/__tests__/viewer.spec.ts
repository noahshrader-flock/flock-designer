// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeBody } from '../src/shared/anchor';
import { Viewer } from '../src/viewer/Viewer';
import { saveToken, savedToken } from '../src/viewer/browserAdapter';
import { PAGE_CONFIG as CONFIG, commentOnPage, fakeGitHub, sitePage } from './pageHarness';
import { button, cards, menuItem, openMenu, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * Commenting on a prototype's published page (M7 of the Pages plan): the viewer, drawn into the page the site builds,
 * against a GitHub that answers as its API does, with the real pick and pin scripts running in the prototype's frame.
 */

let gh: ReturnType<typeof fakeGitHub>;
let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async () => {
	const page = sitePage();
	current = await render(createElement(Viewer, { config: CONFIG, slots: page.slots }));
	return page;
};

beforeEach(() => {
	gh = fakeGitHub();
	vi.stubGlobal('fetch', gh.fetch);
	localStorage.clear();
});
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	vi.unstubAllGlobals();
});

describe("the page's bar", () => {
	it("is the app's own: the way back, the project, and a dropdown for the version and one for the iteration", async () => {
		await open();
		expect(document.querySelector('a[href="../../"]')).not.toBeNull();
		expect(document.body.textContent).toContain('Alert history');
		// The versions in one menu, with this one chosen; the iterations of this version in the other.
		await openMenu(button('Version V1: switch version'));
		const versions = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(versions.map((i) => i.textContent?.trim())).toEqual(['V2', 'V1']);
		expect(versions.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true']);
		await press(versions[1] as HTMLElement);
		await settle();
		await openMenu(button('Iteration I1: switch iteration'));
		const iterations = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(iterations.map((i) => i.textContent?.trim())).toEqual(['I2', 'I1']);
		expect(iterations.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true']);
	});

	it('is there before anyone signs in, beside the way to', async () => {
		await open();
		expect(button('Sign in to comment')).toBeTruthy();
		expect(button('Iteration I1: switch iteration')).toBeTruthy();
		expect(button('Version V1: switch version')).toBeTruthy();
	});
});

describe('signing in', () => {
	it('is paused: the button says to comment in the app for now, and keeps nothing', async () => {
		await open();
		await press(button('Sign in to comment'));
		await settle();
		expect(document.body.textContent).toContain('comment on this prototype in Flock Designer');
		expect(document.querySelector('input')).toBeNull();
		await press(button('OK'));
		await settle();
		expect(savedToken()).toBeNull();
		expect(button('Sign in to comment')).toBeTruthy();
	});

	it('forgets the token on signing out', async () => {
		saveToken('good-token');
		await open();
		await press(button('Show all comments'));
		await settle();
		await press(button('Sign out'));
		await settle();
		expect(savedToken()).toBeNull();
		expect(button('Sign in to comment')).toBeTruthy();
	});
});

describe('commenting on the page', () => {
	beforeEach(() => saveToken('good-token'));

	it('picks an element in the prototype, writes the comment in the box, and puts it on the iteration’s thread with its pin', async () => {
		const { doc } = await open();
		await press(button('Comment'));
		await settle();
		await press(doc.querySelector('[data-e2e-ref="clear-filter-button"]') as Element);
		await settle();
		// No picture of the spot from a page, and it says so.
		expect(document.body.textContent).toContain('no picture of the spot');
		await typeInto(document.querySelector('#comment-draft') as HTMLTextAreaElement, 'Make this primary');
		await press(button('Save'));
		await settle();

		// The thread is the iteration's, found and made as the app does it.
		expect(gh.issues).toHaveLength(1);
		expect(gh.issues[0]?.body).toContain('branch: `prototype/demo/v1-i1`');
		expect(gh.issues[0]?.labels).toEqual(['flock-designer:review']);
		expect(gh.issues[0]?.comments[0]?.body).toContain('Make this primary');
		expect(gh.issues[0]?.comments[0]?.body).toContain('clear-filter-button');

		// The numbered pin in the prototype, and the card in the side panel.
		expect(doc.querySelector('[data-fd-layer="pins"]')?.textContent).toContain('1');
		expect(button('Show all comments').textContent).toBe('1');
		await press(button('Show all comments'));
		await settle();
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Make this primary')]);
	});

	it('resolves a comment from its card, taking its pin off the prototype', async () => {
		const { doc } = await open();
		await commentOnPage(doc, 'h1', 'Bigger');
		await press(button('Show all comments'));
		await settle();
		await press(menuItem(await openMenu(button('Comment actions')), 'Resolve'));
		await settle();
		expect(gh.issues[0]?.comments[0]?.body).toContain('<!-- resolved -->');
		expect(doc.querySelector('[data-fd-layer="pins"]')).toBeNull();
	});

	it('shows the comments made in the app, on the same iteration, pinned where they were made', async () => {
		const made = await open();
		await unmountAll((current as NonNullable<typeof current>).root);
		gh.issues.push({
			number: 1,
			body: 'Review thread for **demo**, branch: `prototype/demo/v1-i1`.',
			labels: ['flock-designer:review'],
			comments: [
				{
					id: 7,
					// As the app writes it, at its own server's address for this prototype.
					body: composeBody('From the app', { route: '/demo/v1-i1/', selector: '[data-e2e-ref="clear-filter-button"]', nearbyText: 'Clear Filter', viewport: { width: 1, height: 1 }, commit: '' }),
					user: { login: 'noah' },
					created_at: '2026-10-08T09:00:00Z',
				},
			],
		});
		void made;
		const { doc } = await open();
		await settle();
		expect(doc.querySelector('[data-fd-layer="pins"]')?.textContent).toContain('1');
	});
});
