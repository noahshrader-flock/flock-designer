import { describe, expect, it } from 'vitest';
import { DesignRepo } from '../src/main/services/designRepo';
import { RepoFiles } from '../src/main/services/repoFiles';
import { ReviewThreads } from '../src/main/services/reviewThreads';
import { type RouteCall, fakeGitHub, refusal } from './fakes/github';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
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
		const later = fakeGitHub({ ...routes, '/repos/acme/design/commits?path=projects/alpha*': commits });
		expect((await new DesignRepo(later.github, REF).listProjects())[0]?.updatedAt).toBe('2026-10-06T12:00:00Z');
		// A comment made after: GitHub dates the thread by its latest comment.
		const commented = fakeGitHub({
			...routes,
			'/repos/acme/design/commits?path=projects/alpha*': commits,
			'/repos/acme/design/issues?state=all*': [
				{ number: 7, comments: 3, updated_at: '2026-10-08T08:00:00Z', body: 'Review thread for alpha, branch: `fd/alpha/i2`.' },
			],
		});
		expect((await new DesignRepo(commented.github, REF).listProjects())[0]?.updatedAt).toBe('2026-10-08T08:00:00Z');
	});

	it('has no date for activity it cannot read, and does not fail the list for it', async () => {
		const { github: session } = fakeGitHub({
			...routes,
			'/repos/acme/design/commits?path=projects/alpha*': () => {
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
});

describe('comments', () => {
	const base = {
		'/repos/acme/design/issues?state=all*': [{ number: 7, comments: 1, body: 'branch: `fd/alpha/i1`' }],
		'/repos/acme/design/issues/7/comments*': [
			{ id: 1, user: { login: 'pm', avatar_url: 'a' }, body: 'Make the chip bigger', created_at: '2026-10-05T10:00:00Z' },
			{ id: 2, user: { login: 'noah' }, body: 'Fixed <!-- resolved -->', created_at: '2026-10-05T11:00:00Z' },
		],
	};

	it('reads comments and marks which are resolved', async () => {
		const { github: session } = fakeGitHub(base);
		const comments = await new ReviewThreads(session, REF).readComments('fd/alpha/i1');
		expect(comments.map((c) => [c.author, c.resolved])).toEqual([
			['pm', false],
			['noah', true],
		]);
		expect(comments[1]?.body).toBe('Fixed');
	});

	it('returns nothing for an iteration with no thread yet, rather than failing', async () => {
		const { github: session } = fakeGitHub({ '/repos/acme/design/issues?state=all*': [] });
		expect(await new ReviewThreads(session, REF).readComments('fd/alpha/i9')).toEqual([]);
	});

	it('creates the thread on the first comment, labeled and naming its branch', async () => {
		const { github: session, writes } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [],
			'/repos/acme/design/issues*': { number: 12 },
			'/repos/acme/design/issues/12/comments*': { id: 99, user: { login: 'pm' }, body: 'hi', created_at: 'now' },
		});
		const posted = await new ReviewThreads(session, REF).postComment('alpha', 'fd/alpha/i1', 'hi');
		expect(posted.id).toBe(99);

		const created = writes.find((w) => w.path === '/repos/acme/design/issues');
		const body = created?.body as { labels: string[]; body: string };
		expect(body.labels).toContain('flock-designer:review');
		// The branch line is how the app finds this thread again.
		expect(body.body).toContain('`fd/alpha/i1`');
	});

	it('reuses an existing thread instead of opening a second one', async () => {
		const { github: session, writes } = fakeGitHub({
			...base,
			'/repos/acme/design/issues/7/comments*': { id: 100, user: { login: 'pm' }, body: 'x', created_at: 'now' },
		});
		await new ReviewThreads(session, REF).postComment('alpha', 'fd/alpha/i1', 'x');
		expect(writes.filter((w) => w.path === '/repos/acme/design/issues')).toHaveLength(0);
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
			'/repos/acme/design/commits?path=projects/alpha*': [
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
			'/repos/acme/design/commits?path=projects/alpha*': () => {
				throw new Error('rate limited');
			},
		});
		expect((await new DesignRepo(session, REF).listProjects())[0]?.people).toEqual([]);
	});
});

describe('comment threads and GitHub listing lag', () => {
	/** A repository whose issue *listing* never shows what was just created, as GitHub's does for ten seconds or more. */
	const lagging = () => {
		const created: Array<{ number: number }> = [];
		const comments = new Map<number, Array<Record<string, unknown>>>();
		const { github } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [], // the listing has not caught up
			'POST /repos/acme/design/issues': () => {
				const number = created.length + 10;
				created.push({ number });
				comments.set(number, []);
				return { number };
			},
			'/repos/acme/design/issues/*': ({ method, path, body }: RouteCall) => {
				const n = Number(/\/issues\/(\d+)\/comments/.exec(path)?.[1]);
				const thread = comments.get(n) ?? [];
				if (method !== 'POST') return thread;
				const c = {
					id: thread.length + 1,
					user: { login: 'noah' },
					body: (body as { body: string }).body,
					created_at: `2026-10-05T10:00:0${thread.length}Z`,
				};
				thread.push(c);
				return c;
			},
		});
		return { repo: new ReviewThreads(github, REF), created };
	};

	it('puts a second comment in the same thread even though the listing has not caught up', async () => {
		const { repo, created } = lagging();
		await repo.postComment('alpha', 'fd/alpha/i1', 'first');
		await repo.postComment('alpha', 'fd/alpha/i1', 'second');
		expect(created).toHaveLength(1);
	});

	it('shows a comment straight after it is posted', async () => {
		const { repo } = lagging();
		await repo.postComment('alpha', 'fd/alpha/i1', 'hello');
		expect((await repo.readComments('fd/alpha/i1')).map((c) => c.body)).toEqual(['hello']);
	});

	it('reads every thread for a branch, so duplicates made earlier are not lost', async () => {
		const mk = (n: number, at: string, body: string) => [{ id: n, user: { login: 'noah' }, body, created_at: at }];
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [
				{ number: 3, comments: 1, body: 'branch: `fd/alpha/i1`' },
				{ number: 2, comments: 1, body: 'branch: `fd/alpha/i1`' },
			],
			'/repos/acme/design/issues/2/comments*': mk(2, '2026-10-05T10:00:00Z', 'This is cool'),
			'/repos/acme/design/issues/3/comments*': mk(3, '2026-10-05T10:00:18Z', 'asdasd'),
		});
		expect((await new ReviewThreads(session, REF).readComments('fd/alpha/i1')).map((c) => c.body)).toEqual(['This is cool', 'asdasd']);
	});

	it('writes to the oldest thread when several exist', async () => {
		const { github: session, writes } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [
				{ number: 3, comments: 1, body: 'branch: `fd/alpha/i1`' },
				{ number: 2, comments: 1, body: 'branch: `fd/alpha/i1`' },
			],
			'/repos/acme/design/issues/2/comments*': { id: 9, user: { login: 'noah' }, body: 'x', created_at: 'now' },
		});
		await new ReviewThreads(session, REF).postComment('alpha', 'fd/alpha/i1', 'x');
		expect(writes.map((w) => w.path)).toEqual(['/repos/acme/design/issues/2/comments']);
	});
});

describe('moveComment', () => {
	const COMMENT = '/repos/acme/design/issues/comments/55';
	const before = {
		route: '/users',
		selector: 'main',
		nearbyText: 'x',
		viewport: { width: 1, height: 1 },
		commit: 'abc1234',
		offset: { x: 0.1, y: 0.1 },
	};
	const after = { ...before, selector: '#new', commit: '', offset: { x: 0.9, y: 0.5 } };

	it("rewrites the pin's position, keeps the words, and keeps the commit it was made against", async () => {
		const { composeBody, parseAnchor, stripAnchor } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 55, user: { login: 'noah' }, created_at: 'then', body: composeBody('Make this primary', before) },
		});
		const moved = await new ReviewThreads(session, REF).moveComment(55, after);
		const sent = (writes[0]?.body as { body: string }).body;
		expect(writes[0]).toMatchObject({ path: COMMENT, method: 'PATCH' });
		expect(stripAnchor(sent)).toBe('Make this primary');
		expect(parseAnchor(sent)).toMatchObject({ selector: '#new', offset: { x: 0.9, y: 0.5 }, commit: 'abc1234' });
		expect(moved.id).toBe(55);
	});

	it("keeps the comment's picture when its pin moves", async () => {
		const { composeBody, parsePicture } = await import('../src/shared/anchor');
		const picture = `data:image/jpeg;base64,${Buffer.from('a small picture').toString('base64')}`;
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 55, user: { login: 'noah' }, created_at: 't', body: composeBody('Make this primary', before, picture) },
		});
		await new ReviewThreads(session, REF).moveComment(55, after);
		expect(parsePicture((writes[0]?.body as { body: string }).body)).toBe(picture);
	});

	it('keeps a comment resolved if it was', async () => {
		const { composeBody } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 55, user: { login: 'noah' }, created_at: 't', body: `${composeBody('done', before)}\n<!-- resolved -->` },
		});
		await new ReviewThreads(session, REF).moveComment(55, after);
		expect((writes[0]?.body as { body: string }).body).toContain('<!-- resolved -->');
	});
});

describe('setResolved', () => {
	const COMMENT = '/repos/acme/design/issues/comments/70';
	const anchor = { route: '/users', selector: 'main', nearbyText: 'x', viewport: { width: 1, height: 1 }, commit: 'abc1234' };

	it('marks an open comment resolved, and changes nothing else about it', async () => {
		const { composeBody, parseAnchor, stripAnchor } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: composeBody('Make this primary', anchor) },
		});
		const result = await new ReviewThreads(session, REF).setResolved(70, true);
		const sent = (writes[0]?.body as { body: string }).body;
		expect(writes[0]).toMatchObject({ path: COMMENT, method: 'PATCH' });
		expect(sent).toContain('<!-- resolved -->');
		expect(stripAnchor(sent.replace('<!-- resolved -->', '').trim())).toBe('Make this primary');
		expect(parseAnchor(sent)).toMatchObject({ selector: 'main', commit: 'abc1234' });
		expect(result.resolved).toBe(false); // the stub returns the old body; the real API returns the new one
	});

	it('reads the new state back from what GitHub returns', async () => {
		const { github: session } = fakeGitHub({
			[`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off <!-- resolved -->' },
		});
		expect((await new ReviewThreads(session, REF).setResolved(70, true)).resolved).toBe(true);
	});

	it('reopens a resolved comment by removing the marker only', async () => {
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off\n<!-- resolved -->' },
		});
		await new ReviewThreads(session, REF).setResolved(70, false);
		expect((writes[0]?.body as { body: string }).body).toBe('Looks off');
	});

	it('reopens one the agent addressed as an ordinary open comment, so it can be addressed again', async () => {
		const { addressedAt, isResolved, withAddressed, withResolved } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: withResolved(withAddressed('Looks off', 'abc1234', 'v1-i2'), true) },
		});
		await new ReviewThreads(session, REF).setResolved(70, false);
		const sent = (writes[0]?.body as { body: string }).body;
		expect(isResolved(sent)).toBe(false);
		expect(addressedAt(sent)).toBeNull();
		expect(sent).toBe('Looks off');
	});

	it('writes nothing when the comment is already in the state asked for', async () => {
		const { github: session, writes } = fakeGitHub({ [`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off' } });
		await new ReviewThreads(session, REF).setResolved(70, false);
		expect(writes).toEqual([]);
	});

	it("passes GitHub's refusal on, so someone who may not edit a comment is told so", async () => {
		const { github } = fakeGitHub({
			[`PATCH ${COMMENT}`]: () => {
				throw refusal(403, 'Resource not accessible by integration');
			},
			[COMMENT]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'x' },
		});
		await expect(new ReviewThreads(github, REF).setResolved(70, true)).rejects.toThrow(/not accessible/);
	});
});

describe('setAddressed', () => {
	const COMMENT = '/repos/acme/design/issues/comments/70';
	const SHA = 'abc1234def56';
	const comment = (body: string) => ({ [`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body } });
	const sentBody = (writes: Array<{ body?: unknown }>) => (writes[0]?.body as { body: string }).body;

	it('resolves the comment in the same write that records the change, so its pin leaves the page at once', async () => {
		const { isResolved, addressedAt, addressedIn } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub(comment('Remove this'));
		await new ReviewThreads(session, REF).setAddressed(70, SHA, 'v1-i2');
		expect(writes).toHaveLength(1);
		expect(isResolved(sentBody(writes))).toBe(true);
		expect(addressedAt(sentBody(writes))).toBe(SHA);
		expect(addressedIn(sentBody(writes))).toBe('v1-i2');
	});

	it('resolves a comment on a branch too, which has a commit and no iteration', async () => {
		const { isResolved, addressedAt } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub(comment('Remove this'));
		await new ReviewThreads(session, REF).setAddressed(70, SHA);
		expect(isResolved(sentBody(writes))).toBe(true);
		expect(addressedAt(sentBody(writes))).toBe(SHA);
	});

	it('writes nothing when it is already recorded and resolved', async () => {
		const { withAddressed, withResolved } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub(comment(withResolved(withAddressed('Remove this', SHA, 'v1-i2'), true)));
		await new ReviewThreads(session, REF).setAddressed(70, SHA, 'v1-i2');
		expect(writes).toEqual([]);
	});

	it('when a run changed nothing, clears the mark and leaves open or resolved as the person had it', async () => {
		const { isResolved, addressedAt, withAddressed } = await import('../src/shared/anchor');
		const open = fakeGitHub(comment(withAddressed('Remove this', SHA)));
		await new ReviewThreads(open.github, REF).setAddressed(70, null);
		expect(addressedAt(sentBody(open.writes))).toBeNull();
		expect(isResolved(sentBody(open.writes))).toBe(false);
		// Reopened by the person since: nothing here closes it again.
		const reopened = fakeGitHub(comment('Remove this'));
		await new ReviewThreads(reopened.github, REF).setAddressed(70, null);
		expect(reopened.writes).toEqual([]);
	});
});

describe('pictures on comments', () => {
	const picture = `data:image/jpeg;base64,${Buffer.from('a small picture').toString('base64')}`;
	const anchor = { route: '/users', selector: 'main', nearbyText: 'x', viewport: { width: 1, height: 1 }, commit: '' };

	it('posts the picture with the comment, and reads it back', async () => {
		const stored: string[] = [];
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [{ number: 4, comments: 0, body: 'branch: `fd/alpha/i1`' }],
			'/repos/acme/design/issues/4/comments*': () => ({ id: 9, user: { login: 'noah' }, body: stored[0] ?? '', created_at: 'now' }),
		});
		const api = session as unknown as { api: (p: string, i?: { method?: string; body?: { body: string } }) => unknown };
		const original = api.api;
		api.api = async (p, i) => {
			if (i?.method === 'POST' && i.body) stored[0] = i.body.body;
			return original(p, i);
		};
		const posted = await new ReviewThreads(session, REF).postComment('alpha', 'fd/alpha/i1', 'Make this primary', anchor, picture);
		expect(posted.picture).toBe(picture);
		expect(posted.body).toBe('Make this primary');
	});

	it('reads a comment with no picture as having none', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [{ number: 4, comments: 1, body: 'branch: `fd/alpha/i1`' }],
			'/repos/acme/design/issues/4/comments*': [{ id: 1, user: { login: 'noah' }, body: 'plain', created_at: 'now' }],
		});
		expect((await new ReviewThreads(session, REF).readComments('fd/alpha/i1'))[0]?.picture).toBeNull();
	});
});

describe('reading past one page', () => {
	const many = (n: number, from = 1) =>
		Array.from({ length: n }, (_, i) => ({
			id: from + i,
			user: { login: 'pm' },
			body: `c${from + i}`,
			created_at: `2026-10-05T10:${String(Math.floor((from + i) / 60)).padStart(2, '0')}:${String((from + i) % 60).padStart(2, '0')}Z`,
		}));
	const thread = [{ number: 4, comments: 150, body: 'branch: `fd/alpha/i1`' }];

	it('reads every comment on a thread of more than a hundred', async () => {
		const { github: session, api } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': thread,
			'/repos/acme/design/issues/4/comments*': ({ path: p }: RouteCall) => (/[&?]page=1$/.test(p) ? many(100) : many(50, 101)),
		});
		const comments = await new ReviewThreads(session, REF).readComments('fd/alpha/i1');
		expect(comments).toHaveLength(150);
		expect(new Set(comments.map((c) => c.id)).size).toBe(150);
		expect(api.mock.calls.filter(([p]) => String(p).includes('/issues/4/comments')).length).toBe(2);
	});

	it('stops after a short page, without asking for another', async () => {
		const { github: session, api } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': thread,
			'/repos/acme/design/issues/4/comments*': many(30),
		});
		await new ReviewThreads(session, REF).readComments('fd/alpha/i1');
		expect(api.mock.calls.filter(([p]) => String(p).includes('/issues/4/comments')).length).toBe(1);
	});

	it('asks for one more page after exactly a hundred, and takes an empty one as the end', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': thread,
			'/repos/acme/design/issues/4/comments*': ({ path: p }: RouteCall) => (/[&?]page=1$/.test(p) ? many(100) : []),
		});
		expect(await new ReviewThreads(session, REF).readComments('fd/alpha/i1')).toHaveLength(100);
	});

	it('says so, rather than quietly dropping the rest, when a thread is longer than it will read', async () => {
		const { github: session } = fakeGitHub({ '/repos/acme/design/issues?state=all*': thread, '/repos/acme/design/issues/4/comments*': many(100) });
		await expect(new ReviewThreads(session, REF).readComments('fd/alpha/i1')).rejects.toThrow(/more than 2000/);
	});

	it('finds a review thread that is on the second page of threads', async () => {
		const filler = Array.from({ length: 100 }, (_, i) => ({ number: 1000 + i, comments: 0, body: `branch: \`fd/other/i${i}\`` }));
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': ({ path: p }: RouteCall) =>
				/[&?]page=1$/.test(p) ? filler : [{ number: 7, comments: 2, body: 'branch: `fd/alpha/i1`' }],
			'/repos/acme/design/issues/7/comments*': [{ id: 1, user: { login: 'pm' }, body: 'late', created_at: 'now' }],
		});
		expect((await new ReviewThreads(session, REF).readComments('fd/alpha/i1')).map((c) => c.body)).toEqual(['late']);
	});
});

describe('deleteComment', () => {
	const COMMENT = '/repos/acme/design/issues/comments/70';
	const failing = (status: number, message: string) =>
		fakeGitHub({
			'*': () => {
				throw refusal(status, message);
			},
		}).github;

	it('deletes by comment id, with a DELETE and nothing else', async () => {
		const { github: session, writes } = fakeGitHub({ [`${COMMENT}*`]: null });
		await new ReviewThreads(session, REF).deleteComment(70);
		expect(writes).toEqual([{ path: COMMENT, method: 'DELETE' }]);
	});

	it('counts a comment that is already gone as deleted, because someone else got there first', async () => {
		await expect(new ReviewThreads(failing(404, 'Not found'), REF).deleteComment(70)).resolves.toBeUndefined();
	});

	it("says who is allowed when GitHub refuses, in place of GitHub's own wording", async () => {
		await expect(new ReviewThreads(failing(403, 'Must have admin rights to Repository.'), REF).deleteComment(70)).rejects.toThrow(
			/author, or someone who can write to the design repository/,
		);
	});

	it('lets any other failure through, so a dropped connection is not mistaken for a delete', async () => {
		await expect(new ReviewThreads(failing(502, 'Bad gateway'), REF).deleteComment(70)).rejects.toThrow('Bad gateway');
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

describe('readFile and writeFile', () => {
	const notFound = () => {
		throw refusal(404);
	};

	it('reads any file as text, and says null when there is none', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/skills/a.md*': { content: b64('# A'), sha: 'a1' },
			'/repos/acme/design/contents/skills/b.md*': notFound,
		});
		const repo = new RepoFiles(session, REF);
		expect(await repo.readFile('skills/a.md')).toBe('# A');
		expect(await repo.readFile('skills/b.md')).toBeNull();
	});

	it('says null for a file that is not there, and fails on anything else', async () => {
		// Every transport says "not there" one way (`HostError`); the command line's own is checked in ghCli.spec.
		const repo = new RepoFiles(fakeGitHub({ '*': notFound }).github, REF);
		expect(await repo.readFile('skills/none.md')).toBeNull();
		expect(await repo.readFileAt('skills/none.md', 'some-branch')).toBeNull();
		expect(await repo.hasFile('skills/none.md')).toBe(false);
		const failing = new RepoFiles(
			fakeGitHub({
				'*': () => {
					throw refusal(500, 'Server Error');
				},
			}).github,
			REF,
		);
		await expect(failing.readFile('skills/a.md')).rejects.toThrow('Server Error');
	});

	it('reads an empty file as empty, not as none and not as a failure: it is there, with nothing written in it yet', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/standards/flock/voice-and-tone.md*': {
				content: '',
				encoding: 'base64',
				sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
			},
		});
		const repo = new RepoFiles(session, REF);
		expect(await repo.readFile('standards/flock/voice-and-tone.md')).toBe('');
		expect(await repo.readFileAt('standards/flock/voice-and-tone.md')).toEqual({ text: '', sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391' });
	});

	it('reads a file on a branch with its sha, which a write to it is made against', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/skills/a.md?ref=dsnr%2Fvoice-20261010-ab12*': { content: b64('# A'), sha: 'a1' },
		});
		expect(await new RepoFiles(session, REF).readFileAt('skills/a.md', 'dsnr/voice-20261010-ab12')).toEqual({ text: '# A', sha: 'a1' });
	});

	it('reads a file over 1 MB through its blob, as GitHub leaves its content out', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/contents/projects/x/prototypes/i1.html*': { encoding: 'none', content: '', sha: 'big1' },
			'/repos/acme/design/git/blobs/big1*': { sha: 'f1', content: b64('<html>a large page</html>'), encoding: 'base64' },
		});
		expect(await new RepoFiles(session, REF).readFile('projects/x/prototypes/i1.html')).toBe('<html>a large page</html>');
	});

	it('creates a file, and replaces one with the sha it has', async () => {
		const { github, writes } = fakeGitHub({
			'PUT /repos/acme/design/contents/*': {},
			'GET /repos/acme/design/contents/projects/x/new.html*': notFound,
			'GET /repos/acme/design/contents/*': { sha: 'abc' },
		});
		const repo = new RepoFiles(github, REF);
		await repo.writeFile('projects/x/new.html', '<p>', 'm');
		await repo.writeFile('projects/x/old.html', '<p>', 'm');
		expect(writes).toEqual([
			{ method: 'PUT', path: '/repos/acme/design/contents/projects/x/new.html', body: { message: 'm', content: b64('<p>') } },
			{ method: 'PUT', path: '/repos/acme/design/contents/projects/x/old.html', body: { message: 'm', content: b64('<p>'), sha: 'abc' } },
		]);
	});

	it('writes again once, against what is there now, when another write got in between', async () => {
		let puts = 0;
		const { github, writes } = fakeGitHub({
			'PUT /repos/acme/design/contents/*': () => {
				if (++puts === 1) throw refusal(409, 'is at abd but expected abc');
				return {};
			},
			'GET /repos/acme/design/contents/*': () => ({ sha: puts === 0 ? 'abc' : 'abd' }),
		});
		await new RepoFiles(github, REF).writeFile('projects/x/a.html', '<p>', 'm');
		expect(writes.map((w) => (w.body as { sha?: string }).sha)).toEqual(['abc', 'abd']);
	});

	it('writes a picture as the bytes it is, and reads one back as bytes', async () => {
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x80, 0xfe]);
		const { github, writes } = fakeGitHub({
			'PUT /repos/acme/design/contents/*': {},
			'GET /repos/acme/design/contents/projects/x/covers/there.jpg*': { sha: 's1', content: jpeg.toString('base64'), encoding: 'base64' },
			'GET /repos/acme/design/contents/*': notFound,
		});
		const repo = new RepoFiles(github, REF);
		await repo.writeFile('projects/x/covers/v1-i1-aaaaaaaaaaaa.jpg', jpeg, 'm');
		expect(writes).toEqual([
			{
				method: 'PUT',
				path: '/repos/acme/design/contents/projects/x/covers/v1-i1-aaaaaaaaaaaa.jpg',
				body: { message: 'm', content: jpeg.toString('base64') },
			},
		]);
		expect(await repo.readBytes('projects/x/covers/there.jpg')).toEqual(jpeg);
		expect(await repo.readBytes('projects/x/covers/none.jpg')).toBeNull();
	});

	it('says what access is needed when GitHub refuses the write', async () => {
		await expect(new RepoFiles(fakeGitHub({ '*': notFound }).github, REF).writeFile('projects/x/a.html', 'x', 'm')).rejects.toThrow(
			/write access to the design repository/,
		);
	});
});
