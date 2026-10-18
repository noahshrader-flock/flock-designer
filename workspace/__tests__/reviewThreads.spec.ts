import { describe, expect, it } from 'vitest';
import { ReviewThreads } from '../src/host/reviewThreads';
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
			'/repos/acme/design/issues?state=all*': [], // the listing has not caught up
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

describe('setAddressed', () => {
	const COMMENT = '/repos/acme/design/issues/comments/70';
	const SHA = 'abc1234def56';
	const comment = (body: string) => ({ [`${COMMENT}*`]: { id: 70, user: { login: 'pm' }, created_at: 't', body } });
	const sentBody = (writes: Array<{ body?: unknown }>) => (writes[0]?.body as { body: string }).body;

	it('resolves the comment in the same write that records the change, so its pin leaves the page at once', async () => {
		const { isResolved, addressedAt, addressedIn } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub(comment('Remove this'));
		await new ReviewThreads(session, REF).setAddressed({ thread: 1, id: 70 }, SHA, 'v10');
		expect(writes).toHaveLength(1);
		expect(isResolved(sentBody(writes))).toBe(true);
		expect(addressedAt(sentBody(writes))).toBe(SHA);
		expect(addressedIn(sentBody(writes))).toBe('v10');
	});

	it('resolves a comment on a branch too, which has a commit and no version', async () => {
		const { isResolved, addressedAt } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub(comment('Remove this'));
		await new ReviewThreads(session, REF).setAddressed({ thread: 1, id: 70 }, SHA);
		expect(isResolved(sentBody(writes))).toBe(true);
		expect(addressedAt(sentBody(writes))).toBe(SHA);
	});

	it('writes nothing when it is already recorded and resolved', async () => {
		const { withAddressed, withResolved } = await import('../src/shared/anchor');
		const { github: session, writes } = fakeGitHub(comment(withResolved(withAddressed('Remove this', SHA, 'v10'), true)));
		await new ReviewThreads(session, REF).setAddressed({ thread: 1, id: 70 }, SHA, 'v10');
		expect(writes).toEqual([]);
	});

	it('when a run changed nothing, clears the mark and leaves open or resolved as the person had it', async () => {
		const { isResolved, addressedAt, withAddressed } = await import('../src/shared/anchor');
		const open = fakeGitHub(comment(withAddressed('Remove this', SHA)));
		await new ReviewThreads(open.github, REF).setAddressed({ thread: 1, id: 70 }, null);
		expect(addressedAt(sentBody(open.writes))).toBeNull();
		expect(isResolved(sentBody(open.writes))).toBe(false);
		// Reopened by the person since: nothing here closes it again.
		const reopened = fakeGitHub(comment('Remove this'));
		await new ReviewThreads(reopened.github, REF).setAddressed({ thread: 1, id: 70 }, null);
		expect(reopened.writes).toEqual([]);
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
	it('are counted together, with the latest comment of any of them as when the branch last had one', async () => {
		const { github } = fakeGitHub({
			'/repos/acme/design/issues?state=all*': [
				{ number: 3, comments: 2, updated_at: '2026-10-05T10:00:00Z', body: 'branch: `prototype/alpha/v1`' },
				{ number: 2, comments: 1, updated_at: '2026-10-07T10:00:00Z', body: 'branch: `prototype/alpha/v1`' },
				{ number: 4, comments: 5, body: 'branch: `prototype/beta/v1`' },
			],
		});
		const threads = new ReviewThreads(github, REF);
		expect((await threads.byBranch()).get('prototype/alpha/v1')).toEqual({
			number: 2,
			numbers: [3, 2],
			openComments: 3,
			updatedAt: '2026-10-07T10:00:00Z',
		});
		expect(await threads.commentCounts()).toEqual(
			new Map([
				['prototype/alpha/v1', 3],
				['prototype/beta/v1', 5],
			]),
		);
	});
});
