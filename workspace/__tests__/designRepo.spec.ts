import { describe, expect, it } from 'vitest';
import { DesignRepo } from '../src/host/designRepo';
import { b64, fakeGitHub } from './fakes/github';

const REF = { owner: 'acme', repo: 'design' };

const ITERATIONS = [
	{ projectId: 'alpha', name: 'i1', branch: 'fd/alpha/i1', commit: null, createdAt: '2026-10-01', note: '' },
	{
		projectId: 'alpha',
		name: 'i2',
		branch: 'fd/alpha/i2',
		commit: null,
		createdAt: '2026-10-02',
		note: '',
		previewUrl: 'https://preview.test/alpha-i2',
	},
	{ projectId: 'alpha', name: 'codebase', branch: 'feature/alpha', commit: null, createdAt: '2026-10-03', note: '' },
];

describe('listProjects', () => {
	const routes = {
		'/repos/acme/design/contents/projects/alpha*': [
			{ type: 'file', name: 'brief.md' },
			{ type: 'file', name: 'iterations.json' },
			{ type: 'file', name: 'review.md' },
		],
		'/repos/acme/design/contents/projects*': [
			{ type: 'dir', name: 'alpha' },
			{ type: 'file', name: 'README.md' },
			{ type: 'dir', name: '_template' },
		],
		'/repos/acme/design/contents/projects/alpha/brief.md*': { sha: 'f1', content: b64('# Inactive users\n') },
		'/repos/acme/design/contents/projects/alpha/iterations.json*': { sha: 'f1', content: b64(JSON.stringify(ITERATIONS)) },
		'/repos/acme/design/issues?state=all*': [{ number: 7, comments: 3, body: 'Review thread for alpha, branch: `fd/alpha/i2`.' }],
	};

	it('reads when each iteration was started from its record, and treats anything else as unknown', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/iterations.json*': {
				sha: 'f1',
				content: b64(JSON.stringify([...ITERATIONS.slice(0, 2).map((i, n) => ({ ...i, createdAt: n === 0 ? '2026-10-01T00:00:00Z' : 'someday' }))])),
			},
		});
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.iterations.map((i) => [i.name, i.createdAt]).sort()).toEqual([
			['i1', '2026-10-01T00:00:00Z'],
			['i2', null],
		]);
	});

	it('reads which picture each prototype has from its record, and nothing that is not one', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/iterations.json*': {
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
		expect(Object.fromEntries(alpha!.iterations.map((i) => [i.name, i.cover]))).toEqual({ i1: 'aaaaaaaaaaaa', i2: null });
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
				{ number: 7, comments: 3, updated_at: '2026-10-08T08:00:00Z', body: 'Review thread for alpha, branch: `fd/alpha/i2`.' },
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
			'/repos/acme/design/contents/projects/alpha*': [{ type: 'file', name: 'iterations.json' }],
		});
		expect((await new DesignRepo(noBrief.github, REF).listProjects())[0]?.title).toBe('alpha');
	});

	it('reads iterations from the project folder, not from branches', async () => {
		// The regression: iteration branches live in the PRODUCT repository, which
		// this app cannot see. Looking for them in the design repo listed "No
		// branches yet" for every project, including ones with iterations.
		const { github: session, api } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.iterations.map((i) => i.branch)).toEqual(['fd/alpha/i2', 'fd/alpha/i1', 'feature/alpha']);
		expect(api.mock.calls.some(([path]) => path.includes('/branches'))).toBe(false);
	});

	it('puts prototype iterations newest first and the codebase branch last', async () => {
		const { github: session } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.iterations.map((i) => i.name)).toEqual(['i2', 'i1', 'codebase']);
	});

	it('carries where codebase work is on GitHub through, and drops what is not a repository or a link', async () => {
		const records = [
			{ ...ITERATIONS[2], repository: 'flocksafety/flock-coke', pullRequest: 'https://github.com/flocksafety/flock-coke/pull/3' },
			{ ...ITERATIONS[0], repository: 42, pullRequest: 'nope' },
		];
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/iterations.json*': { sha: 'f1', content: b64(JSON.stringify(records)) },
		});
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.iterations.find((i) => i.name === 'codebase')).toMatchObject({
			repository: 'flocksafety/flock-coke',
			pullRequest: 'https://github.com/flocksafety/flock-coke/pull/3',
		});
		expect(alpha?.iterations.find((i) => i.name === 'i1')).toMatchObject({ repository: null, pullRequest: null });
	});

	it('carries a recorded preview link through', async () => {
		const { github: session } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.iterations.find((i) => i.name === 'i2')?.previewUrl).toBe('https://preview.test/alpha-i2');
		expect(alpha?.iterations.find((i) => i.name === 'i1')?.previewUrl).toBeNull();
	});

	it('shows no iterations, not an error, for a project that has none recorded', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha*': [{ type: 'file', name: 'brief.md' }],
		});
		expect((await new DesignRepo(session, REF).listProjects())[0]?.iterations).toEqual([]);
	});

	it('shows no iterations, not an error, when the record is unreadable', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/contents/projects/alpha/iterations.json*': { sha: 'f1', content: b64('{ not json') },
		});
		expect((await new DesignRepo(session, REF).listProjects())[0]?.iterations).toEqual([]);
	});

	it('links an iteration to its review thread and counts open comments', async () => {
		const { github: session } = fakeGitHub(routes);
		const [alpha] = await new DesignRepo(session, REF).listProjects();
		expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i2')?.issueNumber).toBe(7);
		expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i1')?.issueNumber).toBeNull();
		// Each iteration carries its own count: the one with the thread has the thread's comments, the other none.
		expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i2')?.openComments).toBe(3);
		expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i1')?.openComments).toBe(0);
		expect(alpha).not.toHaveProperty('openComments');
	});

	it('only ever calls the repository API', async () => {
		const { github: session, api } = fakeGitHub(routes);
		await new DesignRepo(session, REF).listProjects();
		// Reviewer mode's whole promise: no clone, no git, nothing outside the repo.
		expect(api.mock.calls.every(([path]) => path.startsWith('/repos/acme/design/'))).toBe(true);
	});

	describe('read again', () => {
		/** The design repository with alpha's folder at `tree` (its fingerprint), and its threads as `threads` says. */
		const repo = (state: { tree: string; brief: string; comments: number }) =>
			fakeGitHub({
				...routes,
				'/repos/acme/design/contents/projects*': () => [{ type: 'dir', name: 'alpha', sha: state.tree }],
				'/repos/acme/design/contents/projects/alpha/brief.md*': () => ({ sha: 'b', content: b64(state.brief) }),
				'/repos/acme/design/commits?path=projects%2Falpha*': [],
				'/repos/acme/design/issues?state=all*': () => [
					{ number: 7, comments: state.comments, body: 'Review thread for alpha, branch: `fd/alpha/i2`.' },
				],
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
			expect(paths).toHaveLength(2);
			expect(again).toEqual(first);
		});

		it('reads a project again once its folder changed, and a new comment shows either way', async () => {
			const state = { tree: 't1', brief: '# Inactive users\n', comments: 3 };
			const { github: session } = repo(state);
			const design = new DesignRepo(session, REF);
			await design.listProjects();
			state.comments = 4;
			expect((await design.listProjects())[0]?.iterations.find((i) => i.name === 'i2')?.openComments).toBe(4);
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
			expect(api.mock.calls).toHaveLength(asked + 2);
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
				name: 'i1',
				branch: 'fd/alpha/i1',
				commit: null,
				createdAt: '',
				note: '',
				contributors: [{ name: 'Ada Lovelace', login: null }, 'Grace Hopper'],
			},
			{
				projectId: 'alpha',
				name: 'i2',
				branch: 'fd/alpha/i2',
				commit: null,
				createdAt: '',
				note: '',
				contributors: [{ name: 'Grace Hopper', login: 'ghopper' }],
			},
		];
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/projects/alpha/iterations.json*': { sha: 'f1', content: b64(JSON.stringify(records)) },
			'/repos/acme/design/contents/projects/alpha*': [{ type: 'file', name: 'iterations.json' }],
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
			{ name: 'Grace Hopper', login: 'ghopper' }, // learned from one iteration, applied to the person everywhere
			{ name: 'Noah Shrader', login: 'noahshrader-flock' },
		]);
		expect(project?.iterations.find((i) => i.name === 'i1')?.contributors.map((p) => p.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
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
