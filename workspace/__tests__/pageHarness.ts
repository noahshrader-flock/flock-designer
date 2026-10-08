import { vi } from 'vitest';

/**
 * The published page, for tests: GitHub as its API answers for comments, and the page the site builds, as far as the
 * viewer is concerned. Shared by the viewer's tests and the round trip, so both run against the same GitHub.
 */

/** Which iteration the page is, as the site writes it into the page. */
export const PAGE_CONFIG = {
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

/**
 * GitHub's API, as far as comments go: review threads found by label and branch line, and their comments. Each token
 * is someone: the page's tester, and the app's own sign-in, so a round trip has two people in it.
 */
export const TOKENS: Record<string, string> = { 'good-token': 'pat', 'app-token': 'noah' };
export const fakeGitHub = () => {
	const issues: { number: number; body: string; labels: string[]; comments: { id: number; body: string; user: { login: string }; created_at: string }[] }[] = [];
	let nextId = 100;
	const calls: string[] = [];
	const json = (status: number, body: unknown) => ({ status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
	const fetch = vi.fn(async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
		const method = init.method ?? 'GET';
		const path = url.replace('https://api.github.com', '').split('?')[0] as string;
		calls.push(`${method} ${path}`);
		const login = TOKENS[(init.headers?.Authorization ?? '').replace(/^Bearer /, '')];
		if (!login) return json(401, { message: 'Bad credentials' });
		if (path === '/user') return json(200, { login });
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
			const made = { id: nextId++, body: JSON.parse(init.body ?? '{}').body, user: { login }, created_at: `2026-10-08T10:00:${String(nextId % 60).padStart(2, '0')}Z` };
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
export const sitePage = () => {
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
