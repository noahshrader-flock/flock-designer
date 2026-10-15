import { createElement } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeBody } from '../src/shared/anchor';
import { Viewer } from '../src/viewer/Viewer';
import { saveToken, savedToken, tokenApi } from '../src/viewer/browserAdapter';
import type { Relay } from '../src/viewer/relay';
import type { Result } from '../src/shared/contract';
import { ReviewThreads } from '../src/host/reviewThreads';
import { PAGE_CONFIG as CONFIG, commentOnPage, fakeGitHub, sitePage } from './pageHarness';
import {
	button,
	cards,
	menuItem,
	openMenu,
	press,
	render,
	settle,
	shownState,
	state,
	stateButtons,
	stateGroup,
	typeInto,
	unmountAll,
	shownTheme,
	themeButton,
} from './reviewHarness';
import { anAnchor } from './fixtures';

/**
 * Commenting on a prototype's published page (M7 of the Pages plan): the viewer, drawn into the page the site builds,
 * against a GitHub that answers as its API does, with the real pick and pin scripts running in the prototype's frame.
 */

let gh: ReturnType<typeof fakeGitHub>;
let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (relay: Relay | null = null) => {
	const page = sitePage();
	current = await render(createElement(Viewer, { config: CONFIG, slots: page.slots, relay }));
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

describe('a page built without the page agent', () => {
	it('says so, rather than showing no pins without a word, once it has had time to say it is there', async () => {
		saveToken('good-token');
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
		try {
			current = await render(createElement(Viewer, { config: CONFIG, slots: sitePage({ agent: false }).slots, relay: null }));
			const says = () => document.body.textContent?.includes('built without DSNR’s page agent');
			await act(async () => void vi.advanceTimersByTime(7_000));
			expect(says()).toBe(false);
			await act(async () => void vi.advanceTimersByTime(1_000));
			expect(says()).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('says nothing of it for a page that has one, however long it is open', async () => {
		saveToken('good-token');
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
		try {
			current = await render(createElement(Viewer, { config: CONFIG, slots: sitePage().slots, relay: null }));
			await settle();
			await act(async () => void vi.advanceTimersByTime(20_000));
			expect(document.body.textContent).not.toContain('built without DSNR’s page agent');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('a page from this machine with no key of DSNR’s (BROWSER_COMMENTS_PLAN 2.2)', () => {
	it('says how to comment: open it from DSNR in VS Code', async () => {
		current = await render(createElement(Viewer, { config: CONFIG, slots: sitePage().slots, relay: null, openedHere: true }));
		await press(button('Sign in to comment'));
		await settle();
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Open in browser');
		expect(document.body.textContent).not.toContain('Commenting here is coming');
	});
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

describe('the states of the page', () => {
	const withStates = async (states: string[]) => {
		// The site gives the frame src="page.html"; jsdom would never finish loading it, and the viewer reads it as that when unset.
		const page = sitePage();
		current = await render(createElement(Viewer, { config: { ...CONFIG, states }, slots: page.slots }));
		return page;
	};

	it('are a group of buttons between the version and the history, and pressing one opens the page in it', async () => {
		const { frame } = await withStates(['default', 'filtered', 'panel']);
		expect(stateButtons().map((i) => i.textContent)).toEqual(['Default', 'Filtered', 'Panel']);
		expect(shownState()).toBe('Default');
		// In the bar's order: the version, the states, then the history.
		const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		expect(before(button('Version V1: switch version'), stateGroup() as Element)).toBe(true);
		expect(before(stateGroup() as Element, button('Iteration I1: switch iteration'))).toBe(true);
		await press(state('Panel'));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?state=panel');
		expect(shownState()).toBe('Panel');
		// Back to the first is the page as it opens.
		await press(state('Default'));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html');
	});

	it('open from a comment made in another of them, by the button on its card', async () => {
		saveToken('good-token');
		gh.issues.push({
			number: 1,
			body: 'Review thread for **demo**, branch: `prototype/demo/v1-i1`.',
			labels: ['flock-designer:review'],
			comments: [
				{
					id: 7,
					body: composeBody('On the panel', anAnchor({ route: '/demo/v1-i1/', state: '?state=panel' })),
					user: { login: 'noah' },
					created_at: '2026-10-08T09:00:00Z',
				},
			],
		});
		const { frame } = await withStates(['default', 'panel']);
		await settle();
		await press(button(/^Show all comments/));
		await settle();
		const card = cards().find((c) => c.textContent?.includes('On the panel')) as HTMLElement;
		await press(button('Show in Panel', card));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?state=panel');
		expect(shownState()).toBe('Panel');
	});

	it('can be seen in light or dark, whatever the machine is set to, and keep their theme between states', async () => {
		const { frame } = await withStates(['default', 'panel']);
		// With nothing chosen, the system's (light, here), and the page as it is.
		expect(shownTheme()).toBe('Light');
		await press(themeButton('Dark'));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?theme=dark');
		expect(shownTheme()).toBe('Dark');
		await press(state('Panel'));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?state=panel&theme=dark');
		await press(themeButton('Light'));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?state=panel&theme=light');
	});

	it('open a comment made in dark in dark, by the button on its card', async () => {
		saveToken('good-token');
		gh.issues.push({
			number: 1,
			body: 'Review thread for **demo**, branch: `prototype/demo/v1-i1`.',
			labels: ['flock-designer:review'],
			comments: [
				{
					id: 7,
					body: composeBody('Too dark to read', anAnchor({ route: '/demo/v1-i1/', theme: 'dark' })),
					user: { login: 'noah' },
					created_at: '2026-10-08T09:00:00Z',
				},
			],
		});
		const { frame } = await withStates(['default', 'panel']);
		await settle();
		await press(button(/^Show all comments/));
		await settle();
		const card = cards().find((c) => c.textContent?.includes('Too dark to read')) as HTMLElement;
		await press(button('Show in Dark', card));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?theme=dark');
		expect(shownTheme()).toBe('Dark');
		// Shown in it now: no button to show it there again.
		expect([...card.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Show in Dark');
	});

	it('are not offered for a page with one, or a page built before pages said', async () => {
		await withStates(['default']);
		expect(document.querySelector('[aria-label^="State"]')).toBeNull();
		await unmountAll(current!.root);
		current = await render(createElement(Viewer, { config: CONFIG, slots: sitePage().slots }));
		expect(document.querySelector('[aria-label^="State"]')).toBeNull();
		expect(button('Iteration I1: switch iteration')).toBeTruthy();
	});
});

describe('signing in', () => {
	it('is paused: the button says to comment in the app for now, and keeps nothing', async () => {
		await open();
		await press(button('Sign in to comment'));
		await settle();
		expect(document.body.textContent).toContain('comment on this prototype in DSNR');
		expect(document.querySelector('input')).toBeNull();
		await press(button('OK'));
		await settle();
		expect(savedToken()).toBeNull();
		expect(button('Sign in to comment')).toBeTruthy();
	});

	it('forgets the token on signing out', async () => {
		saveToken('good-token');
		await open();
		await press(button(/^Show all comments/));
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
		expect(button(/^Show all comments/).textContent).toBe('1');
		await press(button(/^Show all comments/));
		await settle();
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Make this primary')]);
	});

	it('resolves a comment from its card, taking its pin off the prototype', async () => {
		const { doc } = await open();
		await commentOnPage(doc, 'h1', 'Bigger');
		await press(button(/^Show all comments/));
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
					body: composeBody(
						'From the app',
						anAnchor({ route: '/demo/v1-i1/', selector: '[data-e2e-ref="clear-filter-button"]', nearbyText: 'Clear Filter' }),
					),
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

describe('in DSNR’s review tab, in VS Code', () => {
	/** DSNR's tab, answering as the extension does: the core's comment calls over the same GitHub, and its own two. */
	const tab = (signedIn = true) => {
		const threads = new ReviewThreads(tokenApi('good-token'), { owner: CONFIG.owner, repo: CONFIG.repo });
		let account = signedIn ? { state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } } : { state: 'signedOut' };
		const asked: [string, unknown[]][] = [];
		const result = async <T>(work: Promise<T>) => ({ ok: true as const, value: await work });
		const relay: Relay = {
			ask: async (name, args) => {
				asked.push([name, args]);
				const [a, b, c, d] = args as [never, never, never, never];
				switch (name) {
					case 'signInState':
						return { ok: true, value: account };
					case 'signIn':
						account = { state: 'signedIn', user: { login: 'noah', name: 'Noah', avatarUrl: null } };
						return { ok: true, value: account };
					case 'readComments':
						return result(threads.readComments(b));
					case 'postComment':
						return result(threads.postComment(a, b, c, d, null));
					case 'resolveComment':
						return result(threads.setResolved(a, b));
					case 'address':
						return { ok: true, value: null };
					default:
						return { ok: false, error: `${name} is not here` };
				}
			},
		};
		return { relay, asked };
	};

	it('signs in through VS Code from Sign in to comment, with nothing kept in the page, and then comments', async () => {
		const { relay, asked } = tab(false);
		await open(relay);
		await press(button('Sign in to comment'));
		await settle();
		expect(asked.map(([name]) => name)).toContain('signIn');
		expect(document.body.textContent).not.toContain('Commenting here is coming');
		expect(savedToken()).toBeNull();
		expect(button('Comment')).toBeTruthy();
	});

	it('says to continue in VS Code while its sign-in is open there, and offers nothing else meanwhile (BROWSER_COMMENTS_PLAN 2.2)', async () => {
		let signedIn: (r: Result<unknown>) => void = () => undefined;
		const relay: Relay = {
			ask: (name) =>
				name === 'signIn' ? new Promise((resolve) => (signedIn = resolve)) : Promise.resolve({ ok: true, value: { state: 'signedOut' } }),
		};
		await open(relay);
		await press(button('Sign in to comment'));
		expect(button('Continue in VS Code…').disabled).toBe(true);
		await act(async () => signedIn({ ok: true, value: { state: 'signedOut' } }));
		await settle();
		// Not signed in after all (closed in VS Code): the way to sign in again.
		expect(button('Sign in to comment').disabled).toBe(false);
	});

	it('puts a comment on the iteration’s thread through DSNR, and has no Sign out of its own', async () => {
		const { relay, asked } = tab();
		const { doc } = await open(relay);
		await settle();
		await commentOnPage(doc, 'h1', 'Bigger');
		expect(asked.filter(([name]) => name === 'postComment').map(([, args]) => args.slice(0, 3))).toEqual([
			['demo', 'prototype/demo/v1-i1', 'Bigger'],
		]);
		expect(gh.issues[0]?.comments[0]?.body).toContain('Bigger');
		await press(button(/^Show all comments/));
		await settle();
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Sign out')).toBe(false);
	});

	it('offers Address on an open comment, which asks DSNR to address it, on the iteration this page is', async () => {
		const { relay, asked } = tab();
		const { doc } = await open(relay);
		await settle();
		await commentOnPage(doc, 'h1', 'Bigger');
		await press(button(/^Show all comments/));
		await settle();
		await press(menuItem(await openMenu(button('Comment actions')), 'Address'));
		await settle();
		const comment = gh.issues[0]!.comments[0]!;
		expect(asked.at(-1)).toEqual(['address', [{ thread: gh.issues[0]!.number, id: comment.id }, 'prototype/demo/v1-i1']]);
	});

	it('is told which iteration Address shows its change in, for a page in the browser to go to (BROWSER_COMMENTS_PLAN 3.2)', async () => {
		const { relay } = tab();
		const addressed = vi.fn();
		const answering: Relay = { ask: (name, args) => (name === 'address' ? Promise.resolve({ ok: true, value: 'v1-i2' }) : relay.ask(name, args)) };
		const page = sitePage();
		current = await render(createElement(Viewer, { config: CONFIG, slots: page.slots, relay: answering, onAddressed: addressed }));
		await settle();
		await commentOnPage(page.doc, 'h1', 'Bigger');
		await press(button(/^Show all comments/));
		await settle();
		await press(menuItem(await openMenu(button('Comment actions')), 'Address'));
		await settle();
		expect(addressed).toHaveBeenCalledWith('v1-i2');
	});
});
