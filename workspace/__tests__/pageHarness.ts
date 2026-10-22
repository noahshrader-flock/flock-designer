import PAGE_AGENT from '../src/page/agentMain?page';
import { vi } from 'vitest';
import { button, fieldNamed, press, settle, type } from './ui';

/** Shared by the viewer's tests and the round trip, so both run against the same GitHub. */

export const PAGE_SIGN_IN = {
	clientId: 'Iv-test',
	exchange: 'https://dsnr-auth.vercel.app/api/exchange',
	redirect: 'https://acme.github.io/design/',
	authorize: 'https://github.com/login/oauth/authorize',
};
export const PAGE_CONFIG = {
	owner: 'acme',
	repo: 'design',
	prototypeId: 'demo',
	name: 'v1',
	title: 'Alert history',
	prototypeHref: '../',
	prototypesHref: '../../',
	versions: [
		{ name: 'v3', href: '../v3/' },
		{ name: 'v1', href: '../v1/' },
		{ name: 'v2', href: '../v2/' },
	],
	page: 'aaaaaaaaaaaa',
};

/** Each token is someone: the page's tester, and the app's own sign-in, so a round trip has two people in it. */
export const TOKENS: Record<string, string> = { 'good-token': 'pat', 'app-token': 'noah' };
const PEOPLE: Record<string, { name: string; avatar_url: string }> = {
	pat: { name: 'Pat Brennan', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
};
/** GitHub's REST API as the page reaches it, through `fetch` (the core's fake is `fakes/github.ts`). */
export const fakeGitHubFetch = () => {
	const issues: {
		number: number;
		body: string;
		labels: string[];
		comments: { id: number; body: string; user: { login: string; avatar_url?: string }; created_at: string }[];
	}[] = [];
	let nextId = 100;
	const calls: string[] = [];
	const json = (status: number, body: unknown) => ({
		status,
		headers: { get: () => null },
		json: async () => body,
		text: async () => JSON.stringify(body),
	});
	const fetch = vi.fn(async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
		const method = init.method ?? 'GET';
		const path = url.replace('https://api.github.com', '').split('?')[0] as string;
		calls.push(`${method} ${path}`);
		const login = TOKENS[(init.headers?.Authorization ?? '').replace(/^Bearer /, '')];
		if (!login) return json(401, { message: 'Bad credentials' });
		if (path === '/user') return json(200, { login, ...PEOPLE[login] });
		if (path === '/repos/acme/design/issues' && method === 'GET') {
			return json(
				200,
				issues.map((i) => ({ number: i.number, body: i.body, comments: i.comments.length, labels: i.labels.map((name) => ({ name })) })),
			);
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
			const made = {
				id: nextId++,
				body: JSON.parse(init.body ?? '{}').body,
				user: { login },
				created_at: `2026-10-08T10:00:${String(nextId % 60).padStart(2, '0')}Z`,
			};
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

export const prototypeIn = (frame: HTMLIFrameElement, { agent = true }: { agent?: boolean } = {}): Document => {
	const doc = frame.contentDocument as Document;
	doc.body.innerHTML = '<main><h1>Alert history</h1><button data-e2e-ref="clear-filter-button">Clear Filter</button></main>';
	const fw = frame.contentWindow as unknown as Window & { Element: { prototype: Record<string, unknown> }; eval(code: string): unknown };
	fw.Element.prototype.scrollIntoView = () => undefined;
	fw.Element.prototype.animate = () => undefined;
	wireMessages(fw);
	// A page built before there was a page agent has none.
	if (agent) fw.eval(PAGE_AGENT);
	return doc;
};

/**
 * jsdom's `postMessage` says neither who sent a message nor from where, which the bar and the page's agent both check;
 * here each says it, as a real browser does (the real-Chrome test proves it).
 */
const wireMessages = (fw: Window) => {
	const origin = window.location.origin;
	const fire = (to: Window, data: unknown, source: unknown) =>
		void setTimeout(() => to.dispatchEvent(Object.assign(new Event('message'), { data, source, origin })), 0);
	// jsdom's frame has one parent object for every frame, so each frame is given its own: what it sends goes to this
	// page from it, and what this page sends it comes from that parent.
	const parent = { postMessage: (data: unknown) => fire(window, data, fw) };
	Object.defineProperty(fw, 'parent', { value: parent, configurable: true });
	fw.postMessage = ((data: unknown) => fire(fw, data, parent)) as Window['postMessage'];
};

export const sitePage = (built: { agent?: boolean } = {}) => {
	document.body.innerHTML = '<header id="dsnr-bar"></header><div><iframe id="dsnr-frame"></iframe><aside id="dsnr-panel"></aside></div>';
	const frame = document.getElementById('dsnr-frame') as HTMLIFrameElement;
	const doc = prototypeIn(frame, built);
	return {
		frame,
		doc,
		slots: { bar: document.getElementById('dsnr-bar') as HTMLElement, panel: document.getElementById('dsnr-panel') as HTMLElement, frame },
	};
};

export const commentOnPage = async (doc: Document, selector: string, words: string) => {
	await press(button('Comment'));
	await settle();
	await press(doc.querySelector(selector) as Element);
	await settle();
	await type(fieldNamed('Comment'), words);
	await press(button('Save'));
	await settle();
	// Comment mode carries on, waiting for the next click: the reviewer is done.
	await press(button('Comment'));
	await settle();
};
