import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PUBLISH_WORKFLOW, pageStatus, publish, readVisibility, whyPublic } from '../src/main/services/pages';

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
		pushRecords,
		fetchAnonymously: anonymous,
		sleep: async () => undefined,
		log: (l) => log.push(l),
		...more,
	});
	return { done, log, pushRecords, anonymous };
};

describe('where the page is going', () => {
	it('reads whether the repository and its site are private', async () => {
		expect(await readVisibility({ api: fakeGitHub().api }, REF)).toMatchObject({ repoPrivate: true, site: { url: SITE, public: false } });
		expect(await readVisibility({ api: fakeGitHub({ pages: false }).api }, REF)).toMatchObject({ repoPrivate: true, site: null });
	});

	it('says why anyone could open the site, or nothing when GitHub says it is private', () => {
		expect(whyPublic({ repoPrivate: true, defaultBranch: 'main', site: { url: SITE, public: false } })).toBeNull();
		expect(whyPublic({ repoPrivate: false, defaultBranch: 'main', site: { url: SITE, public: true } })).toMatch(/repository is public/);
		expect(whyPublic({ repoPrivate: true, defaultBranch: 'main', site: { url: SITE, public: true } })).toMatch(/site is public/);
	});
});

describe('publishing', () => {
	it('pushes the records, asks for the deploy, waits for it, and gives the link to the iteration', async () => {
		const gh = fakeGitHub();
		const { done, pushRecords, anonymous } = run(gh);
		expect(await done).toEqual({ url: `${SITE}demo/v1/i2/`, public: false });
		expect(pushRecords).toHaveBeenCalledOnce();
		const dispatch = gh.calls.find((c) => c.method === 'POST');
		expect(dispatch).toMatchObject({ path: `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, body: { ref: 'main' } });
		expect(anonymous).toHaveBeenCalledWith(`${SITE}demo/v1/i2/`);
	});

	it('goes ahead while the repository is public, and says so in its note', async () => {
		const gh = fakeGitHub({ repoPrivate: false, sitePublic: true });
		const { done, log, pushRecords } = run(gh, { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toEqual({ url: `${SITE}demo/v1/i2/`, public: true });
		expect(pushRecords).toHaveBeenCalledOnce();
		expect(log.join('\n')).toMatch(/Note that the repository is public, so anyone with the link can open this page/);
		expect(log.join('\n')).not.toMatch(/PUBLIC TEST/);
	});

	it('has nowhere to go without a Pages site, and pushes nothing', async () => {
		const gh = fakeGitHub({ pages: false });
		const { done, pushRecords } = run(gh);
		await expect(done).rejects.toThrow(/no GitHub Pages site[\s\S]*No link/);
		expect(pushRecords).not.toHaveBeenCalled();
		expect(gh.calls.some((c) => c.method === 'POST')).toBe(false);
	});

	it('says plainly when a page it was told is private opens for anyone, and not to share it', async () => {
		const { done, log } = run(fakeGitHub(), { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toMatchObject({ public: true });
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

	it('asks where it is going before anything about this machine, and refuses a clone on no branch after it', async () => {
		await expect(run(fakeGitHub({ pages: false }), { recordsBranch: '' }).done).rejects.toThrow(/no GitHub Pages site/);
		const { done, pushRecords } = run(fakeGitHub(), { recordsBranch: '' });
		await expect(done).rejects.toThrow(/not on a branch/);
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

	it('takes no options, and builds the site from the repository as it is', () => {
		expect(workflow).not.toMatch(/inputs:/);
		expect(workflow).toContain('build-site --out _site');
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
		expect(await status(site())).toEqual({ state: 'published', url: `${SITE}demo/v1/i2/?v=ddddddd` });
		// The one still deploying is not counted: it may yet fail.
	});

	it('is not published yet when its page changed after the last deploy, or was never pushed', async () => {
		expect(await status(site({ compare: 'behind' }))).toEqual({ state: 'unpublished' });
		expect(await status(site({ changed: null }))).toEqual({ state: 'unpublished' });
		expect(await status(site({ deployments: false }))).toEqual({ state: 'unpublished' });
	});

	it('has nothing to say without a site, or for something that is not a prototype', async () => {
		const none = { api: vi.fn(async (path: string) => (path === '/repos/acme/design' ? { private: true } : Promise.reject(Object.assign(new Error('Not Found'), { status: 404 })))) };
		expect(await pageStatus(none, REF, 'demo', 'v1-i2')).toEqual({ state: 'none' });
		expect(await pageStatus(site(), REF, 'demo', 'codebase')).toEqual({ state: 'none' });
	});
});
