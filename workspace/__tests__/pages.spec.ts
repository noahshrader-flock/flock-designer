import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GitHubApi } from '../src/github/github';

import { type Answer, fakeGitHub, notFound, refusal } from './fakes/github';
import { PUBLISH_WORKFLOW, pageStatus, publish, readVisibility, redeploySite, siteBehind, unpublish, whyPublic } from '../src/core/services/pages';

/**
 * Publishing a prototype to its page (M5b of the Pages plan), against a fake GitHub. What matters most is what it will
 * not do: hand out a link to a site anyone can open, unless the person said in so many words that this is a test.
 */

const REF = { owner: 'acme', repo: 'design' };
const SITE = 'https://acme.github.io/design/';

/**
 * GitHub as its API answers. Runs appear one poll after the dispatch, and finish on the next. `more` replaces any of its
 * routes, for a test of one refusal.
 */
const fakeSite = (
	{ repoPrivate = true, sitePublic = false, pages = true, conclusion = 'success', workflow = true, onSite = true as boolean | 'no-deploy' } = {},
	more: Record<string, Answer> = {},
) => {
	const runs: { id: number; status: string; conclusion: string | null; html_url: string }[] = [
		{ id: 1, status: 'completed', conclusion: 'success', html_url: 'run/1' },
	];
	let polls = 0;
	return fakeGitHub({
		'/repos/acme/design': { private: repoPrivate, visibility: repoPrivate ? 'private' : 'public', default_branch: 'main' },
		'/repos/acme/design/pages': pages ? { html_url: SITE, public: sitePublic, build_type: 'workflow' } : notFound,
		// What the site was last built from, and whether this page was in it.
		'/repos/acme/design/deployments?*': onSite === 'no-deploy' ? [] : [{ id: 6, sha: 'd'.repeat(40) }],
		'/repos/acme/design/deployments/6/statuses?per_page=1': [{ state: 'success' }],
		'/repos/acme/design/commits?*': onSite === true ? [{ sha: 'c'.repeat(40) }] : [],
		[`/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`]: () => {
			if (!workflow) notFound();
			runs.unshift({ id: 2, status: 'queued', conclusion: null, html_url: 'run/2' });
			return null;
		},
		[`/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/runs*`]: () => {
			polls++;
			const fresh = runs.find((r) => r.id === 2);
			if (fresh && polls > 2) Object.assign(fresh, { status: 'completed', conclusion });
			return { workflow_runs: runs };
		},
		...more,
	});
};

const run = (gh: ReturnType<typeof fakeSite>, more: Partial<Parameters<typeof publish>[0]> = {}) => {
	const log: string[] = [];
	const anonymous = vi.fn(async () => ({ status: 302 }));
	const pushRecords = vi.fn(async () => ({ published: ['demo'], problems: [] }));
	const done = publish({
		github: { api: gh.api },
		ref: REF,
		recordsBranch: 'main',
		projectId: 'demo',
		name: 'v1',
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
		expect(await readVisibility({ api: fakeSite().api }, REF)).toMatchObject({ repoPrivate: true, site: { url: SITE, public: false } });
		expect(await readVisibility({ api: fakeSite({ pages: false }).api }, REF)).toMatchObject({ repoPrivate: true, site: null });
	});

	it('says why anyone could open the site, or nothing when GitHub says it is private', () => {
		expect(whyPublic({ repoPrivate: true, defaultBranch: 'main', site: { url: SITE, public: false } })).toBeNull();
		expect(whyPublic({ repoPrivate: false, defaultBranch: 'main', site: { url: SITE, public: true } })).toMatch(/repository is public/);
		expect(whyPublic({ repoPrivate: true, defaultBranch: 'main', site: { url: SITE, public: true } })).toMatch(/site is public/);
	});
});

describe('publishing', () => {
	it('pushes the records, asks for the deploy, waits for it, and gives the link to the version', async () => {
		const gh = fakeSite();
		const { done, pushRecords, anonymous } = run(gh);
		expect(await done).toEqual({ url: `${SITE}demo/v1/`, public: false, first: false });
		expect(pushRecords).toHaveBeenCalledOnce();
		const dispatch = gh.calls.find((c) => c.method === 'POST');
		expect(dispatch).toMatchObject({ path: `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`, body: { ref: 'main' } });
		expect(anonymous).toHaveBeenCalledWith(`${SITE}demo/v1/`);
	});

	it('says whether this is the first time the page goes up: not on the last deploy, or no deploy yet', async () => {
		expect(await run(fakeSite()).done).toMatchObject({ first: false });
		expect(await run(fakeSite({ onSite: false })).done).toMatchObject({ first: true });
		expect(await run(fakeSite({ onSite: 'no-deploy' })).done).toMatchObject({ first: true });
		// Asked of the last deploy, with the commits that touched this page.
		const gh = fakeSite({ onSite: false });
		await run(gh).done;
		const asked = new URLSearchParams(gh.calls.find((c) => c.path.startsWith('/repos/acme/design/commits?'))?.path.split('?')[1]);
		expect([asked.get('sha'), asked.get('path')]).toEqual(['d'.repeat(40), 'projects/demo/prototypes/v1.html']);
	});

	it('does not count it as the first time when it cannot tell, so nothing opens by mistake', async () => {
		const gh = fakeSite(
			{},
			{
				'/repos/acme/design/deployments?*': () => {
					throw refusal(403);
				},
			},
		);
		expect(await run(gh).done).toMatchObject({ first: false });
	});

	it('goes ahead while the repository is public, and says so in its note', async () => {
		const gh = fakeSite({ repoPrivate: false, sitePublic: true });
		const { done, log, pushRecords } = run(gh, { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toEqual({ url: `${SITE}demo/v1/`, public: true, first: false });
		expect(pushRecords).toHaveBeenCalledOnce();
		expect(log.join('\n')).toMatch(/Note that the repository is public, so anyone with the link can open this page/);
		expect(log.join('\n')).not.toMatch(/PUBLIC TEST/);
	});

	it('has nowhere to go without a Pages site, and pushes nothing', async () => {
		const gh = fakeSite({ pages: false });
		const { done, pushRecords } = run(gh);
		await expect(done).rejects.toThrow(/no GitHub Pages site[\s\S]*No link/);
		expect(pushRecords).not.toHaveBeenCalled();
		expect(gh.calls.some((c) => c.method === 'POST')).toBe(false);
	});

	it('says plainly when a page it was told is private opens for anyone, and not to share it', async () => {
		const { done, log } = run(fakeSite(), { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toMatchObject({ public: true });
		expect(log.join('\n')).toMatch(/opens for anyone[\s\S]*Do not share/);
	});

	it('stops before deploying when the records cannot be pushed, and says why', async () => {
		const gh = fakeSite();
		const { done } = run(gh, {
			pushRecords: async () => ({ published: [], problems: [{ what: 'Project records', why: '2 changes outside the project records are waiting' }] }),
		});
		await expect(done).rejects.toThrow(/outside the project records/);
		expect(gh.calls.some((c) => c.method === 'POST')).toBe(false);
	});

	it('says where to look when the deploy fails', async () => {
		const { done } = run(fakeSite({ conclusion: 'failure' }));
		await expect(done).rejects.toThrow(/did not finish[\s\S]*run\/2/);
	});

	it('says the workflow is missing when GitHub has none to run', async () => {
		const { done } = run(fakeSite({ workflow: false }));
		await expect(done).rejects.toThrow(new RegExp(`${PUBLISH_WORKFLOW}[\\s\\S]*not on GitHub`));
	});

	it('refuses records on a branch the site is not built from, before pushing them', async () => {
		const gh = fakeSite();
		const { done, pushRecords } = run(gh, { recordsBranch: 'noah/elsewhere' });
		await expect(done).rejects.toThrow(/built from main[\s\S]*noah\/elsewhere/);
		expect(pushRecords).not.toHaveBeenCalled();
	});

	it('asks where it is going before anything about this machine, and refuses a clone on no branch after it', async () => {
		await expect(run(fakeSite({ pages: false }), { recordsBranch: '' }).done).rejects.toThrow(/no GitHub Pages site/);
		const { done, pushRecords } = run(fakeSite(), { recordsBranch: '' });
		await expect(done).rejects.toThrow(/not on a branch/);
		expect(pushRecords).not.toHaveBeenCalled();
	});

	it('refuses a name that is not a prototype', async () => {
		const { done } = run(fakeSite(), { name: 'codebase' });
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

describe('whether a version is on its page', () => {
	/** GitHub with a site deployed from `deployed`, and the page last changed in `changed`. */
	const site = ({
		deployed = 'd'.repeat(40),
		changed = 'c'.repeat(40) as string | null,
		compare = 'ahead',
		repoPrivate = true,
		deployments = true,
	} = {}) =>
		fakeGitHub({
			'/repos/acme/design': { private: repoPrivate, default_branch: 'main' },
			'/repos/acme/design/pages': { html_url: SITE, public: !repoPrivate },
			'/repos/acme/design/deployments?*': deployments
				? [
						{ id: 7, sha: 'f'.repeat(40) },
						{ id: 6, sha: deployed },
					]
				: [],
			'/repos/acme/design/deployments/7/statuses?per_page=1': [{ state: 'in_progress' }],
			'/repos/acme/design/deployments/6/statuses?per_page=1': [{ state: 'success' }],
			'/repos/acme/design/commits?*': ({ query }) => {
				expect(query.get('path')).toBe('projects/demo/prototypes/v1.html');
				expect(query.get('sha')).toBe('main');
				return changed ? [{ sha: changed }] : [];
			},
			'/repos/acme/design/compare/*': { status: compare },
		}).github;
	const status = (gh: GitHubApi) => pageStatus(gh, REF, 'demo', 'v1');

	it('is published when the last deploy includes the last change to its page, with a link that names that deploy', async () => {
		expect(await status(site())).toEqual({ state: 'published', url: `${SITE}demo/v1/?v=ddddddd` });
		// The one still deploying is not counted: it may yet fail.
	});

	it('is not published yet when its page changed after the last deploy, or was never pushed', async () => {
		expect(await status(site({ compare: 'behind' }))).toEqual({ state: 'unpublished' });
		expect(await status(site({ changed: null }))).toEqual({ state: 'unpublished' });
		expect(await status(site({ deployments: false }))).toEqual({ state: 'unpublished' });
	});

	it('has nothing to say without a site, or for something that is not a prototype', async () => {
		const none = fakeGitHub({ '/repos/acme/design': { private: true }, '/repos/acme/design/*': notFound }).github;
		expect(await pageStatus(none, REF, 'demo', 'v1')).toEqual({ state: 'none' });
		expect(await pageStatus(site(), REF, 'demo', 'codebase')).toEqual({ state: 'none' });
	});
});

describe('unpublishing', () => {
	const take = (gh: ReturnType<typeof fakeSite>, more: Partial<Parameters<typeof unpublish>[0]> = {}) => {
		const order: string[] = [];
		const log: string[] = [];
		const done = unpublish({
			github: { api: gh.api },
			ref: REF,
			recordsBranch: 'main',
			projectId: 'demo',
			name: 'v1',
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
		const gh = fakeSite({ repoPrivate: false, sitePublic: true });
		const { done, order, log } = take(gh);
		expect(await done).toEqual({ url: `${SITE}demo/v1/`, gone: true });
		expect(order).toEqual(['removed', 'pushed']);
		expect(gh.calls.find((c) => c.method === 'POST')?.path).toBe(`/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`);
		expect(log.join('\n')).toMatch(/Taken off the site[\s\S]*record and comments are kept/);
	});

	it('says to ask for Pages to be switched off when the page still opens', async () => {
		const { done, log } = take(fakeSite(), { fetchAnonymously: async () => ({ status: 200 }) });
		expect(await done).toMatchObject({ gone: false });
		expect(log.join('\n')).toMatch(/still opens[\s\S]*switch Pages off/);
	});

	it('removes nothing when there is no site, or the records are on a branch the site is not built from', async () => {
		for (const [gh, more] of [
			[fakeSite({ pages: false }), {}],
			[fakeSite(), { recordsBranch: 'noah/elsewhere' }],
		] as const) {
			const { done, order } = take(gh, more);
			await expect(done).rejects.toThrow();
			expect(order).toEqual([]);
		}
	});

	it('says the page is still on the site when the records cannot be pushed', async () => {
		const gh = fakeSite();
		const { done } = take(gh, {
			pushRecords: async () => ({ published: [], problems: [{ what: 'Project records', why: 'Could not reach GitHub.' }] }),
		});
		await expect(done).rejects.toThrow(/removed here[\s\S]*site still has it[\s\S]*Could not reach GitHub/);
		expect(gh.calls.some((c) => c.method === 'POST')).toBe(false);
	});
});

describe('what GitHub has that the site does not have yet', () => {
	const WORKFLOW_RUNS = `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/runs?per_page=5`;
	const github = ({
		files = [{ filename: 'projects/demo/prototypes/v1.html', status: 'modified' }] as { filename: string; status: string }[],
		runs = [{ status: 'completed' }] as { status: string }[],
		deployed = true,
		pages = true,
	} = {}) =>
		fakeGitHub({
			'/repos/acme/design': { private: true, default_branch: 'main' },
			'/repos/acme/design/pages': pages ? { html_url: SITE, public: false } : notFound,
			[WORKFLOW_RUNS]: { workflow_runs: runs },
			'/repos/acme/design/deployments?*': deployed ? [{ id: 6, sha: 'd'.repeat(40) }] : [],
			'/repos/acme/design/deployments/6/statuses?per_page=1': [{ state: 'success' }],
			[`/repos/acme/design/compare/${'d'.repeat(40)}...main`]: { files },
		}).github;

	it('is found by what changed since the last deploy: one call, whichever page it was', async () => {
		expect(await siteBehind(github(), REF)).toEqual({ kind: 'page', projectId: 'demo', name: 'v1' });
	});

	it('is nothing when only things the site does not show have changed', async () => {
		const files = [
			{ filename: 'projects/demo/comments.md', status: 'modified' },
			{ filename: 'skills/x.md', status: 'added' },
			{ filename: 'projects/demo/prototypes/v1.tsx', status: 'modified' },
			// The app's own screens and its main process, which the site is not built from.
			{ filename: 'workspace/src/core/calls.ts', status: 'modified' },
			{ filename: 'workspace/__tests__/viewer.spec.ts', status: 'modified' },
			{ filename: 'IMPLEMENTATION_PLAN.md', status: 'modified' },
		];
		expect(await siteBehind(github({ files }), REF)).toBeNull();
	});

	it.each([
		'workspace/src/viewer/Viewer.tsx',
		'workspace/src/renderer/VersionSwitcher.tsx',
		'workspace/src/renderer/comments/CommentList.tsx',
		'workspace/src/renderer/ui/button.tsx',
		'workspace/src/renderer/index.css',
		'workspace/src/shared/projectList.ts',
		'workspace/src/site/buildSite.ts',
		'workspace/src/github/designRepo.ts',
		'workspace/src/cli/dsnr.ts',
		'workspace/viewer.vite.config.ts',
		'workspace/bin/dsnr.mjs',
		'workspace/package-lock.json',
		'.github/workflows/publish-prototypes.yml',
	])('is the site built differently when %s changes: a deploy with no page to name', async (filename) => {
		expect(await siteBehind(github({ files: [{ filename, status: 'modified' }] }), REF)).toEqual({ kind: 'code' });
	});

	it('names the page when a page and the way the site is built both changed: one deploy does both', async () => {
		const files = [
			{ filename: 'workspace/src/viewer/Viewer.tsx', status: 'modified' },
			{ filename: 'projects/demo/prototypes/v1.html', status: 'modified' },
		];
		expect(await siteBehind(github({ files }), REF)).toEqual({ kind: 'page', projectId: 'demo', name: 'v1' });
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
		const gh = fakeSite(
			{},
			{
				[`/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`]: () => {
					throw refusal(403, 'Resource not accessible by integration');
				},
			},
		);
		const { done } = run(gh);
		await expect(done).rejects.toThrow(/DSNR's GitHub App is not allowed to start the deploy[\s\S]*Actions: read and write/);
	});
});

describe('deploying the site with no page to name', () => {
	it('pushes the records, deploys, and waits, as publishing does', async () => {
		const gh = fakeSite();
		const pushRecords = vi.fn(async () => ({ published: [], problems: [] }));
		await redeploySite({ github: { api: gh.api }, ref: REF, recordsBranch: 'main', pushRecords, sleep: async () => undefined });
		expect(pushRecords).toHaveBeenCalledOnce();
		expect(gh.calls.find((c) => c.method === 'POST')).toMatchObject({
			path: `/repos/acme/design/actions/workflows/${PUBLISH_WORKFLOW}/dispatches`,
			body: { ref: 'main' },
		});
	});

	it('stops where publishing does: no site, the wrong branch, a failed deploy', async () => {
		const input = (gh: ReturnType<typeof fakeSite>, more = {}) => ({
			github: { api: gh.api },
			ref: REF,
			recordsBranch: 'main',
			pushRecords: async () => ({ published: [], problems: [] }),
			sleep: async () => undefined,
			...more,
		});
		await expect(redeploySite(input(fakeSite({ pages: false })))).rejects.toThrow(/no GitHub Pages site/);
		await expect(redeploySite(input(fakeSite(), { recordsBranch: 'noah/elsewhere' }))).rejects.toThrow(/built from main/);
		await expect(redeploySite(input(fakeSite({ conclusion: 'failure' })))).rejects.toThrow(/did not finish/);
	});
});
