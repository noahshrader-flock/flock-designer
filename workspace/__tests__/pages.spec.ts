import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PUBLISH_WORKFLOW, pageStatus, publish, readVisibility, redeploySite, siteBehind, unpublish, whyPublic } from '../src/main/services/pages';

/**
 * Publishing a prototype to its page (M5b of the Pages plan), against a fake GitHub. What matters most is what it will
 * not do: hand out a link to a site anyone can open, unless the person said in so many words that this is a test.
 */

const REF = { owner: 'acme', repo: 'design' };
const SITE = 'https://acme.github.io/design/';

/** GitHub as its API answers. Runs appear one poll after the dispatch, and finish on the next. */
const fakeGitHub = ({ repoPrivate = true, sitePublic = false, pages = true, conclusion = 'success', workflow = true, onSite = true as boolean | 'no-deploy' } = {}) => {
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
		// What the site was last built from, and whether this page was in it.
		if (path.startsWith('/repos/acme/design/deployments?')) return onSite === 'no-deploy' ? [] : [{ id: 6, sha: 'd'.repeat(40) }];
		if (path === '/repos/acme/design/deployments/6/statuses?per_page=1') return [{ state: 'success' }];
		if (path.startsWith('/repos/acme/design/commits?')) return onSite === true ? [{ sha: 'c'.repeat(40) }] : [];
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
		expect(await done).toEqual({ url: `${SITE}demo/v1/i2/`, public: false, first: false });
		expect(pushRecords).toHaveBeenCalledOnce();
		const dispatch = gh.calls.find((c) => c.method === 'POST');
		expect(dispatch).toMatchObject({ path: `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, body: { ref: 'main' } });
		expect(anonymous).toHaveBeenCalledWith(`${SITE}demo/v1/i2/`);
	});

	it('says whether this is the first time the page goes up: not on the last deploy, or no deploy yet', async () => {
		expect(await run(fakeGitHub()).done).toMatchObject({ first: false });
		expect(await run(fakeGitHub({ onSite: false })).done).toMatchObject({ first: true });
		expect(await run(fakeGitHub({ onSite: 'no-deploy' })).done).toMatchObject({ first: true });
		// Asked of the last deploy, with the commits that touched this page.
		const gh = fakeGitHub({ onSite: false });
		await run(gh).done;
		expect(gh.calls.map((c) => c.path).find((p) => p.startsWith('/repos/acme/design/commits?'))).toContain(`sha=${'d'.repeat(40)}&path=projects%2Fdemo%2Fprototypes%2Fv1-i2.html`);
	});

	it('does not count it as the first time when it cannot tell, so nothing opens by mistake', async () => {
		const gh = fakeGitHub();
		const unsure = { api: vi.fn(async (path: string, init?: never) => (path.startsWith('/repos/acme/design/deployments?') ? Promise.reject(new Error('Forbidden')) : gh.api(path, init))) };
		expect(await run(gh, { github: unsure }).done).toMatchObject({ first: false });
	});

	it('goes ahead while the repository is public, and says so in its note', async () => {
		const gh = fakeGitHub({ repoPrivate: false, sitePublic: true });
		const { done, log, pushRecords } = run(gh, { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toEqual({ url: `${SITE}demo/v1/i2/`, public: true, first: false });
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

describe('unpublishing', () => {
	const take = (gh: ReturnType<typeof fakeGitHub>, more: Partial<Parameters<typeof unpublish>[0]> = {}) => {
		const order: string[] = [];
		const log: string[] = [];
		const done = unpublish({
			github: { api: gh.api },
			ref: REF,
			recordsBranch: 'main',
			projectId: 'demo',
			name: 'v1-i2',
			removePage: async () => void order.push('removed'),
			pushRecords: async () => (order.push('pushed'), { published: ['demo'], problems: [] }),
			fetchAnonymously: async () => ({ status: 404 }),
			sleep: async () => undefined,
			log: (l) => log.push(l),
			...more,
		});
		return { done, order, log };
	};

	it('removes the page, pushes that, deploys the site without it, and checks it is gone', async () => {
		const gh = fakeGitHub({ repoPrivate: false, sitePublic: true });
		const { done, order, log } = take(gh);
		expect(await done).toEqual({ url: `${SITE}demo/v1/i2/`, gone: true });
		expect(order).toEqual(['removed', 'pushed']);
		expect(gh.calls.find((c) => c.method === 'POST')?.path).toBe(`/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`);
		expect(log.join('\n')).toMatch(/Taken off the site[\s\S]*record and comments are kept/);
	});

	it('says to ask for Pages to be switched off when the page still opens', async () => {
		const { done, log } = take(fakeGitHub(), { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toMatchObject({ gone: false });
		expect(log.join('\n')).toMatch(/still opens[\s\S]*switch Pages off/);
	});

	it('removes nothing when there is no site, or the records are on a branch the site is not built from', async () => {
		for (const [gh, more] of [
			[fakeGitHub({ pages: false }), {}],
			[fakeGitHub(), { recordsBranch: 'noah/elsewhere' }],
		] as const) {
			const { done, order } = take(gh, more);
			await expect(done).rejects.toThrow();
			expect(order).toEqual([]);
		}
	});

	it('says the page is still on the site when the records cannot be pushed', async () => {
		const gh = fakeGitHub();
		const { done } = take(gh, { pushRecords: async () => ({ published: [], problems: [{ what: 'Project records', why: 'Could not reach GitHub.' }] }) });
		await expect(done).rejects.toThrow(/removed here[\s\S]*site still has it[\s\S]*Could not reach GitHub/);
		expect(gh.calls.some((c) => c.method === 'POST')).toBe(false);
	});
});

describe('what GitHub has that the site does not have yet', () => {
	const WORKFLOW_RUNS = `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/runs?per_page=5`;
	const github = ({ files = [{ filename: 'projects/demo/prototypes/v1-i2.html', status: 'modified' }] as { filename: string; status: string }[], runs = [{ status: 'completed' }] as { status: string }[], deployed = true, pages = true } = {}) => ({
		api: vi.fn(async (path: string) => {
			if (path === '/repos/acme/design') return { private: true, default_branch: 'main' };
			if (path === '/repos/acme/design/pages') {
				if (!pages) throw Object.assign(new Error('Not Found'), { status: 404 });
				return { html_url: SITE, public: false };
			}
			if (path === WORKFLOW_RUNS) return { workflow_runs: runs };
			if (path.startsWith('/repos/acme/design/deployments?')) return deployed ? [{ id: 6, sha: 'd'.repeat(40) }] : [];
			if (path === '/repos/acme/design/deployments/6/statuses?per_page=1') return [{ state: 'success' }];
			if (path === `/repos/acme/design/compare/${'d'.repeat(40)}...main`) return { files };
			throw new Error(`not faked: ${path}`);
		}),
	});

	it('is found by what changed since the last deploy: one call, whichever page it was', async () => {
		expect(await siteBehind(github(), REF)).toEqual({ kind: 'page', projectId: 'demo', name: 'v1-i2' });
	});

	it('is nothing when only things the site does not show have changed', async () => {
		const files = [
			{ filename: 'projects/demo/comments.md', status: 'modified' },
			{ filename: 'skills/x.md', status: 'added' },
			{ filename: 'projects/demo/prototypes/v1-i2.tsx', status: 'modified' },
			// The app's own screens and its main process, which the site is not built from.
			{ filename: 'workspace/src/main/ipc.ts', status: 'modified' },
			{ filename: 'workspace/__tests__/viewer.spec.ts', status: 'modified' },
			{ filename: 'IMPLEMENTATION_PLAN.md', status: 'modified' },
		];
		expect(await siteBehind(github({ files }), REF)).toBeNull();
	});

	it.each([
		'workspace/src/viewer/Viewer.tsx',
		'workspace/src/renderer/IterationSwitcher.tsx',
		'workspace/src/renderer/comments/CommentList.tsx',
		'workspace/src/renderer/ui/button.tsx',
		'workspace/src/renderer/index.css',
		'workspace/src/shared/projects.ts',
		'workspace/src/site/buildSite.ts',
		'workspace/src/main/services/designRepo.ts',
		'workspace/src/cli/dsnr.ts',
		'workspace/viewer.vite.config.ts',
		'workspace/bin/dsnr.mjs',
		'workspace/package-lock.json',
		'.github/workflows/publish-prototypes.yml',
	])('is the site built differently when %s changes: a deploy with no page to name', async (filename) => {
		expect(await siteBehind(github({ files: [{ filename, status: 'modified' }] }), REF)).toEqual({ kind: 'code' });
	});

	it('names the page when a page and the way the site is built both changed: one deploy does both', async () => {
		const files = [{ filename: 'workspace/src/viewer/Viewer.tsx', status: 'modified' }, { filename: 'projects/demo/prototypes/v1-i2.html', status: 'modified' }];
		expect(await siteBehind(github({ files }), REF)).toEqual({ kind: 'page', projectId: 'demo', name: 'v1-i2' });
	});

	it('waits while a deploy is already on its way, and has nothing to compare before the first deploy', async () => {
		expect(await siteBehind(github({ runs: [{ status: 'in_progress' }] }), REF)).toBeNull();
		expect(await siteBehind(github({ runs: [{ status: 'completed' }, { status: 'queued' }] }), REF)).toBeNull();
		expect(await siteBehind(github({ deployed: false }), REF)).toBeNull();
	});

	it('is nothing without a Pages site', async () => {
		expect(await siteBehind(github({ pages: false }), REF)).toBeNull();
	});
});

describe('when GitHub will not start the deploy', () => {
	it('says what the app is missing, in words that can be acted on, when its permission is refused', async () => {
		const gh = fakeGitHub();
		const refuse = vi.fn(async (path: string, init?: { method?: string; body?: unknown }) =>
			path.endsWith('/dispatches') ? Promise.reject(Object.assign(new Error('Resource not accessible by integration'), { status: 403 })) : gh.api(path, init as never),
		);
		const { done } = run(gh, { github: { api: refuse } });
		await expect(done).rejects.toThrow(/DSNR's GitHub App is not allowed to start the deploy[\s\S]*Actions: read and write/);
	});
});

describe('deploying the site with no page to name', () => {
	it('pushes the records, deploys, and waits, as publishing does', async () => {
		const gh = fakeGitHub();
		const pushRecords = vi.fn(async () => ({ published: [], problems: [] }));
		await redeploySite({ github: { api: gh.api }, ref: REF, recordsBranch: 'main', pushRecords, sleep: async () => undefined });
		expect(pushRecords).toHaveBeenCalledOnce();
		expect(gh.calls.find((c) => c.method === 'POST')).toMatchObject({ path: `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, body: { ref: 'main' } });
	});

	it('stops where publishing does: no site, the wrong branch, a failed deploy', async () => {
		const input = (gh: ReturnType<typeof fakeGitHub>, more = {}) => ({ github: { api: gh.api }, ref: REF, recordsBranch: 'main', pushRecords: async () => ({ published: [], problems: [] }), sleep: async () => undefined, ...more });
		await expect(redeploySite(input(fakeGitHub({ pages: false })))).rejects.toThrow(/no GitHub Pages site/);
		await expect(redeploySite(input(fakeGitHub(), { recordsBranch: 'noah/elsewhere' }))).rejects.toThrow(/built from main/);
		await expect(redeploySite(input(fakeGitHub({ conclusion: 'failure' })))).rejects.toThrow(/did not finish/);
	});
});
