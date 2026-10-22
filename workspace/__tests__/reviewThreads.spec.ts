import { describe, expect, it } from 'vitest';
import { ReviewThreads } from '../src/codeHost/reviewThreads';
import { fakeGitHub, refusal, refusing } from './fakes/github';
import { anAnchor } from './fixtures';

const REF = { owner: 'acme', repo: 'design' };

describe('comments', () => {
	const base = {
		'/repos/acme/design/issues?state=all*': [{ number: 7, comments: 1, body: 'branch: `prototype/alpha/v1`' }],
		'/repos/acme/design/issues/7/comments*': [
			{ id: 1, user: { login: 'pm', avatar_url: 'a' }, body: 'Make the chip bigger', created_at: '2026-10-05T10:00:00Z' },
			{ id: 2, user: { login: 'noah' }, body: 'Fixed <!-- resolved -->', created_at: '2026-10-05T11:00:00Z' },
		],
	};

	it('reads comments and marks which are resolved', async () => {
		const { github: session } = fakeGitHub(base);
		const comments = await new ReviewThreads(session, REF).readComments('prototype/alpha/v1');
		expect(comments.map((c) => [c.author, c.resolved])).toEqual([
			['pm', false],
			['noah', true],
		]);
		expect(comments[1]?.body).toBe('Fixed');
	});

	it('returns nothing for a version with no thread yet, rather than failing', async () => {
		const { github: session } = fakeGitHub({ '/repos/acme/design/issues?state=all*': [] });
		expect(await new ReviewThreads(session, REF).readComments('prototype/alpha/v9')).toEqual([]);
	});

	it('creates the thread on the first comment, labeled and naming its branch', async () => {
		const { github: session, writes } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [],
			'/repos/acme/design/issues*': { number: 12 },
			'/repos/acme/design/issues/12/comments*': { id: 99, user: { login: 'pm' }, body: 'hi', created_at: 'now' },
		});
		const posted = await new ReviewThreads(session, REF).postComment('alpha', 'prototype/alpha/v1', 'hi');
		expect(posted.id).toBe(99);

		const created = writes.find((w) => w.path === '/repos/acme/design/issues');
		const body = created?.body as { labels: string[]; body: string };
		expect(body.labels).toContain('flock-designer:review');
		// The branch line is how the app finds this thread again.
		expect(body.body).toContain('`prototype/alpha/v1`');
	});

	it('reuses an existing thread instead of opening a second one', async () => {
		const { github: session, writes } = fakeGitHub({
			...base,
			'/repos/acme/design/issues/7/comments*': { id: 100, user: { login: 'pm' }, body: 'x', created_at: 'now' },
		});
		await new ReviewThreads(session, REF).postComment('alpha', 'prototype/alpha/v1', 'x');
		expect(writes.filter((w) => w.path === '/repos/acme/design/issues')).toHaveLength(0);
	});
});

describe('comment threads and GitHub listing lag', () => {
	/** A repository whose issue *listing* never shows what was just created, as GitHub's does for ten seconds or more. */
	const lagging = () => {
		const created: Array<{ number: number }> = [];
		const comments = new Map<number, Array<Record<string, unknown>>>();
		const { github } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [],
			'POST /repos/acme/design/issues': () => {
				const number = created.length + 10;
				created.push({ number });
				comments.set(number, []);
				return { number };
			},
			'/repos/acme/design/issues/*': ({ method, path, body }) => {
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
		await repo.postComment('alpha', 'prototype/alpha/v1', 'first');
		await repo.postComment('alpha', 'prototype/alpha/v1', 'second');
		expect(created).toHaveLength(1);
	});

	it('shows a comment straight after it is posted', async () => {
		const { repo } = lagging();
		await repo.postComment('alpha', 'prototype/alpha/v1', 'hello');
		expect((await repo.readComments('prototype/alpha/v1')).map((c) => c.body)).toEqual(['hello']);
	});

	it('reads every thread for a branch, so duplicates made earlier are not lost', async () => {
		const mk = (n: number, at: string, body: string) => [{ id: n, user: { login: 'noah' }, body, created_at: at }];
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [
				{ number: 3, comments: 1, body: 'branch: `prototype/alpha/v1`' },
				{ number: 2, comments: 1, body: 'branch: `prototype/alpha/v1`' },
			],
			'/repos/acme/design/issues/2/comments*': mk(2, '2026-10-05T10:00:00Z', 'This is cool'),
			'/repos/acme/design/issues/3/comments*': mk(3, '2026-10-05T10:00:18Z', 'asdasd'),
		});
		const comments = await new ReviewThreads(session, REF).readComments('prototype/alpha/v1');
		expect(comments.map((c) => c.body)).toEqual(['This is cool', 'asdasd']);
		// Each with the thread it was read from, not the oldest of them: a host that finds a comment by its thread needs it.
		expect(comments.map((c) => [c.thread, c.id])).toEqual([
			[2, 2],
			[3, 3],
		]);
	});

	it('writes to the oldest thread when several exist', async () => {
		const { github: session, writes } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [
				{ number: 3, comments: 1, body: 'branch: `prototype/alpha/v1`' },
				{ number: 2, comments: 1, body: 'branch: `prototype/alpha/v1`' },
			],
			'/repos/acme/design/issues/2/comments*': { id: 9, user: { login: 'noah' }, body: 'x', created_at: 'now' },
		});
		await new ReviewThreads(session, REF).postComment('alpha', 'prototype/alpha/v1', 'x');
		expect(writes.map((w) => w.path)).toEqual(['/repos/acme/design/issues/2/comments']);
	});
});

describe('moveComment', () => {
	const COMMENT = '/repos/acme/design/issues/comments/55';
	const before = anAnchor({ route: '/users', nearbyText: 'x', commit: 'abc1234', offset: { x: 0.1, y: 0.1 } });
	const after = { ...before, selector: '#new', commit: '', offset: { x: 0.9, y: 0.5 } };

	it("rewrites the pin's position, keeps the words, and keeps the commit it was made against", async () => {
		const { composeBody, parseAnchor, stripAnchor } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 55, user: { login: 'noah' }, created_at: 'then', body: composeBody('Make this primary', before) },
		});
		const moved = await new ReviewThreads(session, REF).moveComment({ thread: 1, id: 55 }, after);
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
		await new ReviewThreads(session, REF).moveComment({ thread: 1, id: 55 }, after);
		expect(parsePicture((writes[0]?.body as { body: string }).body)).toBe(picture);
	});

	it('keeps a comment resolved if it was', async () => {
		const { composeBody } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 55, user: { login: 'noah' }, created_at: 't', body: `${composeBody('done', before)}\n<!-- resolved -->` },
		});
		await new ReviewThreads(session, REF).moveComment({ thread: 1, id: 55 }, after);
		expect((writes[0]?.body as { body: string }).body).toContain('<!-- resolved -->');
	});
});

describe('setResolved', () => {
	const COMMENT = '/repos/acme/design/issues/comments/70';
	const anchor = anAnchor({ route: '/users', nearbyText: 'x', commit: 'abc1234' });

	it('marks an open comment resolved, and changes nothing else about it', async () => {
		const { composeBody, parseAnchor, stripAnchor } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: composeBody('Make this primary', anchor) },
		});
		const result = await new ReviewThreads(session, REF).setResolved({ thread: 1, id: 70 }, true);
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
		expect((await new ReviewThreads(session, REF).setResolved({ thread: 1, id: 70 }, true)).resolved).toBe(true);
	});

	it('reopens a resolved comment by removing the marker only', async () => {
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off\n<!-- resolved -->' },
		});
		await new ReviewThreads(session, REF).setResolved({ thread: 1, id: 70 }, false);
		expect((writes[0]?.body as { body: string }).body).toBe('Looks off');
	});

	it('reopens one the agent addressed as an ordinary open comment, so it can be addressed again', async () => {
		const { addressedAt, isResolved, withAddressed, withResolved } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub({
			[`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: withResolved(withAddressed('Looks off', 'abc1234', 'v10'), true) },
		});
		await new ReviewThreads(session, REF).setResolved({ thread: 1, id: 70 }, false);
		const sent = (writes[0]?.body as { body: string }).body;
		expect(isResolved(sent)).toBe(false);
		expect(addressedAt(sent)).toBeNull();
		expect(sent).toBe('Looks off');
	});

	it('writes nothing when the comment is already in the state asked for', async () => {
		const { github: session, writes } = fakeGitHub({ [`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off' } });
		await new ReviewThreads(session, REF).setResolved({ thread: 1, id: 70 }, false);
		expect(writes).toEqual([]);
	});

	it("passes GitHub's refusal on, so someone who may not edit a comment is told so", async () => {
		const { github } = fakeGitHub({
			[`PATCH ${COMMENT}`]: () => {
				throw refusal(403, 'Resource not accessible by integration');
			},
			[COMMENT]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'x' },
		});
		await expect(new ReviewThreads(github, REF).setResolved({ thread: 1, id: 70 }, true)).rejects.toThrow(/not accessible/);
	});
});

describe('pictures on comments', () => {
	const picture = `data:image/jpeg;base64,${Buffer.from('a small picture').toString('base64')}`;
	const anchor = anAnchor({ route: '/users', nearbyText: 'x' });

	it('posts the picture with the comment, and reads it back', async () => {
		const stored: string[] = [];
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [{ number: 4, comments: 0, body: 'branch: `prototype/alpha/v1`' }],
			'/repos/acme/design/issues/4/comments*': () => ({ id: 9, user: { login: 'noah' }, body: stored[0] ?? '', created_at: 'now' }),
		});
		const api = session as unknown as { api: (p: string, i?: { method?: string; body?: { body: string } }) => unknown };
		const original = api.api;
		api.api = async (p, i) => {
			if (i?.method === 'POST' && i.body) stored[0] = i.body.body;
			return original(p, i);
		};
		const posted = await new ReviewThreads(session, REF).postComment('alpha', 'prototype/alpha/v1', 'Make this primary', anchor, picture);
		expect(posted.picture).toBe(picture);
		expect(posted.body).toBe('Make this primary');
	});

	it('reads a comment with no picture as having none', async () => {
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [{ number: 4, comments: 1, body: 'branch: `prototype/alpha/v1`' }],
			'/repos/acme/design/issues/4/comments*': [{ id: 1, user: { login: 'noah' }, body: 'plain', created_at: 'now' }],
		});
		expect((await new ReviewThreads(session, REF).readComments('prototype/alpha/v1'))[0]?.picture).toBeNull();
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
	const thread = [{ number: 4, comments: 150, body: 'branch: `prototype/alpha/v1`' }];

	it('reads every comment on a thread of more than a hundred', async () => {
		const { github: session, api } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': thread,
			'/repos/acme/design/issues/4/comments*': ({ path: p }) => (/[&?]page=1$/.test(p) ? many(100) : many(50, 101)),
		});
		const comments = await new ReviewThreads(session, REF).readComments('prototype/alpha/v1');
		expect(comments).toHaveLength(150);
		expect(new Set(comments.map((c) => c.id)).size).toBe(150);
		expect(api.mock.calls.filter(([p]) => String(p).includes('/issues/4/comments')).length).toBe(2);
	});

	it('says so, rather than quietly dropping the rest, when a thread is longer than it will read', async () => {
		const { github: session } = fakeGitHub({ '/repos/acme/design/issues?state=all*': thread, '/repos/acme/design/issues/4/comments*': many(100) });
		await expect(new ReviewThreads(session, REF).readComments('prototype/alpha/v1')).rejects.toThrow(/more than 2000/);
	});

	it('finds a review thread that is on the second page of threads', async () => {
		const filler = Array.from({ length: 100 }, (_, i) => ({ number: 1000 + i, comments: 0, body: `branch: \`fd/other/i${i}\`` }));
		const { github: session } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': ({ path: p }) =>
				/[&?]page=1$/.test(p) ? filler : [{ number: 7, comments: 2, body: 'branch: `prototype/alpha/v1`' }],
			'/repos/acme/design/issues/7/comments*': [{ id: 1, user: { login: 'pm' }, body: 'late', created_at: 'now' }],
		});
		expect((await new ReviewThreads(session, REF).readComments('prototype/alpha/v1')).map((c) => c.body)).toEqual(['late']);
	});
});

describe('deleteComment', () => {
	const COMMENT = '/repos/acme/design/issues/comments/70';
	const failing = (status: number, message: string) => fakeGitHub({ '*': refusing(status, message) }).github;

	it('deletes by comment id, with a DELETE and nothing else', async () => {
		const { github: session, writes } = fakeGitHub({ [`${COMMENT}*`]: null });
		await new ReviewThreads(session, REF).deleteComment({ thread: 1, id: 70 });
		expect(writes).toEqual([{ path: COMMENT, method: 'DELETE' }]);
	});

	it('counts a comment that is already gone as deleted, because someone else got there first', async () => {
		await expect(new ReviewThreads(failing(404, 'Not found'), REF).deleteComment({ thread: 1, id: 70 })).resolves.toBeUndefined();
	});

	it("says who is allowed when GitHub refuses, in place of GitHub's own wording", async () => {
		await expect(new ReviewThreads(failing(403, 'Must have admin rights to Repository.'), REF).deleteComment({ thread: 1, id: 70 })).rejects.toThrow(
			/author, or someone who can write to the design repository/,
		);
	});

	it('lets any other failure through, so a dropped connection is not mistaken for a delete', async () => {
		await expect(new ReviewThreads(failing(502, 'Bad gateway'), REF).deleteComment({ thread: 1, id: 70 })).rejects.toThrow('Bad gateway');
	});
});

describe('the threads of a branch', () => {
	const resolved = ' <!-- resolved -->';
	const comment = (id: number, body: string) => ({ id, user: { login: 'pm' }, body, created_at: `2026-10-05T10:00:0${id}Z` });
	const listing = [
		{ number: 3, state: 'open', comments: 2, updated_at: '2026-10-05T10:00:00Z', body: 'branch: `prototype/alpha/v1`' },
		{ number: 2, state: 'open', comments: 1, updated_at: '2026-10-07T10:00:00Z', body: 'branch: `prototype/alpha/v1`' },
		{ number: 4, state: 'open', comments: 5, body: 'branch: `prototype/beta/v1`' },
		{ number: 5, state: 'closed', comments: 3, body: 'branch: `prototype/gamma/v1`' },
	];
	const threads = () =>
		fakeGitHub({
			'/repos/acme/design/issues?state=all*': listing,
			'/repos/acme/design/issues/3/comments*': [comment(1, 'Bigger'), comment(2, `Done${resolved}`)],
			'/repos/acme/design/issues/2/comments*': [comment(3, 'Bluer')],
			'/repos/acme/design/issues/4/comments*': refusing(503),
		});

	it('are counted together, with the latest comment of any of them as when the branch last had one', async () => {
		const { github } = threads();
		expect((await new ReviewThreads(github, REF).byBranch()).get('prototype/alpha/v1')).toEqual({
			number: 2,
			numbers: [3, 2],
			openComments: 0,
			updatedAt: '2026-10-07T10:00:00Z',
		});
	});

	it('count the comments not resolved, when asked: those of every thread of the branch, none for a closed issue', async () => {
		const { github, calls } = threads();
		const counted = await new ReviewThreads(github, REF).byBranch({ counting: true });
		expect(counted.get('prototype/alpha/v1')?.openComments).toBe(2);
		expect(counted.get('prototype/gamma/v1')?.openComments).toBe(0);
		// A closed issue's comments are not read at all.
		expect(calls.some((c) => c.path.includes('/issues/5/comments'))).toBe(false);
	});

	it('are not counted unless asked, as every change to a comment asks for the threads and none needs a count', async () => {
		const { github, calls } = threads();
		await new ReviewThreads(github, REF).byBranch();
		expect(calls.filter((c) => c.path.includes('/comments'))).toEqual([]);
	});

	it('fall back to what the listing says for a thread whose comments cannot be read, rather than fail the list', async () => {
		const { github } = threads();
		expect((await new ReviewThreads(github, REF).byBranch({ counting: true })).get('prototype/beta/v1')?.openComments).toBe(5);
	});
});

describe('a thread’s issue, open while a comment in it is', () => {
	const ISSUE = '/repos/acme/design/issues/7';
	/** One thread, its comments as given and its issue open or closed; what is written to the issue is what is checked. */
	const thread = (bodies: string[], state: 'open' | 'closed') => {
		const comments = bodies.map((body, i) => ({ id: i + 1, user: { login: 'noah' }, body, created_at: `2026-10-05T10:00:0${i}Z` }));
		const fake = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [{ number: 7, comments: comments.length, body: 'branch: `prototype/alpha/v1`' }],
			[`GET ${ISSUE}/comments*`]: () => comments,
			[`GET ${ISSUE}`]: { number: 7, state },
			[`PATCH ${ISSUE}`]: { number: 7 },
			'GET /repos/acme/design/issues/comments/*': ({ path }) => comments.find((c) => path.endsWith(`/${c.id}`)) ?? null,
			'PATCH /repos/acme/design/issues/comments/*': ({ path, body }) => {
				const c = comments.find((x) => path.endsWith(`/${x.id}`))!;
				c.body = (body as { body: string }).body;
				return c;
			},
			'DELETE /repos/acme/design/issues/comments/*': ({ path }) => {
				comments.splice(
					comments.findIndex((c) => path.endsWith(`/${c.id}`)),
					1,
				);
				return null;
			},
			[`POST ${ISSUE}/comments`]: ({ body }) => {
				const c = { id: comments.length + 1, user: { login: 'pm' }, body: (body as { body: string }).body, created_at: '2026-10-05T11:00:00Z' };
				comments.push(c);
				return c;
			},
		});
		const issueWrites = () => fake.writes.filter((w) => w.path === ISSUE).map((w) => w.body);
		return { threads: new ReviewThreads(fake.github, REF), issueWrites };
	};

	it('is closed, as done, when its last open comment is resolved', async () => {
		const t = thread(['Bigger', 'Done <!-- resolved -->'], 'open');
		await t.threads.setResolved({ thread: 7, id: 1 }, true);
		expect(t.issueWrites()).toEqual([{ state: 'closed', state_reason: 'completed' }]);
	});

	it('is left open while another comment in it still is', async () => {
		const t = thread(['Bigger', 'Bluer'], 'open');
		await t.threads.setResolved({ thread: 7, id: 1 }, true);
		expect(t.issueWrites()).toEqual([]);
	});

	it('is opened again when a comment in it is reopened, or a new one is written', async () => {
		const reopened = thread(['Bigger <!-- resolved -->'], 'closed');
		await reopened.threads.setResolved({ thread: 7, id: 1 }, false);
		expect(reopened.issueWrites()).toEqual([{ state: 'open' }]);
		const written = thread(['Bigger <!-- resolved -->'], 'closed');
		await written.threads.postComment('alpha', 'prototype/alpha/v1', 'And bluer');
		expect(written.issueWrites()).toEqual([{ state: 'open' }]);
	});

	it('is closed when the last open comment is deleted, and left as it is when nothing about it changed', async () => {
		const t = thread(['Bigger', 'Done <!-- resolved -->'], 'open');
		await t.threads.deleteComment({ thread: 7, id: 1 });
		expect(t.issueWrites()).toEqual([{ state: 'closed', state_reason: 'completed' }]);
		const same = thread(['Done <!-- resolved -->'], 'closed');
		await same.threads.setResolved({ thread: 7, id: 1 }, true);
		expect(same.issueWrites()).toEqual([]);
	});

	it('does not fail the comment’s own change when the issue cannot be set: the next change sets it', async () => {
		const { github } = fakeGitHub({
			'GET /repos/acme/design/issues/comments/1': { id: 1, user: { login: 'noah' }, body: 'Bigger', created_at: 'now' },
			'PATCH /repos/acme/design/issues/comments/1': { id: 1, user: { login: 'noah' }, body: 'Bigger <!-- resolved -->', created_at: 'now' },
			'GET /repos/acme/design/issues/7/comments*': refusing(503),
		});
		expect((await new ReviewThreads(github, REF).setResolved({ thread: 7, id: 1 }, true)).resolved).toBe(true);
	});
});

describe('a deleted prototype’s threads', () => {
	const listing = [
		{ number: 7, comments: 2, body: 'branch: `prototype/alpha/v1`' },
		{ number: 8, comments: 1, body: 'branch: `prototype/alpha/v2`' },
		{ number: 9, comments: 1, body: 'branch: `feature/alpha`' },
		{ number: 10, comments: 1, body: 'branch: `prototype/alphabet/v1`' },
		{ number: 11, comments: 1, body: 'branch: `prototype/beta/v1`' },
	];
	const deleting = (labels: (n: number) => unknown = () => []) => {
		const fake = fakeGitHub({
			'/repos/acme/design/issues?state=all*': listing,
			'POST /repos/acme/design/issues/*': { id: 1 },
			'PATCH /repos/acme/design/issues/*': {},
			'DELETE /repos/acme/design/issues/*': ({ path }) => labels(Number(/issues\/(\d+)\//.exec(path)?.[1])),
		});
		return { threads: new ReviewThreads(fake.github, REF), writes: fake.writes };
	};

	it('are each closed as not planned, with a note, and taken off the review label: every version’s and the recorded work’s, no other prototype’s', async () => {
		const d = deleting();
		expect(await d.threads.closeDeleted('alpha', ['prototype/alpha/v1', 'feature/alpha'])).toBe(3);
		const by = (n: number) =>
			d.writes.filter((w) => w.path.startsWith(`/repos/acme/design/issues/${n}`)).map((w) => [w.method, w.path.split(`/${n}`)[1], w.body]);
		for (const n of [7, 8, 9])
			expect(by(n)).toEqual([
				['POST', '/comments', { body: 'alpha was deleted in DSNR, so this review is closed. Its comments stay here.' }],
				['PATCH', '', { state: 'closed', state_reason: 'not_planned' }],
				['DELETE', '/labels/flock-designer%3Areview', undefined],
			]);
		// A prototype whose id only starts the same, and another prototype, are not this one.
		expect(by(10)).toEqual([]);
		expect(by(11)).toEqual([]);
	});

	it('count a label already taken off as taken off, and stop at any other failure, which is said', async () => {
		const gone = deleting(() => {
			throw refusal(404);
		});
		expect(await gone.threads.closeDeleted('alpha', [])).toBe(2);
		const failing = deleting(() => {
			throw refusal(403);
		});
		await expect(failing.threads.closeDeleted('alpha', [])).rejects.toThrow();
	});
});
