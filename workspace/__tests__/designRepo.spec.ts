import { describe, expect, it, vi } from 'vitest';
import { DesignRepo } from '../src/main/services/designRepo';
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

describe('listProjects', () => {
  const routes = {
    '/repos/acme/design/contents/projects/alpha': [
      { type: 'file', name: 'brief.md' },
      { type: 'file', name: 'review.md' },
    ],
    '/repos/acme/design/contents/projects': [
      { type: 'dir', name: 'alpha' },
      { type: 'file', name: 'README.md' },
      { type: 'dir', name: '_template' },
    ],
    '/repos/acme/design/branches': [
      { name: 'fd/alpha/i1' },
      { name: 'fd/alpha/i2' },
      { name: 'feature/alpha' },
      { name: 'fd/other/i1' },
      { name: 'main' },
    ],
    '/repos/acme/design/issues?state=all': [
      { number: 7, comments: 3, body: 'Review thread for alpha, branch: `fd/alpha/i2`.' },
    ],
  };

  it('lists project folders, skipping files and templates', async () => {
    const { session } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha/brief.md': { content: b64('# Inactive users\n') },
    });
    const projects = await new DesignRepo(session, REF).listProjects();
    expect(projects.map((p) => p.id)).toEqual(['alpha']);
  });

  it('reads the title from the brief, and falls back to the id', async () => {
    const { session } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha/brief.md': { content: b64('# Inactive users\n\nbody') },
    });
    expect((await new DesignRepo(session, REF).listProjects())[0]?.title).toBe('Inactive users');

    const noBrief = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha': [{ type: 'file', name: 'review.md' }],
    });
    expect((await new DesignRepo(noBrief.session, REF).listProjects())[0]?.title).toBe('alpha');
  });

  it('finds this project\'s branches only, newest first, and both path shapes', async () => {
    const { session } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha/brief.md': { content: b64('# A') },
    });
    const [alpha] = await new DesignRepo(session, REF).listProjects();
    expect(alpha?.iterations.map((i) => i.branch)).toEqual(['fd/alpha/i2', 'fd/alpha/i1', 'feature/alpha']);
    expect(alpha?.iterations.map((i) => i.name)).toEqual(['i2', 'i1', 'codebase']);
  });

  it('links an iteration to its review thread and counts open comments', async () => {
    const { session } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha/brief.md': { content: b64('# A') },
    });
    const [alpha] = await new DesignRepo(session, REF).listProjects();
    expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i2')?.issueNumber).toBe(7);
    expect(alpha?.iterations.find((i) => i.branch === 'fd/alpha/i1')?.issueNumber).toBeNull();
    expect(alpha?.openComments).toBe(3);
  });

  it('never clones or touches git', async () => {
    const { session, api } = fakeSession({
      ...routes,
      '/repos/acme/design/contents/projects/alpha/brief.md': { content: b64('# A') },
    });
    await new DesignRepo(session, REF).listProjects();
    // Reviewer mode's whole promise: the API only.
    expect(api.mock.calls.every(([path]) => path.startsWith('/repos/'))).toBe(true);
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
