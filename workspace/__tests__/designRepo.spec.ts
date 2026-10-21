import { describe, expect, it } from 'vitest';
import { DesignRepo } from '../src/codeHost/designRepo';
import { b64, fakeGitHub } from './fakes/github';

const REF = { owner: 'acme', repo: 'design' };

const ITERATIONS = [
	{ projectId: 'alpha', name: 'v1', branch: 'prototype/alpha/v1', commit: null, createdAt: '2026-10-01', note: '' },
	{
		projectId: 'alpha',
		name: 'v2',
		branch: 'prototype/alpha/v2',
		commit: null,
		createdAt: '2026-10-02',
		note: '',
		previewUrl: 'https://preview.test/alpha-v2',
	},
	{ projectId: 'alpha', name: 'codebase', branch: 'feature/alpha', commit: null, createdAt: '2026-10-03', note: '' },
];

describe('listProjects', () => {
	const routes = {
		'/repos/acme/design/contents/projects/alpha*': [
			{ type: 'file', name: 'brief.md' },
			{ type: 'file', name: 'work.json' },
			{ type: 'file', name: 'review.md' },
		],
		'/repos/acme/design/contents/projects*': [
			{ type: 'dir', name: 'alpha' },
			{ type: 'file', name: 'README.md' },
			{ type: 'dir', name: '_template' },
		],
		'/repos/acme/design/contents/projects/alpha/brief.md*': { sha: 'f1', content: b64('# Inactive users\n') },
		'/repos/acme/design/contents/projects/alpha/work.json*': { sha: 'f1', content: b64(JSON.stringify(ITERATIONS)) },
		// Three comments in the thread, one of them resolved: two are open.
		'/repos/acme/design/issues?state=all*': [
			{ number: 7, state: 'open', comments: 3, body: 'Review thread for alpha, branch: `prototype/alpha/v2`.' },
		],
		'/repos/acme/design/issues/7/comments*': [
			{ id: 1, user: { login: 'pm' }, body: 'Bigger', created_at: '2026-10-05T10:00:00Z' },
			{ id: 2, user: { login: 'pm' }, body: 'Bluer', created_at: '2026-10-05T10:01:00Z' },
			{ id: 3, user: { login: 'noah' }, body: 'Done <!-- resolved -->', created_at: '2026-10-05T10:02:00Z' },
		],
	};

	it('reads when each version was started from its record, and treats anything else as unknown', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/work.json*': {
				sha: 'f1',
				content: b64(JSON.stringify([...ITERATIONS.slice(0, 2).map((i, n) => ({ ...i, createdAt: n === 0 ? '2026-10-01T00:00:00Z' : 'someday' }))])),
			},
		});
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.work.map((i) => [i.name, i.createdAt]).sort()).toEqual([
			['v1', '2026-10-01T00:00:00Z'],
			['v2', null],
		]);
	});

	it('reads which picture each prototype has from its record, and nothing that is not one', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/work.json*': {
				sha: 'f1',
				content: b64(
					JSON.stringify([
						{ ...ITERATIONS[0], cover: 'aaaaaaaaaaaa' },
						{ ...ITERATIONS[1], cover: 'not a hash' },
					]),
				),
			},
		});
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(Object.fromEntries(alpha!.work.map((i) => [i.name, i.cover]))).toEqual({ v1: 'aaaaaaaaaaaa', v2: null });
	});

	it('knows when a project last had activity: the newest of a change to its folder and a comment on its review thread', async () => {
		const commits = [
			{ commit: { author: { name: 'Noah' }, committer: { date: '2026-10-06T12:00:00Z' } } },
			{ commit: { author: { name: 'Pat' }, committer: { date: '2026-10-02T12:00:00Z' } } },
		];
		const later = fakeGitHub({ ...routes, '/repos/acme/design/commits?path=projects%2Falpha*': commits });
		expect((await new DesignRepo(later.github, REF).listProjects())[0]?.updatedAt).toBe('2026-10-06T12:00:00Z');
		// A comment made after: GitHub dates the thread by its latest comment.
		const commented = fakeGitHub({
			...routes,
			'/repos/acme/design/commits?path=projects%2Falpha*': commits,
			'/repos/acme/design/issues?state=all*': [
				{ number: 7, comments: 3, updated_at: '2026-10-08T08:00:00Z', body: 'Review thread for alpha, branch: `prototype/alpha/v2`.' },
			],
		});
		expect((await new DesignRepo(commented.github, REF).listProjects())[0]?.updatedAt).toBe('2026-10-08T08:00:00Z');
	});

	it('has no date for activity it cannot read, and does not fail the list for it', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/commits?path=projects%2Falpha*': () => {
				throw new Error('rate limited');
			},
		});
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.updatedAt).toBeNull();
	});

	it('lists project folders, skipping files and templates', async () => {
		const { github: session } = fakeGitHub(routes);
		expect((await new DesignRepo(session, REF).listProjects()).map((p) => p.id)).toEqual(['alpha']);
	});

	it('reads the title from the brief, and falls back to the id', async () => {
		const { github: session } = fakeGitHub(routes);
		expect((await new DesignRepo(session, REF).listProjects())[0]?.title).toBe('Inactive users');

		const noBrief = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha*': [{ type: 'file', name: 'work.json' }],
		});
		expect((await new DesignRepo(noBrief.github, REF).listProjects())[0]?.title).toBe('alpha');
	});

	it('reads work from the project folder, not from branches', async () => {
		// Work branches live in the PRODUCT repository, which this reader cannot see: looking for them in the design
		// repo would list "No branches yet" for every project, including ones with work.
		const { github: session, api } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.work.map((i) => i.branch)).toEqual(['prototype/alpha/v2', 'prototype/alpha/v1', 'feature/alpha']);
		expect(api.mock.calls.some(([path]) => path.includes('/branches'))).toBe(false);
	});

	it('puts prototype work newest first and the codebase branch last', async () => {
		const { github: session } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.work.map((i) => i.name)).toEqual(['v2', 'v1', 'codebase']);
	});

	it('carries where codebase work is on GitHub through, and drops what is not a repository or a link', async () => {
		const records = [
			{ ...ITERATIONS[2], repository: 'flocksafety/flock-coke', pullRequest: 'https://github.com/flocksafety/flock-coke/pull/3' },
			{ ...ITERATIONS[0], repository: 42, pullRequest: 'nope' },
		];
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/work.json*': { sha: 'f1', content: b64(JSON.stringify(records)) },
		});
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.work.find((i) => i.name === 'codebase')).toMatchObject({
			repository: 'flocksafety/flock-coke',
			pullRequest: 'https://github.com/flocksafety/flock-coke/pull/3',
		});
		expect(alpha?.work.find((i) => i.name === 'v1')).toMatchObject({ repository: null, pullRequest: null });
	});

	it('carries a recorded preview link through', async () => {
		const { github: session } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.work.find((i) => i.name === 'v2')?.previewUrl).toBe('https://preview.test/alpha-v2');
		expect(alpha?.work.find((i) => i.name === 'v1')?.previewUrl).toBeNull();
	});

	it('shows no work, not an error, for a project that has none recorded', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha*': [{ type: 'file', name: 'brief.md' }],
		});
		expect((await new DesignRepo(session, REF).listProjects())[0]?.work).toEqual([]);
	});

	it('shows no work, not an error, when the record is unreadable', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/work.json*': { sha: 'f1', content: b64('{ not json') },
		});
		expect((await new DesignRepo(session, REF).listProjects())[0]?.work).toEqual([]);
	});

	it('links a version to its review thread and counts its open comments: those not resolved, not all of them', async () => {
		const { github: session } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.work.find((i) => i.branch === 'prototype/alpha/v2')?.issueNumber).toBe(7);
		expect(alpha?.work.find((i) => i.branch === 'prototype/alpha/v1')?.issueNumber).toBeNull();
		expect(alpha?.work.find((i) => i.branch === 'prototype/alpha/v2')?.openComments).toBe(2);
		expect(alpha?.work.find((i) => i.branch === 'prototype/alpha/v1')?.openComments).toBe(0);
		expect(alpha).not.toHaveProperty('openComments');
	});

	it('only ever calls the repository API', async () => {
		const { github: session, api } = fakeGitHub(routes);
		await new DesignRepo(session, REF).listProjects();
		// Reviewer mode's whole promise: no clone, no git, nothing outside the repo.
		expect(api.mock.calls.every(([path]) => path.startsWith('/repos/acme/design/'))).toBe(true);
	});

	describe('read again', () => {
		/** `comments`: the thread's comments, none resolved. */
		const repo = (state: { tree: string; brief: string; comments: number }) =>
			fakeGitHub({
				...routes,
				'/repos/acme/design/contents/projects*': () => [{ type: 'dir', name: 'alpha', sha: state.tree }],
				'/repos/acme/design/contents/projects/alpha/brief.md*': () => ({ sha: 'b', content: b64(state.brief) }),
				'/repos/acme/design/commits?path=projects%2Falpha*': [],
				'/repos/acme/design/issues?state=all*': () => [
					{ number: 7, state: 'open', comments: state.comments, body: 'Review thread for alpha, branch: `prototype/alpha/v2`.' },
				],
				'/repos/acme/design/issues/7/comments*': () =>
					Array.from({ length: state.comments }, (_, i) => ({ id: i + 1, user: { login: 'pm' }, body: 'x', created_at: `2026-10-05T10:0${i}:00Z` })),
			});
		const perProject = (paths: string[]) => paths.filter((p) => p.includes('projects/alpha') || p.includes('projects%2Falpha'));

		it('asks only for the folder list and the threads when no project folder changed', async () => {
			const state = { tree: 't1', brief: '# Inactive users\n', comments: 3 };
			const { github: session, api } = repo(state);
			const design = new DesignRepo(session, REF);
			const first = await design.listProjects();
			const asked = api.mock.calls.length;
			const again = await design.listProjects();
			const paths = api.mock.calls.slice(asked).map(([path]) => path as string);
			expect(perProject(paths)).toEqual([]);
			// The folder list and the threads, and the open thread's comments, which say how many are not resolved.
			expect(paths).toHaveLength(3);
			expect(again).toEqual(first);
		});

		it('reads a project again once its folder changed, and a new comment shows either way', async () => {
			const state = { tree: 't1', brief: '# Inactive users\n', comments: 3 };
			const { github: session } = repo(state);
			const design = new DesignRepo(session, REF);
			await design.listProjects();
			state.comments = 4;
			expect((await design.listProjects())[0]?.work.find((i) => i.name === 'v2')?.openComments).toBe(4);
			state.tree = 't2';
			state.brief = '# Dormant users\n';
			expect((await design.listProjects())[0]?.title).toBe('Dormant users');
		});

		it('asks again for who worked on a project when that could not be read, and keeps the rest', async () => {
			let refuse = true;
			const { github: session, api } = fakeGitHub({
				...routes,
				'/repos/acme/design/contents/projects*': () => [{ type: 'dir', name: 'alpha', sha: 't1' }],
				'/repos/acme/design/commits?path=projects%2Falpha*': () => {
					if (refuse) throw new Error('rate limited');
					return [{ commit: { author: { name: 'Ana' }, committer: { date: '2026-10-06T12:00:00Z' } }, author: { login: 'ana' } }];
				},
			});
			const design = new DesignRepo(session, REF);
			expect((await design.listProjects())[0]?.updatedAt).toBeNull();
			refuse = false;
			expect((await design.listProjects())[0]?.updatedAt).toBe('2026-10-06T12:00:00Z');
			const asked = api.mock.calls.length;
			await design.listProjects();
			// The folder list, the threads, and the open thread's comments, which say how many are not resolved: nothing of the project.
			expect(api.mock.calls).toHaveLength(asked + 3);
		});

		it('reads every time a folder GitHub gives no fingerprint for', async () => {
			const { github: session, api } = fakeGitHub(routes);
			const design = new DesignRepo(session, REF);
			await design.listProjects();
			const asked = api.mock.calls.length;
			await design.listProjects();
			expect(perProject(api.mock.calls.slice(asked).map(([path]) => path as string)).length).toBeGreaterThan(0);
		});
	});
});

describe('contributors', () => {
	it('shows everyone: code authors from the record plus people who committed to the folder', async () => {
		const records = [
			{
				projectId: 'alpha',
				name: 'v1',
				branch: 'prototype/alpha/v1',
				commit: null,
				createdAt: '',
				note: '',
				contributors: [{ name: 'Ada Lovelace', login: null }, 'Grace Hopper'],
			},
			{
				projectId: 'alpha',
				name: 'v2',
				branch: 'prototype/alpha/v2',
				commit: null,
				createdAt: '',
				note: '',
				contributors: [{ name: 'Grace Hopper', login: 'ghopper' }],
			},
		];
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/projects/alpha/work.json*': { sha: 'f1', content: b64(JSON.stringify(records)) },
			'/repos/acme/design/contents/projects/alpha*': [{ type: 'file', name: 'work.json' }],
			'/repos/acme/design/contents/projects*': [{ type: 'dir', name: 'alpha' }],
			'/repos/acme/design/issues?state=all*': [],
			'/repos/acme/design/commits?path=projects%2Falpha*': [
				{ commit: { author: { name: 'Noah Shrader' } }, author: { login: 'noahshrader-flock' } },
				{ commit: { author: { name: 'github-actions[bot]' } }, author: { login: 'github-actions[bot]' } },
				{ commit: { author: { name: 'Ada Lovelace' } }, author: { login: 'ada' } },
			],
		});
		const [project] = await new DesignRepo(session, REF).listProjects();
		expect(project?.people).toEqual([
			{ name: 'Ada Lovelace', login: 'ada' },
			{ name: 'Grace Hopper', login: 'ghopper' }, // learned from one piece of work, applied to the person everywhere
			{ name: 'Noah Shrader', login: 'noahshrader-flock' },
		]);
		expect(project?.work.find((i) => i.name === 'v1')?.contributors.map((p) => p.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
	});

	it('still lists the project if the folder history cannot be read', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/projects/alpha*': [],
			'/repos/acme/design/contents/projects*': [{ type: 'dir', name: 'alpha' }],
			'/repos/acme/design/issues?state=all*': [],
			'/repos/acme/design/commits?path=projects%2Falpha*': () => {
				throw new Error('rate limited');
			},
		});
		expect((await new DesignRepo(session, REF).listProjects())[0]?.people).toEqual([]);
	});
});

describe('readRecord', () => {
	it('reads one file of a project as text', async () => {
		const { github: session, api } = fakeGitHub({
			'/repos/acme/design/contents/projects/alpha/review.md*': { sha: 'f1', content: b64('# Review\nnotes ✓') },
		});
		expect(await new DesignRepo(session, REF).readRecord('alpha', 'review.md')).toBe('# Review\nnotes ✓');
		expect(api).toHaveBeenCalledWith('/repos/acme/design/contents/projects/alpha/review.md');
	});

	it('says so when GitHub returns something that is not a file', async () => {
		const { github: session } = fakeGitHub({ '/repos/acme/design/contents/projects/alpha/docs*': [] });
		await expect(new DesignRepo(session, REF).readRecord('alpha', 'docs')).rejects.toThrow(/could not be read/);
	});
});
