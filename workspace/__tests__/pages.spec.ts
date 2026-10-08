import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_TEST_PHRASE, PUBLISH_WORKFLOW, pageStatus, passGate, publish, readVisibility } from '../src/main/services/pages';

/**
 * Publishing a prototype to its page (M5b of the Pages plan), against a fake GitHub. What matters most is what it will
 * not do: hand out a link to a site anyone can open, unless the person said in so many words that this is a test.
 */

const REF = { owner: 'acme', repo: 'design' };
const SITE = 'https://acme.github.io/design/';

/** GitHub as its API answers. Runs appear one poll after the dispatch, and finish on the next. */
const fakeGitHub = ({ repoPrivate = true, sitePublic = false, pages = true, conclusion = 'success', workflow = true } = {}) => {
	const calls: { path: string; method: string; body?: unknown }[] = [];
	const runs: { id: number; status: string; conclusion: string | null; html_url: string }[] = [{ id: 1, status: 'completed', conclusion: 'success', html_url: 'run/1' }];
	let polls = 0;
	const api = vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
		calls.push({ path, method: init.method ?? 'GET', body: init.body });
		if (path === '/repos/acme/design') return { private: repoPrivate, visibility: repoPrivate ? 'private' : 'public', default_branch: 'main' };
		if (path === '/repos/acme/design/pages') {
			if (!pages) throw Object.assign(new Error('Not Found'), { status: 404 });
			return { html_url: SITE, public: sitePublic, build_type: 'workflow' };
		}
		if (path === `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`) {
			if (!workflow) throw Object.assign(new Error('Not Found'), { status: 404 });
			runs.unshift({ id: 2, status: 'queued', conclusion: null, html_url: 'run/2' });
			return null;
		}
		if (path.startsWith(`/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/runs`)) {
			polls++;
			const fresh = runs.find((r) => r.id === 2);
			if (fresh && polls > 2) Object.assign(fresh, { status: 'completed', conclusion });
			return { workflow_runs: runs };
		}
		throw new Error(`not faked: ${init.method ?? 'GET'} ${path}`);
	});
	return { api, calls };
};

const run = (gh: ReturnType<typeof fakeGitHub>, more: Partial<Parameters<typeof publish>[0]> = {}) => {
	const log: string[] = [];
	const anonymous = vi.fn(async () => ({ status: 302 }));
	const pushRecords = vi.fn(async () => ({ published: ['demo'], problems: [] }));
	const done = publish({
		github: { api: gh.api },
		ref: REF,
		recordsBranch: 'main',
		projectId: 'demo',
		name: 'v1-i2',
		publicTest: false,
		pushRecords,
		fetchAnonymously: anonymous,
		sleep: async () => undefined,
		log: (l) => log.push(l),
		...more,
	});
	return { done, log, pushRecords, anonymous };
};

describe('the private gate', () => {
	it('reads whether the repository and its site are private', async () => {
		expect(await readVisibility({ api: fakeGitHub().api }, REF)).toMatchObject({ repoPrivate: true, site: { url: SITE, public: false } });
		expect(await readVisibility({ api: fakeGitHub({ pages: false }).api }, REF)).toMatchObject({ repoPrivate: true, site: null });
	});

	it('lets a private repository with a private site through', () => {
		expect(passGate({ repoPrivate: true, site: { url: SITE, public: false } }, false)).toEqual({ ok: true, url: SITE, publicTest: false });
	});

	it('stops when the repository or the site is public, and says which', () => {
		const repo = passGate({ repoPrivate: false, site: { url: SITE, public: true } }, false);
		expect(repo).toMatchObject({ ok: false });
		expect((repo as { why: string }).why).toMatch(/repository is public/);
		const site = passGate({ repoPrivate: true, site: { url: SITE, public: true } }, false);
		expect((site as { why: string }).why).toMatch(/site is public/);
	});

	it('lets a public one through only as a public test, said so', () => {
		expect(passGate({ repoPrivate: false, site: { url: SITE, public: true } }, true)).toEqual({ ok: true, url: SITE, publicTest: true });
		// A private site passed the option is not a public test: no banner.
		expect(passGate({ repoPrivate: true, site: { url: SITE, public: false } }, true)).toEqual({ ok: true, url: SITE, publicTest: false });
	});

	it('stops when there is no site at all', () => {
		expect((passGate({ repoPrivate: true, site: null }, false) as { why: string }).why).toMatch(/no GitHub Pages site/);
	});

	it('is passed a public test only by typing the phrase', () => {
		expect(PUBLIC_TEST_PHRASE.split(' ').length).toBeGreaterThan(2);
	});
});

describe('publishing', () => {
	it('pushes the records, asks for the deploy, waits for it, and gives the link to the iteration', async () => {
		const gh = fakeGitHub();
		const { done, pushRecords, anonymous } = run(gh);
		expect(await done).toEqual({ url: `${SITE}demo/v1/i2/`, public: false, publicTest: false });
		expect(pushRecords).toHaveBeenCalledOnce();
		const dispatch = gh.calls.find((c) => c.method === 'POST');
		expect(dispatch).toMatchObject({ path: `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, body: { ref: 'main', inputs: { public_test: 'false' } } });
		expect(anonymous).toHaveBeenCalledWith(`${SITE}demo/v1/i2/`);
	});

	it('pushes and deploys nothing, and gives no link, when the gate stops it', async () => {
		const gh = fakeGitHub({ repoPrivate: false, sitePublic: true });
		const { done, pushRecords } = run(gh);
		await expect(done).rejects.toThrow(/public[\s\S]*No link/);
		expect(pushRecords).not.toHaveBeenCalled();
		expect(gh.calls.some((c) => c.method === 'POST')).toBe(false);
	});

	it('as a public test, deploys with the banner and says the page is public', async () => {
		const gh = fakeGitHub({ repoPrivate: false, sitePublic: true });
		const { done, log } = run(gh, { publicTest: true, fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toMatchObject({ public: true, publicTest: true });
		expect(gh.calls.find((c) => c.method === 'POST')?.body).toMatchObject({ inputs: { public_test: 'true' } });
		expect(log.join('\n')).toMatch(/PUBLIC TEST[\s\S]*anyone/);
	});

	it('says plainly when a page it was told is private opens for anyone, and not to share it', async () => {
		const { done, log } = run(fakeGitHub(), { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toMatchObject({ public: true, publicTest: false });
		expect(log.join('\n')).toMatch(/opens for anyone[\s\S]*Do not share/);
	});

	it('stops before deploying when the records cannot be pushed, and says why', async () => {
		const gh = fakeGitHub();
		const { done } = run(gh, { pushRecords: async () => ({ published: [], problems: [{ what: 'Project records', why: '2 changes outside the project records are waiting' }] }) });
		await expect(done).rejects.toThrow(/outside the project records/);
		expect(gh.calls.some((c) => c.method === 'POST')).toBe(false);
	});

	it('says where to look when the deploy fails', async () => {
		const { done } = run(fakeGitHub({ conclusion: 'failure' }));
		await expect(done).rejects.toThrow(/did not finish[\s\S]*run\/2/);
	});

	it('says the workflow is missing when GitHub has none to run', async () => {
		const { done } = run(fakeGitHub({ workflow: false }));
		await expect(done).rejects.toThrow(new RegExp(`${PUBLISH_WORKFLOW}[\\s\\S]*not on GitHub`));
	});

	it('refuses records on a branch the site is not built from, before pushing them', async () => {
		const gh = fakeGitHub();
		const { done, pushRecords } = run(gh, { recordsBranch: 'noah/elsewhere' });
		await expect(done).rejects.toThrow(/built from main[\s\S]*noah\/elsewhere/);
		expect(pushRecords).not.toHaveBeenCalled();
	});

	it('refuses a name that is not a prototype', async () => {
		const { done } = run(fakeGitHub(), { name: 'codebase' });
		await expect(done).rejects.toThrow(/not a prototype/);
	});
});

describe('the workflow that deploys the site', () => {
	const workflow = readFileSync(join(__dirname, '..', '..', '.github', 'workflows', PUBLISH_WORKFLOW), 'utf8');

	it('runs only when asked, never on a push', () => {
		expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:/m);
		expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
	});

	it('checks for itself that the site is private, and takes a public test only as the phrase', () => {
		expect(workflow).toContain('build-site --out _site --gate');
		expect(workflow).toContain(`--public-test "${PUBLIC_TEST_PHRASE}"`);
	});

	it('never cancels a publish that is waiting', () => {
		expect(workflow).toContain('cancel-in-progress: false');
	});
});

describe('whether an iteration is on its page', () => {
	/** GitHub with a site deployed from `deployed`, and the page last changed in `changed`. */
	const site = ({ deployed = 'd'.repeat(40), changed = 'c'.repeat(40) as string | null, compare = 'ahead', repoPrivate = true, deployments = true } = {}) => ({
		api: vi.fn(async (path: string) => {
			if (path === '/repos/acme/design') return { private: repoPrivate, default_branch: 'main' };
			if (path === '/repos/acme/design/pages') return { html_url: SITE, public: !repoPrivate };
			if (path.startsWith('/repos/acme/design/deployments?')) return deployments ? [{ id: 7, sha: 'f'.repeat(40) }, { id: 6, sha: deployed }] : [];
			if (path === '/repos/acme/design/deployments/7/statuses?per_page=1') return [{ state: 'in_progress' }];
			if (path === '/repos/acme/design/deployments/6/statuses?per_page=1') return [{ state: 'success' }];
			if (path.startsWith('/repos/acme/design/commits?')) {
				expect(path).toContain('path=projects%2Fdemo%2Fprototypes%2Fv1-i2.html');
				expect(path).toContain('sha=main');
				return changed ? [{ sha: changed }] : [];
			}
			if (path.startsWith('/repos/acme/design/compare/')) return { status: compare };
			throw new Error(`not faked: ${path}`);
		}),
	});
	const status = (gh: { api: ReturnType<typeof vi.fn> }) => pageStatus(gh, REF, 'demo', 'v1-i2');

	it('is published when the last deploy includes the last change to its page, with a link that names that deploy', async () => {
		expect(await status(site())).toEqual({ state: 'published', url: `${SITE}demo/v1/i2/?v=ddddddd`, public: false });
		// The one still deploying is not counted: it may yet fail.
	});

	it('is not published yet when its page changed after the last deploy, or was never pushed', async () => {
		expect(await status(site({ compare: 'behind' }))).toEqual({ state: 'unpublished' });
		expect(await status(site({ changed: null }))).toEqual({ state: 'unpublished' });
		expect(await status(site({ deployments: false }))).toEqual({ state: 'unpublished' });
	});

	it('says when the site is public', async () => {
		expect(await status(site({ repoPrivate: false }))).toMatchObject({ state: 'published', public: true });
	});

	it('has nothing to say without a site, or for something that is not a prototype', async () => {
		const none = { api: vi.fn(async (path: string) => (path === '/repos/acme/design' ? { private: true } : Promise.reject(Object.assign(new Error('Not Found'), { status: 404 })))) };
		expect(await pageStatus(none, REF, 'demo', 'v1-i2')).toEqual({ state: 'none' });
		expect(await pageStatus(site(), REF, 'demo', 'codebase')).toEqual({ state: 'none' });
	});
});
