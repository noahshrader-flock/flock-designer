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

describe('publishIterations', () => {
  const FILE = '/repos/acme/design/contents/projects/alpha/iterations.json';
  const local = [{ projectId: 'alpha', name: 'i1', branch: 'fd/alpha/i1', commit: 'abc', createdAt: '2026-10-01', note: '' }];
  const decode = (w: { body?: unknown }) =>
    JSON.parse(Buffer.from((w.body as { content: string }).content, 'base64').toString('utf8')) as Array<Record<string, unknown>>;

  it('creates the record when the project has none', async () => {
    // The first call is the read, which finds nothing; the write that follows succeeds.
    let calls = 0;
    const { session, writes } = fakeSession({
      [FILE]: () => {
        if (calls++ === 0) throw new GitHubError('Not found', 404);
        return {};
      },
    });
    await new DesignRepo(session, REF).publishIterations('alpha', local);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.method).toBe('PUT');
    expect((writes[0]?.body as { sha?: string }).sha).toBeUndefined();
    expect(decode(writes[0]!).map((i) => i.name)).toEqual(['i1']);
  });

  it('keeps iterations and fields only the repository has, and sends the sha', async () => {
    const remote = [
      { ...local[0], commit: null, previewUrl: 'https://preview.test/i1' },
      { projectId: 'alpha', name: 'i2', branch: 'fd/alpha/i2', commit: null, createdAt: '2026-10-02', note: 'theirs' },
    ];
    const { session, writes } = fakeSession({ [FILE]: { sha: 'old', content: b64(JSON.stringify(remote)) } });
    await new DesignRepo(session, REF).publishIterations('alpha', local);
    const written = decode(writes[0]!);
    expect(written.map((i) => i.name)).toEqual(['i1', 'i2']);
    expect(written[0]).toMatchObject({ commit: 'abc', previewUrl: 'https://preview.test/i1' });
    expect((writes[0]?.body as { sha: string }).sha).toBe('old');
  });

  it('writes nothing when the record is already current', async () => {
    const { session, writes } = fakeSession({ [FILE]: { sha: 's', content: b64(JSON.stringify(local)) } });
    await new DesignRepo(session, REF).publishIterations('alpha', local);
    expect(writes).toHaveLength(0);
  });

  it('reads again and merges once when someone else wrote first', async () => {
    let reads = 0;
    let puts = 0;
    const api = vi.fn(async (_p: string, init: { method?: string; body?: unknown } = {}) => {
      if (init.method === 'PUT') {
        puts++;
        if (puts === 1) throw new GitHubError('conflict', 409);
        return {};
      }
      reads++;
      return { sha: `s${reads}`, content: b64(JSON.stringify([])) };
    });
    await new DesignRepo({ api } as unknown as GitHubSession, REF).publishIterations('alpha', local);
    expect(puts).toBe(2);
    expect(reads).toBe(2);
  });
});

describe('contributors', () => {
  it('shows everyone: code authors from the record plus people who committed to the folder', async () => {
    const records = [
      { projectId: 'alpha', name: 'i1', branch: 'fd/alpha/i1', commit: null, createdAt: '', note: '', contributors: ['Ada Lovelace', 'Grace Hopper'] },
      { projectId: 'alpha', name: 'i2', branch: 'fd/alpha/i2', commit: null, createdAt: '', note: '', contributors: ['Grace Hopper'] },
    ];
    const { session } = fakeSession({
      '/repos/acme/design/contents/projects/alpha/iterations.json': { content: b64(JSON.stringify(records)) },
      '/repos/acme/design/contents/projects/alpha': [{ type: 'file', name: 'iterations.json' }],
      '/repos/acme/design/contents/projects': [{ type: 'dir', name: 'alpha' }],
      '/repos/acme/design/issues?state=all': [],
      '/repos/acme/design/commits?path=projects/alpha': [
        { commit: { author: { name: 'Noah Shrader' } } },
        { commit: { author: { name: 'github-actions[bot]' } } },
        { commit: { author: { name: 'Ada Lovelace' } } },
      ],
    });
    const [project] = await new DesignRepo(session, REF).listProjects();
    expect(project?.people).toEqual(['Ada Lovelace', 'Grace Hopper', 'Noah Shrader']);
    expect(project?.iterations.find((i) => i.name === 'i1')?.contributors).toEqual(['Ada Lovelace', 'Grace Hopper']);
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

  it('keeps people already recorded when publishing, rather than replacing them', async () => {
    const FILE = '/repos/acme/design/contents/projects/alpha/iterations.json';
    const base = { projectId: 'alpha', name: 'i1', branch: 'fd/alpha/i1', commit: null, createdAt: '', note: '' };
    const { session, writes } = fakeSession({
      [FILE]: { sha: 's', content: b64(JSON.stringify([{ ...base, contributors: ['Grace Hopper'] }])) },
    });
    await new DesignRepo(session, REF).publishIterations('alpha', [{ ...base, contributors: ['Ada Lovelace'] }]);
    const written = JSON.parse(Buffer.from((writes[0]?.body as { content: string }).content, 'base64').toString('utf8'));
    expect(written[0].contributors).toEqual(['Grace Hopper', 'Ada Lovelace']);
  });
});
