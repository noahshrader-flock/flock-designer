import { describe, expect, it, vi } from 'vitest';
import { DesignRepo } from '../src/main/services/designRepo';
import { GitHubError } from '../src/main/services/github';
import type { GitHubSession } from '../src/main/services/githubSession';

/** Routes fake API responses by path, and records writes. */
const fakeSession = (routes: Record<string, unknown>) => {
  const writes: Array<{ path: string; method?: string; body?: unknown }> = [];
  const api = vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
    if (init.method && init.method !== 'GET') writes.push({ path, ...init });
    const key = Object.keys(routes)
      .filter((r) => path.startsWith(r))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) throw new Error(`no stub for ${path}`);
    const value = routes[key];
    return typeof value === 'function' ? (value as (p: string) => unknown)(path) : value;
  });
  return { session: { api } as unknown as GitHubSession, api, writes };
};

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const REF = { owner: 'acme', repo: 'design' };

const ITERATIONS = [
  { projectId: 'alpha', name: 'i1', branch: 'fd/alpha/i1', commit: null, createdAt: '2026-10-01', note: '' },
  { projectId: 'alpha', name: 'i2', branch: 'fd/alpha/i2', commit: null, createdAt: '2026-10-02', note: '', previewUrl: 'https://preview.test/alpha-i2' },
  { projectId: 'alpha', name: 'codebase', branch: 'feature/alpha', commit: null, createdAt: '2026-10-03', note: '' },
];

describe('listProjects', () => {
  const routes = {
    '/repos/acme/design/contents/projects/alpha': [
      { type: 'file', name: 'brief.md' },
      { type: 'file', name: 'iterations.json' },
      { type: 'file', name: 'review.md' },
    ],
    '/repos/acme/design/contents/projects': [
      { type: 'dir', name: 'alpha' },
      { type: 'file', name: 'README.md' },
      { type: 'dir', name: '_template' },
    ],
    '/repos/acme/design/contents/projects/alpha/brief.md': { content: b64('# Inactive users\n') },
    '/repos/acme/design/contents/projects/alpha/iterations.json': { content: b64(JSON.stringify(ITERATIONS)) },
    '/repos/acme/design/issues?state=all': [
      { number: 7, comments: 3, body: 'Review thread for alpha, branch: `fd/alpha/i2`.' },
    ],
  };

  it('reads when each iteration was started from its record, and treats anything else as unknown', async () => {
    const { session } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha/iterations.json': {
        content: b64(JSON.stringify([...ITERATIONS.slice(0, 2).map((i, n) => ({ ...i, createdAt: n === 0 ? '2026-10-01T00:00:00Z' : 'someday' }))])),
      },
    });
    const [alpha] = await new DesignRepo(session, REF).listProjects();
    expect(alpha?.iterations.map((i) => [i.name, i.createdAt]).sort()).toEqual([['i1', '2026-10-01T00:00:00Z'], ['i2', null]]);
  });

  it('lists project folders, skipping files and templates', async () => {
    const { session } = fakeSession(routes);
    expect((await new DesignRepo(session, REF).listProjects()).map((p) => p.id)).toEqual(['alpha']);
  });

  it('reads the title from the brief, and falls back to the id', async () => {
    const { session } = fakeSession(routes);
    expect((await new DesignRepo(session, REF).listProjects())[0]?.title).toBe('Inactive users');

    const noBrief = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha': [{ type: 'file', name: 'iterations.json' }],
    });
    expect((await new DesignRepo(noBrief.session, REF).listProjects())[0]?.title).toBe('alpha');
  });

  it('reads iterations from the project folder, not from branches', async () => {
    // The regression: iteration branches live in the PRODUCT repository, which
    // this app cannot see. Looking for them in the design repo listed "No
    // branches yet" for every project, including ones with iterations.
    const { session, api } = fakeSession(routes);
    const [alpha] = await new DesignRepo(session, REF).listProjects();
    expect(alpha?.iterations.map((i) => i.branch)).toEqual(['fd/alpha/i2', 'fd/alpha/i1', 'feature/alpha']);
    expect(api.mock.calls.some(([path]) => path.includes('/branches'))).toBe(false);
  });

  it('puts prototype iterations newest first and the codebase branch last', async () => {
    const { session } = fakeSession(routes);
    const [alpha] = await new DesignRepo(session, REF).listProjects();
    expect(alpha?.iterations.map((i) => i.name)).toEqual(['i2', 'i1', 'codebase']);
  });

  it('carries a recorded preview link through', async () => {
    const { session } = fakeSession(routes);
    const [alpha] = await new DesignRepo(session, REF).listProjects();
    expect(alpha?.iterations.find((i) => i.name === 'i2')?.previewUrl).toBe('https://preview.test/alpha-i2');
    expect(alpha?.iterations.find((i) => i.name === 'i1')?.previewUrl).toBeNull();
  });

  it('shows no iterations, not an error, for a project that has none recorded', async () => {
    const { session } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha': [{ type: 'file', name: 'brief.md' }],
    });
    expect((await new DesignRepo(session, REF).listProjects())[0]?.iterations).toEqual([]);
  });

  it('shows no iterations, not an error, when the record is unreadable', async () => {
    const { session } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha/iterations.json': { content: b64('{ not json') },
    });
    expect((await new DesignRepo(session, REF).listProjects())[0]?.iterations).toEqual([]);
  });

  it('links an iteration to its review thread and counts open comments', async () => {
    const { session } = fakeSession(routes);
    const [alpha] = await new DesignRepo(session, REF).listProjects();
    expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i2')?.issueNumber).toBe(7);
    expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i1')?.issueNumber).toBeNull();
    expect(alpha?.openComments).toBe(3);
  });

  it('only ever calls the repository API', async () => {
    const { session, api } = fakeSession(routes);
    await new DesignRepo(session, REF).listProjects();
    // Reviewer mode's whole promise: no clone, no git, nothing outside the repo.
    expect(api.mock.calls.every(([path]) => path.startsWith('/repos/acme/design/'))).toBe(true);
  });
});

describe('comments', () => {
  const base = {
    '/repos/acme/design/issues?state=all': [
      { number: 7, comments: 1, body: 'branch: `fd/alpha/i1`' },
    ],
    '/repos/acme/design/issues/7/comments': [
      { id: 1, user: { login: 'pm', avatar_url: 'a' }, body: 'Make the chip bigger', created_at: '2026-10-05T10:00:00Z' },
      { id: 2, user: { login: 'noah' }, body: 'Fixed <!-- resolved -->', created_at: '2026-10-05T11:00:00Z' },
    ],
  };

  it('reads comments and marks which are resolved', async () => {
    const { session } = fakeSession(base);
    const comments = await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1');
    expect(comments.map((c) => [c.author, c.resolved])).toEqual([
      ['pm', false],
      ['noah', true],
    ]);
    expect(comments[1]?.body).toBe('Fixed');
  });

  it('returns nothing for an iteration with no thread yet, rather than failing', async () => {
    const { session } = fakeSession({ '/repos/acme/design/issues?state=all': [] });
    expect(await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i9')).toEqual([]);
  });

  it('creates the thread on the first comment, labelled and naming its branch', async () => {
    const { session, writes } = fakeSession({
      '/repos/acme/design/issues?state=all': [],
      '/repos/acme/design/issues': { number: 12 },
      '/repos/acme/design/issues/12/comments': { id: 99, user: { login: 'pm' }, body: 'hi', created_at: 'now' },
    });
    const posted = await new DesignRepo(session, REF).postComment('alpha', 'fd/alpha/i1', 'hi');
    expect(posted.id).toBe(99);

    const created = writes.find((w) => w.path === '/repos/acme/design/issues');
    const body = created?.body as { labels: string[]; body: string };
    expect(body.labels).toContain('flock-designer:review');
    // The branch line is how the app finds this thread again.
    expect(body.body).toContain('`fd/alpha/i1`');
  });

  it('reuses an existing thread instead of opening a second one', async () => {
    const { session, writes } = fakeSession({
      ...base,
      '/repos/acme/design/issues/7/comments': { id: 100, user: { login: 'pm' }, body: 'x', created_at: 'now' },
    });
    await new DesignRepo(session, REF).postComment('alpha', 'fd/alpha/i1', 'x');
    expect(writes.filter((w) => w.path === '/repos/acme/design/issues')).toHaveLength(0);
  });
});

describe('contributors', () => {
  it('shows everyone: code authors from the record plus people who committed to the folder', async () => {
    const records = [
      { projectId: 'alpha', name: 'i1', branch: 'fd/alpha/i1', commit: null, createdAt: '', note: '', contributors: [{ name: 'Ada Lovelace', login: null }, 'Grace Hopper'] },
      { projectId: 'alpha', name: 'i2', branch: 'fd/alpha/i2', commit: null, createdAt: '', note: '', contributors: [{ name: 'Grace Hopper', login: 'ghopper' }] },
    ];
    const { session } = fakeSession({
      '/repos/acme/design/contents/projects/alpha/iterations.json': { content: b64(JSON.stringify(records)) },
      '/repos/acme/design/contents/projects/alpha': [{ type: 'file', name: 'iterations.json' }],
      '/repos/acme/design/contents/projects': [{ type: 'dir', name: 'alpha' }],
      '/repos/acme/design/issues?state=all': [],
      '/repos/acme/design/commits?path=projects/alpha': [
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
    const { session } = fakeSession({
      '/repos/acme/design/contents/projects/alpha': [],
      '/repos/acme/design/contents/projects': [{ type: 'dir', name: 'alpha' }],
      '/repos/acme/design/issues?state=all': [],
      '/repos/acme/design/commits?path=projects/alpha': () => {
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
    const api = vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      if (path.includes('/issues?state=all')) return []; // the listing has not caught up
      if (path.endsWith('/issues') && init.method === 'POST') {
        const number = created.length + 10;
        created.push({ number });
        comments.set(number, []);
        return { number };
      }
      const m = /\/issues\/(\d+)\/comments/.exec(path);
      if (m) {
        const n = Number(m[1]);
        if (init.method === 'POST') {
          const c = { id: comments.get(n)!.length + 1, user: { login: 'noah' }, body: (init.body as { body: string }).body, created_at: `2026-10-05T10:00:0${comments.get(n)!.length}Z` };
          comments.get(n)!.push(c);
          return c;
        }
        return comments.get(n) ?? [];
      }
      throw new Error(`no stub for ${path}`);
    });
    return { repo: new DesignRepo({ api } as unknown as GitHubSession, REF), created };
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
    expect((await repo.readComments('alpha', 'fd/alpha/i1')).map((c) => c.body)).toEqual(['hello']);
  });

  it('reads every thread for a branch, so duplicates made earlier are not lost', async () => {
    const mk = (n: number, at: string, body: string) => [{ id: n, user: { login: 'noah' }, body, created_at: at }];
    const { session } = fakeSession({
      '/repos/acme/design/issues?state=all': [
        { number: 3, comments: 1, body: 'branch: `fd/alpha/i1`' },
        { number: 2, comments: 1, body: 'branch: `fd/alpha/i1`' },
      ],
      '/repos/acme/design/issues/2/comments': mk(2, '2026-10-05T10:00:00Z', 'This is cool'),
      '/repos/acme/design/issues/3/comments': mk(3, '2026-10-05T10:00:18Z', 'asdasd'),
    });
    expect((await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1')).map((c) => c.body)).toEqual(['This is cool', 'asdasd']);
  });

  it('writes to the oldest thread when several exist', async () => {
    const { session, writes } = fakeSession({
      '/repos/acme/design/issues?state=all': [
        { number: 3, comments: 1, body: 'branch: `fd/alpha/i1`' },
        { number: 2, comments: 1, body: 'branch: `fd/alpha/i1`' },
      ],
      '/repos/acme/design/issues/2/comments': { id: 9, user: { login: 'noah' }, body: 'x', created_at: 'now' },
    });
    await new DesignRepo(session, REF).postComment('alpha', 'fd/alpha/i1', 'x');
    expect(writes.map((w) => w.path)).toEqual(['/repos/acme/design/issues/2/comments']);
  });
});

describe('moveComment', () => {
  const COMMENT = '/repos/acme/design/issues/comments/55';
  const before = {
    route: '/users', selector: 'main', nearbyText: 'x', viewport: { width: 1, height: 1 }, commit: 'abc123', offset: { x: 0.1, y: 0.1 },
  };
  const after = { ...before, selector: '#new', commit: '', offset: { x: 0.9, y: 0.5 } };

  it("rewrites the pin's position, keeps the words, and keeps the commit it was made against", async () => {
    const { composeBody, parseAnchor, stripAnchor } = await import('../src/shared/anchor');
    const { session, writes } = fakeSession({
      [COMMENT]: { id: 55, user: { login: 'noah' }, created_at: 'then', body: composeBody('Make this primary', before) },
    });
    const moved = await new DesignRepo(session, REF).moveComment(55, after);
    const sent = (writes[0]?.body as { body: string }).body;
    expect(writes[0]).toMatchObject({ path: COMMENT, method: 'PATCH' });
    expect(stripAnchor(sent)).toBe('Make this primary');
    expect(parseAnchor(sent)).toMatchObject({ selector: '#new', offset: { x: 0.9, y: 0.5 }, commit: 'abc123' });
    expect(moved.id).toBe(55);
  });

  it('keeps the comment\'s picture when its pin moves', async () => {
    const { composeBody, parsePicture } = await import('../src/shared/anchor');
    const picture = `data:image/jpeg;base64,${Buffer.from('a small picture').toString('base64')}`;
    const { session, writes } = fakeSession({
      [COMMENT]: { id: 55, user: { login: 'noah' }, created_at: 't', body: composeBody('Make this primary', before, picture) },
    });
    await new DesignRepo(session, REF).moveComment(55, after);
    expect(parsePicture((writes[0]?.body as { body: string }).body)).toBe(picture);
  });

  it('keeps a comment resolved if it was', async () => {
    const { composeBody } = await import('../src/shared/anchor');
    const { session, writes } = fakeSession({
      [COMMENT]: { id: 55, user: { login: 'noah' }, created_at: 't', body: `${composeBody('done', before)}\n<!-- resolved -->` },
    });
    await new DesignRepo(session, REF).moveComment(55, after);
    expect((writes[0]?.body as { body: string }).body).toContain('<!-- resolved -->');
  });
});

describe('setResolved', () => {
  const COMMENT = '/repos/acme/design/issues/comments/70';
  const anchor = { route: '/users', selector: 'main', nearbyText: 'x', viewport: { width: 1, height: 1 }, commit: 'abc123' };

  it('marks an open comment resolved, and changes nothing else about it', async () => {
    const { composeBody, parseAnchor, stripAnchor } = await import('../src/shared/anchor');
    const { session, writes } = fakeSession({
      [COMMENT]: { id: 70, user: { login: 'pm' }, created_at: 't', body: composeBody('Make this primary', anchor) },
    });
    const result = await new DesignRepo(session, REF).setResolved(70, true);
    const sent = (writes[0]?.body as { body: string }).body;
    expect(writes[0]).toMatchObject({ path: COMMENT, method: 'PATCH' });
    expect(sent).toContain('<!-- resolved -->');
    expect(stripAnchor(sent.replace('<!-- resolved -->', '').trim())).toBe('Make this primary');
    expect(parseAnchor(sent)).toMatchObject({ selector: 'main', commit: 'abc123' });
    expect(result.resolved).toBe(false); // the stub returns the old body; the real API returns the new one
  });

  it('reads the new state back from what GitHub returns', async () => {
    const { session } = fakeSession({ [COMMENT]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off <!-- resolved -->' } });
    expect((await new DesignRepo(session, REF).setResolved(70, true)).resolved).toBe(true);
  });

  it('reopens a resolved comment by removing the marker only', async () => {
    const { session, writes } = fakeSession({ [COMMENT]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off\n<!-- resolved -->' } });
    await new DesignRepo(session, REF).setResolved(70, false);
    expect((writes[0]?.body as { body: string }).body).toBe('Looks off');
  });

  it('writes nothing when the comment is already in the state asked for', async () => {
    const { session, writes } = fakeSession({ [COMMENT]: { id: 70, user: { login: 'pm' }, created_at: 't', body: 'Looks off' } });
    await new DesignRepo(session, REF).setResolved(70, false);
    expect(writes).toEqual([]);
  });

  it("passes GitHub's refusal on, so someone who may not edit a comment is told so", async () => {
    const api = vi.fn(async (_p: string, init: { method?: string } = {}) => {
      if (init.method === 'PATCH') throw new GitHubError('Resource not accessible by integration', 403);
      return { id: 70, user: { login: 'pm' }, created_at: 't', body: 'x' };
    });
    await expect(new DesignRepo({ api } as unknown as GitHubSession, REF).setResolved(70, true)).rejects.toThrow(/not accessible/);
  });
});

describe('pictures on comments', () => {
  const picture = `data:image/jpeg;base64,${Buffer.from('a small picture').toString('base64')}`;
  const anchor = { route: '/users', selector: 'main', nearbyText: 'x', viewport: { width: 1, height: 1 }, commit: '' };

  it('posts the picture with the comment, and reads it back', async () => {
    const stored: string[] = [];
    const { session } = fakeSession({
      '/repos/acme/design/issues?state=all': [{ number: 4, comments: 0, body: 'branch: `fd/alpha/i1`' }],
      '/repos/acme/design/issues/4/comments': (_p: string) => ({ id: 9, user: { login: 'noah' }, body: stored[0] ?? '', created_at: 'now' }),
    });
    const api = session as unknown as { api: (p: string, i?: { method?: string; body?: { body: string } }) => unknown };
    const original = api.api;
    api.api = async (p, i) => {
      if (i?.method === 'POST' && i.body) stored[0] = i.body.body;
      return original(p, i);
    };
    const posted = await new DesignRepo(session, REF).postComment('alpha', 'fd/alpha/i1', 'Make this primary', anchor, picture);
    expect(posted.picture).toBe(picture);
    expect(posted.body).toBe('Make this primary');
  });

  it('reads a comment with no picture as having none', async () => {
    const { session } = fakeSession({
      '/repos/acme/design/issues?state=all': [{ number: 4, comments: 1, body: 'branch: `fd/alpha/i1`' }],
      '/repos/acme/design/issues/4/comments': [{ id: 1, user: { login: 'noah' }, body: 'plain', created_at: 'now' }],
    });
    expect((await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1'))[0]?.picture).toBeNull();
  });
});

describe('reading past one page', () => {
  const many = (n: number, from = 1) =>
    Array.from({ length: n }, (_, i) => ({ id: from + i, user: { login: 'pm' }, body: `c${from + i}`, created_at: `2026-10-05T10:${String(Math.floor((from + i) / 60)).padStart(2, '0')}:${String((from + i) % 60).padStart(2, '0')}Z` }));
  const thread = [{ number: 4, comments: 150, body: 'branch: `fd/alpha/i1`' }];

  it('reads every comment on a thread of more than a hundred', async () => {
    const { session, api } = fakeSession({
      '/repos/acme/design/issues?state=all': thread,
      '/repos/acme/design/issues/4/comments': (p: string) => (/[&?]page=1$/.test(p) ? many(100) : many(50, 101)),
    });
    const comments = await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1');
    expect(comments).toHaveLength(150);
    expect(new Set(comments.map((c) => c.id)).size).toBe(150);
    expect(api.mock.calls.filter(([p]) => String(p).includes('/issues/4/comments')).length).toBe(2);
  });

  it('stops after a short page, without asking for another', async () => {
    const { session, api } = fakeSession({ '/repos/acme/design/issues?state=all': thread, '/repos/acme/design/issues/4/comments': many(30) });
    await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1');
    expect(api.mock.calls.filter(([p]) => String(p).includes('/issues/4/comments')).length).toBe(1);
  });

  it('asks for one more page after exactly a hundred, and takes an empty one as the end', async () => {
    const { session } = fakeSession({
      '/repos/acme/design/issues?state=all': thread,
      '/repos/acme/design/issues/4/comments': (p: string) => (/[&?]page=1$/.test(p) ? many(100) : []),
    });
    expect(await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1')).toHaveLength(100);
  });

  it('says so, rather than quietly dropping the rest, when a thread is longer than it will read', async () => {
    const { session } = fakeSession({ '/repos/acme/design/issues?state=all': thread, '/repos/acme/design/issues/4/comments': many(100) });
    await expect(new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1')).rejects.toThrow(/more than 2000/);
  });

  it('finds a review thread that is on the second page of threads', async () => {
    const filler = Array.from({ length: 100 }, (_, i) => ({ number: 1000 + i, comments: 0, body: `branch: \`fd/other/i${i}\`` }));
    const { session } = fakeSession({
      '/repos/acme/design/issues?state=all': (p: string) => (/[&?]page=1$/.test(p) ? filler : [{ number: 7, comments: 2, body: 'branch: `fd/alpha/i1`' }]),
      '/repos/acme/design/issues/7/comments': [{ id: 1, user: { login: 'pm' }, body: 'late', created_at: 'now' }],
    });
    expect((await new DesignRepo(session, REF).readComments('alpha', 'fd/alpha/i1')).map((c) => c.body)).toEqual(['late']);
  });
});

describe('deleteComment', () => {
  const COMMENT = '/repos/acme/design/issues/comments/70';
  const failing = (status: number, message: string) =>
    ({ api: vi.fn(async () => { throw new GitHubError(message, status); }) }) as unknown as GitHubSession;

  it('deletes by comment id, with a DELETE and nothing else', async () => {
    const { session, writes } = fakeSession({ [COMMENT]: null });
    await new DesignRepo(session, REF).deleteComment(70);
    expect(writes).toEqual([{ path: COMMENT, method: 'DELETE' }]);
  });

  it('counts a comment that is already gone as deleted, because someone else got there first', async () => {
    await expect(new DesignRepo(failing(404, 'Not found'), REF).deleteComment(70)).resolves.toBeUndefined();
  });

  it("says who is allowed when GitHub refuses, in place of GitHub's own wording", async () => {
    await expect(new DesignRepo(failing(403, 'Must have admin rights to Repository.'), REF).deleteComment(70)).rejects.toThrow(
      /author, or someone who can write to the design repository/,
    );
  });

  it('lets any other failure through, so a dropped connection is not mistaken for a delete', async () => {
    await expect(new DesignRepo(failing(502, 'Bad gateway'), REF).deleteComment(70)).rejects.toThrow('Bad gateway');
  });
});


describe('readRecord', () => {
  it('reads one file of a project as text', async () => {
    const { session, api } = fakeSession({
      '/repos/acme/design/contents/projects/alpha/review.md': { content: b64('# Review\nnotes ✓') },
    });
    expect(await new DesignRepo(session, REF).readRecord('alpha', 'review.md')).toBe('# Review\nnotes ✓');
    expect(api).toHaveBeenCalledWith('/repos/acme/design/contents/projects/alpha/review.md');
  });

  it('says so when GitHub returns something that is not a file', async () => {
    const { session } = fakeSession({ '/repos/acme/design/contents/projects/alpha/docs': [] });
    await expect(new DesignRepo(session, REF).readRecord('alpha', 'docs')).rejects.toThrow(/could not be read/);
  });
});

describe('readFile and writeFile', () => {
  const notFound = () => {
    throw new GitHubError('Not Found', 404);
  };

  it('reads any file as text, and says null when there is none', async () => {
    const { session } = fakeSession({ '/repos/acme/design/contents/skills/a.md': { content: b64('# A') }, '/repos/acme/design/contents/skills/b.md': notFound });
    const repo = new DesignRepo(session, REF);
    expect(await repo.readFile('skills/a.md')).toBe('# A');
    expect(await repo.readFile('skills/b.md')).toBeNull();
  });

  it('reads a file over 1 MB through its blob, as GitHub leaves its content out', async () => {
    const { session } = fakeSession({
      '/repos/acme/design/contents/projects/x/quick/q1.html': { encoding: 'none', content: '', sha: 'big1' },
      '/repos/acme/design/git/blobs/big1': { content: b64('<html>a large page</html>'), encoding: 'base64' },
    });
    expect(await new DesignRepo(session, REF).readFile('projects/x/quick/q1.html')).toBe('<html>a large page</html>');
  });

  it("creates a file, and replaces one with the sha it has", async () => {
    const writes: unknown[] = [];
    const api = vi.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      if (init.method === 'PUT') return writes.push({ path, body: init.body }), {};
      if (path.endsWith('new.html')) throw new GitHubError('Not Found', 404);
      return { sha: 'abc' };
    });
    const repo = new DesignRepo({ api } as never, REF);
    await repo.writeFile('projects/x/new.html', '<p>', 'm');
    await repo.writeFile('projects/x/old.html', '<p>', 'm');
    expect(writes).toEqual([
      { path: '/repos/acme/design/contents/projects/x/new.html', body: { message: 'm', content: b64('<p>') } },
      { path: '/repos/acme/design/contents/projects/x/old.html', body: { message: 'm', content: b64('<p>'), sha: 'abc' } },
    ]);
  });

  it('says what access is needed when GitHub refuses the write', async () => {
    const api = vi.fn(async (_path: string, init: { method?: string } = {}) => {
      if (init.method === 'PUT') throw new GitHubError('Not Found', 404);
      throw new GitHubError('Not Found', 404);
    });
    await expect(new DesignRepo({ api } as never, REF).writeFile('projects/x/a.html', 'x', 'm')).rejects.toThrow(/write access to the design repository/);
  });
});
