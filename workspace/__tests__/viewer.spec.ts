// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeBody } from '../src/shared/anchor';
import { Viewer } from '../src/viewer/Viewer';
import { button, cards, menuItem, openMenu, press, render, settle, typeInto, unmountAll } from './reviewHarness';

/**
 * Commenting on a prototype's published page (M7 of the Pages plan): the viewer, drawn into the page the site builds,
 * against a GitHub that answers as its API does, with the real pick and pin scripts running in the prototype's frame.
 */

const CONFIG = {
	owner: 'acme',
	repo: 'design',
	projectId: 'demo',
	name: 'v1-i1',
	title: 'Alert history',
	projectHref: '../../',
	iterations: [
		{ name: 'v1-i2', href: '../../v1/i2/' },
		{ name: 'v1-i1', href: '../../v1/i1/' },
		{ name: 'v2-i1', href: '../../v2/i1/' },
	],
};
const TOKEN_KEY = 'flock-designer.github-token';

/** GitHub's API, as far as comments go: review threads found by label and branch line, and their comments. */
const fakeGitHub = () => {
	const issues: { number: number; body: string; labels: string[]; comments: { id: number; body: string; user: { login: string }; created_at: string }[] }[] = [];
	let nextId = 100;
	const calls: string[] = [];
	const json = (status: number, body: unknown) => ({ status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
	const fetch = vi.fn(async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
		const method = init.method ?? 'GET';
		const path = url.replace('https://api.github.com', '').split('?')[0] as string;
		calls.push(`${method} ${path}`);
		if (init.headers?.Authorization !== 'Bearer good-token') return json(401, { message: 'Bad credentials' });
		if (path === '/user') return json(200, { login: 'pat' });
		if (path === '/repos/acme/design/issues' && method === 'GET') {
			return json(200, issues.map((i) => ({ number: i.number, body: i.body, comments: i.comments.length, labels: i.labels.map((name) => ({ name })) })));
		}
		if (path === '/repos/acme/design/issues' && method === 'POST') {
			const { body, labels } = JSON.parse(init.body ?? '{}');
			issues.push({ number: issues.length + 1, body, labels, comments: [] });
			return json(201, { number: issues.length });
		}
		const thread = /^\/repos\/acme\/design\/issues\/(\d+)\/comments$/.exec(path);
		if (thread) {
			const issue = issues.find((i) => i.number === Number(thread[1]));
			if (!issue) return json(404, { message: 'Not Found' });
			if (method === 'GET') return json(200, issue.comments);
			const made = { id: nextId++, body: JSON.parse(init.body ?? '{}').body, user: { login: 'pat' }, created_at: '2026-10-08T10:00:00Z' };
			issue.comments.push(made);
			return json(201, made);
		}
		const one = /^\/repos\/acme\/design\/issues\/comments\/(\d+)$/.exec(path);
		if (one) {
			const owner = issues.find((i) => i.comments.some((c) => c.id === Number(one[1])));
			const c = owner?.comments.find((x) => x.id === Number(one[1]));
			if (!owner || !c) return json(404, { message: 'Not Found' });
			if (method === 'PATCH') c.body = JSON.parse(init.body ?? '{}').body;
			if (method === 'DELETE') {
				owner.comments = owner.comments.filter((x) => x !== c);
				return json(204, null);
			}
			return json(200, c);
		}
		return json(404, { message: `not faked: ${method} ${path}` });
	});
	return { fetch, issues, calls };
};

/** The page the site builds, as far as the viewer is concerned: the bar's slot, the panel, and the prototype's frame. */
const sitePage = () => {
	document.body.innerHTML = '<header id="flkd-bar"></header><div><iframe id="flkd-frame"></iframe><aside id="flkd-panel"></aside></div>';
	const frame = document.getElementById('flkd-frame') as HTMLIFrameElement;
	const doc = frame.contentDocument as Document;
	doc.body.innerHTML = '<main><h1>Alert history</h1><button data-e2e-ref="clear-filter-button">Clear Filter</button></main>';
	const fw = frame.contentWindow as unknown as Record<string, unknown>;
	(fw.Element as { prototype: Record<string, unknown> }).prototype.scrollIntoView = () => undefined;
	(fw.Element as { prototype: Record<string, unknown> }).prototype.animate = () => undefined;
	return {
		frame,
		doc,
		slots: { bar: document.getElementById('flkd-bar') as HTMLElement, panel: document.getElementById('flkd-panel') as HTMLElement, frame },
	};
};

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
	it("is the app's own: the way back, the project, and the iteration switcher with its versions", async () => {
		await open();
		expect(document.querySelector('a[href="../../"]')).not.toBeNull();
		expect(document.body.textContent).toContain('Alert history');
		await openMenu(button('Iteration V1 · I1: switch iteration'));
		// The same menu the app has: versions as headings, iterations under them, this one chosen.
		const options = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
		expect(options.map((i) => i.textContent?.trim())).toEqual(['I2', 'I1', 'I1']);
		expect(document.body.textContent).toMatch(/V1[\s\S]*V2/);
		expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
	});

	it('is there before anyone signs in, beside the way to', async () => {
		await open();
		expect(button('Sign in to comment')).toBeTruthy();
		expect(button('Iteration V1 · I1: switch iteration')).toBeTruthy();
	});
});

describe('signing in, for testing', () => {
	it('asks for a token, checks it can read the repository, and keeps it in this browser', async () => {
		await open();
		await press(button('Sign in to comment'));
		await settle();
		expect(document.body.textContent).toContain('Issues: read and write');
		expect(document.body.textContent).toContain('kept in this browser only');
		await typeInto(document.querySelector('input[aria-label="GitHub token"]') as HTMLInputElement, 'good-token');
		await press(button('Sign in'));
		await settle();
		expect(localStorage.getItem(TOKEN_KEY)).toBe('good-token');
		expect(button('Comment')).toBeTruthy();
	});

	it('says why a token is refused, and keeps nothing', async () => {
		await open();
		await press(button('Sign in to comment'));
		await settle();
		await typeInto(document.querySelector('input[aria-label="GitHub token"]') as HTMLInputElement, 'bad');
		await press(button('Sign in'));
		await settle();
		expect(document.body.textContent).toMatch(/Sign in to GitHub again|Bad credentials/);
		expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
	});

	it('forgets the token on signing out', async () => {
		localStorage.setItem(TOKEN_KEY, 'good-token');
		await open();
		await press(button('Show all comments'));
		await settle();
		await press(button('Sign out'));
		await settle();
		expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
		expect(button('Sign in to comment')).toBeTruthy();
	});
});

describe('commenting on the page', () => {
	beforeEach(() => localStorage.setItem(TOKEN_KEY, 'good-token'));

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
		await press(button('Comment'));
		await settle();
		await press(doc.querySelector('h1') as Element);
		await settle();
		await typeInto(document.querySelector('#comment-draft') as HTMLTextAreaElement, 'Bigger');
		await press(button('Save'));
		await settle();
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
