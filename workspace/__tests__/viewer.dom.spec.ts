import { createElement } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeBody } from '../src/shared/anchor';
import { Viewer } from '../src/viewer/Viewer';
import { saveToken, savedToken, tokenApi } from '../src/viewer/browserAdapter';
import type { Relay } from '../src/viewer/relay';
import type { Result } from '../src/shared/contract';
import { ReviewThreads } from '../src/host/reviewThreads';
import { PAGE_CONFIG as CONFIG, PAGE_SIGN_IN as SIGN_IN, commentOnPage, fakeGitHub, sitePage } from './pageHarness';
import {
	button,
	cards,
	menuItem,
	openMenu,
	press,
	render,
	settle,
	shownState,
	chooseState,
	stateMenu,
	typeInto,
	unmountAll,
	shownTheme,
	themeButton,
	themeGroup,
} from './reviewHarness';
import { anAnchor } from './fixtures';

/**
 * Commenting on a prototype's published page (M7 of the Pages plan): the viewer, drawn into the page the site builds,
 * against a GitHub that answers as its API does, with the real pick and pin scripts running in the prototype's frame.
 */

let gh: ReturnType<typeof fakeGitHub>;
let current: Awaited<ReturnType<typeof render>> | null = null;
const open = async (relay: Relay | null = null, signIn: typeof SIGN_IN | null = SIGN_IN) => {
	const page = sitePage();
	current = await render(createElement(Viewer, { config: CONFIG, slots: page.slots, relay, signIn }));
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

describe('signing in on the published site (PUBLISHED_COMMENTS_PLAN, Phase 3)', () => {
	const openSigning = async (more: Record<string, unknown> = {}) => {
		const page = sitePage();
		current = await render(createElement(Viewer, { config: CONFIG, slots: page.slots, relay: null, signIn: SIGN_IN, ...more }));
		return page;
	};
	beforeEach(() => sessionStorage.clear());

	it('sends the person to GitHub from Sign in to comment, with no paused dialog, keeping where to come back to', async () => {
		await openSigning();
		await press(button('Sign in to comment'));
		await settle();
		expect(document.body.textContent).not.toContain('Commenting here is coming');
		const pending = JSON.parse(sessionStorage.getItem('dsnr.sign-in') ?? 'null');
		expect(pending).toMatchObject({ back: location.href });
		expect(pending.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
	});

	it('shows who is signed in as their picture at the end of the bar, small as the buttons beside it; pressed, it says who and offers Sign out', async () => {
		saveToken('good-token');
		await openSigning();
		await settle();
		const account = document.querySelector('[aria-label="Signed in as pat"]') as HTMLElement;
		expect(account.querySelector('[data-slot="avatar"]')?.getAttribute('data-size')).toBe('sm');
		const items = await openMenu(account);
		expect(document.querySelector('[data-signed-in-as]')?.textContent).toBe('Pat Brennanpat');
		expect(items.map((i) => i.textContent)).toEqual(['Sign out']);
		// Not in the comments' drawer, where it was: that is the comments'.
		await press(button(/^Show all comments/));
		await settle();
		expect(cards()).toHaveLength(0);
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Sign out')).toBe(false);
	});

	it('tells a person GitHub will not show the design repository who they are signed in as, and to sign out', async () => {
		saveToken('outsider-token');
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const json = (status: number, body: unknown) => ({
					status,
					headers: { get: () => null },
					json: async () => body,
					text: async () => JSON.stringify(body),
				});
				return url.endsWith('/user') ? json(200, { login: 'outsider' }) : json(404, { message: 'Not Found' });
			}),
		);
		await openSigning();
		// The panel opens on its own to say it (`useOpenOnError`).
		await settle();
		expect(document.body.textContent).toContain('Signed in as outsider, who has no access to acme/design');
		const items = await openMenu(document.querySelector('[aria-label="Signed in as outsider"]') as HTMLElement);
		expect(items.map((i) => i.textContent)).toEqual(['Sign out']);
	});

	it('sends an ended sign-in through GitHub again, and forgets the token', async () => {
		saveToken('ended-token');
		await openSigning();
		await settle();
		expect(savedToken()).toBeNull();
		expect(JSON.parse(sessionStorage.getItem('dsnr.sign-in') ?? 'null')).toMatchObject({ back: location.href });
	});

	it('says an ended sign-in instead when it was just now, so a refused token never loops', async () => {
		saveToken('ended-token');
		sessionStorage.setItem('dsnr.signed-in-at', String(Date.now()));
		await openSigning();
		await settle();
		expect(savedToken()).toBeNull();
		expect(sessionStorage.getItem('dsnr.sign-in')).toBeNull();
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Your sign-in has ended');
	});

	it('says how the last sign-in went, when it did not go', async () => {
		await openSigning({ note: 'cancelled' });
		await settle();
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Signing in was cancelled.');
		await press(button('OK'));
		await settle();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
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
	it("is the app's own: the way back, the project, and a dropdown for the version", async () => {
		await open();
		expect(document.querySelector('a[href="../"]')).not.toBeNull();
		expect(document.body.textContent).toContain('Alert history');
		// Every version in one menu, the newest first, with this one chosen.
		await openMenu(button('Version V1: switch version'));
		const versions = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(versions.map((i) => i.textContent?.trim())).toEqual(['V3', 'V2', 'V1']);
		expect(versions.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
	});

	it('is there before anyone signs in, beside the way to', async () => {
		await open();
		expect(button('Sign in to comment')).toBeTruthy();
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

	it('has a quiet bar: no background and no line under it, so it does not look like part of the page it is over', async () => {
		await withStates(['default', 'panel']);
		const bar = document.querySelector('[data-toolbar]') as HTMLElement;
		expect(bar.className.split(' ')).toContain('bg-transparent');
		expect(bar.className.split(' ')).not.toContain('bg-card');
		expect(bar.className.split(' ')).not.toContain('border-b');
	});

	it('are a dropdown between the version and the theme, and choosing one opens the page in it', async () => {
		const { frame } = await withStates(['default', 'filtered', 'panel']);
		expect(shownState()).toBe('Default');
		// In the bar's order: the version, the states, then the theme.
		const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		expect(before(button('Version V1: switch version'), stateMenu() as Element)).toBe(true);
		expect(before(stateMenu() as Element, themeGroup() as Element)).toBe(true);
		await chooseState('Panel');
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?state=panel');
		expect(shownState()).toBe('Panel');
		// Back to the first is the page as it opens.
		await chooseState('Default');
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html');
	});

	it('open from a comment made in another of them, by the button on its card', async () => {
		saveToken('good-token');
		gh.issues.push({
			number: 1,
			body: 'Review thread for **demo**, branch: `prototype/demo/v1`.',
			labels: ['flock-designer:review'],
			comments: [
				{
					id: 7,
					body: composeBody('On the panel', anAnchor({ route: '/demo/v1/', state: '?state=panel' })),
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
		await chooseState('Panel');
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?state=panel&theme=dark');
		// Back to light, the default: the address says nothing.
		await press(themeButton('Light'));
		await settle();
		expect(frame.getAttribute('src')).toBe('page.html?state=panel');
	});

	it('open a comment made in dark in dark, by the button on its card', async () => {
		saveToken('good-token');
		gh.issues.push({
			number: 1,
			body: 'Review thread for **demo**, branch: `prototype/demo/v1`.',
			labels: ['flock-designer:review'],
			comments: [
				{
					id: 7,
					body: composeBody('Too dark to read', anAnchor({ route: '/demo/v1/', theme: 'dark' })),
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
		expect(button('Version V1: switch version')).toBeTruthy();
	});
});

describe('signing in', () => {
	it('has no Sign in to comment on a site built without signing in: there is nothing for it to do', async () => {
		await open(null, null);
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Sign in to comment')).toBe(false);
	});

	it('forgets the token on signing out', async () => {
		saveToken('good-token');
		await open();
		await settle();
		await press(menuItem(await openMenu(document.querySelector('[aria-label="Signed in as pat"]') as HTMLElement), 'Sign out'));
		await settle();
		expect(savedToken()).toBeNull();
		expect(button('Sign in to comment')).toBeTruthy();
	});
});

describe('commenting on the page', () => {
	beforeEach(() => saveToken('good-token'));

	it('picks an element in the prototype, writes the comment in the box, and puts it on the version’s thread with its pin', async () => {
		const { doc } = await open();
		await press(button('Comment'));
		await settle();
		await press(doc.querySelector('[data-e2e-ref="clear-filter-button"]') as Element);
		await settle();
		await typeInto(document.querySelector('#comment-draft') as HTMLTextAreaElement, 'Make this primary');
		await press(button('Save'));
		await settle();

		// The thread is the version's, found and made as the app does it.
		expect(gh.issues).toHaveLength(1);
		expect(gh.issues[0]?.body).toContain('branch: `prototype/demo/v1`');
		expect(gh.issues[0]?.labels).toEqual(['flock-designer:review']);
		expect(gh.issues[0]?.comments[0]?.body).toContain('Make this primary');
		expect(gh.issues[0]?.comments[0]?.body).toContain('clear-filter-button');
		// It says which page it was placed on, by the page's fingerprint, so it can say later when the page has changed.
		expect(gh.issues[0]?.comments[0]?.body).toContain('"page":"aaaaaaaaaaaa"');

		// The numbered pin in the prototype, and the card in the side panel.
		// The pin carries who made it (here with no picture, so their first letter), and the card too, as the person, not a number.
		expect(doc.querySelector('[data-fd-layer="pins"]')?.textContent).toContain('P');
		expect(button(/^Show all comments/).textContent).toBe('1');
		await press(button(/^Show all comments/));
		await settle();
		expect(cards().map((c) => c.textContent)).toEqual([expect.stringContaining('Make this primary')]);
	});

	it('says on a card when the page has changed since it was written, and nothing for one on this page or from before', async () => {
		const placed = (id: number, text: string, page?: string) => ({
			id,
			body: composeBody(text, anAnchor({ route: '/demo/v1/', selector: 'h1', nearbyText: 'Alert history', ...(page ? { page } : {}) })),
			user: { login: 'pm' },
			created_at: `2026-10-08T09:0${id}:00Z`,
		});
		gh.issues.push({
			number: 1,
			body: 'Review thread for **demo**, branch: `prototype/demo/v1`.',
			labels: ['flock-designer:review'],
			comments: [placed(1, 'On an earlier page', 'bbbbbbbbbbbb'), placed(2, 'On this page', 'aaaaaaaaaaaa'), placed(3, 'From before')],
		});
		await open();
		await settle();
		await press(button(/^Show all comments/));
		await settle();
		const said = (text: string) => cards().find((c) => c.textContent?.includes(text))?.textContent ?? '';
		expect(said('On an earlier page')).toContain('The page has changed since this was written.');
		expect(said('On this page')).not.toContain('has changed since');
		expect(said('From before')).not.toContain('has changed since');
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

	it('shows the comments made in the app, on the same version, pinned where they were made', async () => {
		const made = await open();
		await unmountAll((current as NonNullable<typeof current>).root);
		gh.issues.push({
			number: 1,
			body: 'Review thread for **demo**, branch: `prototype/demo/v1`.',
			labels: ['flock-designer:review'],
			comments: [
				{
					id: 7,
					// As the app writes it, at its own server's address for this prototype.
					body: composeBody(
						'From the app',
						anAnchor({ route: '/demo/v1/', selector: '[data-e2e-ref="clear-filter-button"]', nearbyText: 'Clear Filter' }),
					),
					user: { login: 'noah', avatar_url: 'https://avatars.githubusercontent.com/u/9?v=4' },
					created_at: '2026-10-08T09:00:00Z',
				},
			],
		});
		void made;
		const { doc } = await open();
		await settle();
		// Pinned where it was made, carrying the person: their picture from the host, over their first letter.
		const pin = doc.querySelector('[data-fd-layer="pins"]');
		expect(pin?.querySelector('img')?.getAttribute('src')).toBe('https://avatars.githubusercontent.com/u/9?v=4');
		expect(pin?.textContent).toContain('N');
		// And its card in the panel starts with them, not a number.
		await press(button(/^Show all comments/));
		await settle();
		expect(cards()[0]?.querySelector('[data-slot="avatar"]')?.getAttribute('title')).toBe('noah');
		// The extra small, the size of the picture on its pin.
		expect(cards()[0]?.querySelector('[data-slot="avatar"]')?.getAttribute('data-size')).toBe('xs');
		expect(cards()[0]?.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe('N');
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

	it('puts a comment on the version’s thread through DSNR, and has no Sign out of its own', async () => {
		const { relay, asked } = tab();
		const { doc } = await open(relay);
		await settle();
		await commentOnPage(doc, 'h1', 'Bigger');
		expect(asked.filter(([name]) => name === 'postComment').map(([, args]) => args.slice(0, 3))).toEqual([['demo', 'prototype/demo/v1', 'Bigger']]);
		expect(gh.issues[0]?.comments[0]?.body).toContain('Bigger');
		await press(button(/^Show all comments/));
		await settle();
		expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Sign out')).toBe(false);
	});

	it('offers Address on an open comment, which asks DSNR to address it, on the version this page is', async () => {
		const { relay, asked } = tab();
		const { doc } = await open(relay);
		await settle();
		await commentOnPage(doc, 'h1', 'Bigger');
		await press(button(/^Show all comments/));
		await settle();
		await press(menuItem(await openMenu(button('Comment actions')), 'Address'));
		await settle();
		const comment = gh.issues[0]!.comments[0]!;
		expect(asked.at(-1)).toEqual(['address', [{ thread: gh.issues[0]!.number, id: comment.id }, 'prototype/demo/v1']]);
	});

	it('is told which version Address shows its change in, for a page in the browser to go to (BROWSER_COMMENTS_PLAN 3.2)', async () => {
		const { relay } = tab();
		const addressed = vi.fn();
		const answering: Relay = { ask: (name, args) => (name === 'address' ? Promise.resolve({ ok: true, value: 'v4' }) : relay.ask(name, args)) };
		const page = sitePage();
		current = await render(createElement(Viewer, { config: CONFIG, slots: page.slots, relay: answering, onAddressed: addressed }));
		await settle();
		await commentOnPage(page.doc, 'h1', 'Bigger');
		await press(button(/^Show all comments/));
		await settle();
		await press(menuItem(await openMenu(button('Comment actions')), 'Address'));
		await settle();
		expect(addressed).toHaveBeenCalledWith('v4');
	});
});
