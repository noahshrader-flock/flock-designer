import { describe, expect, it, vi } from 'vitest';
import {
  type Fetcher,
  type StoredToken,
  GitHubError,
  ReauthRequired,
  callApi,
  isExpired,
  pollForToken,
  refreshToken,
  startDeviceFlow,
} from '../src/main/services/github';

/** A fetch stub that replays queued responses and records what was sent. */
const stub = (responses: Array<{ status?: number; body: unknown }>) => {
  const calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, ...(init ? { init } : {}) });
    const next = responses.shift() ?? { body: {} };
    return {
      status: next.status ?? 200,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body),
    };
  };
  return { fetcher, calls };
};

const noWait = { sleep: async () => {}, now: () => 1_000_000 };

describe('startDeviceFlow', () => {
  it('returns the code a person types, and never sends a client secret', async () => {
    const { fetcher, calls } = stub([
      { body: { device_code: 'dev', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 } },
    ]);
    const start = await startDeviceFlow('client-id', fetcher);
    expect(start.userCode).toBe('ABCD-1234');
    // The whole no-server design rests on this: a secret here would mean one.
    expect(calls[0]?.init?.body).not.toMatch(/secret/i);
  });

  it('explains what to check when GitHub refuses the client id', async () => {
    const { fetcher } = stub([{ status: 404, body: { error: 'not_found' } }]);
    await expect(startDeviceFlow('wrong', fetcher)).rejects.toThrow(/device flow is enabled/);
  });
});

describe('pollForToken', () => {
  const start = { deviceCode: 'dev', userCode: 'A', verificationUri: 'u', expiresInSeconds: 900, intervalSeconds: 1 };

  it('keeps waiting while the person has not finished', async () => {
    const { fetcher, calls } = stub([
      { body: { error: 'authorization_pending' } },
      { body: { error: 'authorization_pending' } },
      { body: { access_token: 'tok', expires_in: 28800, refresh_token: 'ref' } },
    ]);
    const token = await pollForToken('id', start, fetcher, noWait);
    expect(token.accessToken).toBe('tok');
    expect(token.refreshToken).toBe('ref');
    expect(calls).toHaveLength(3);
  });

  it('obeys slow_down rather than treating it as a failure', async () => {
    const { fetcher } = stub([{ body: { error: 'slow_down', interval: 10 } }, { body: { access_token: 'tok' } }]);
    await expect(pollForToken('id', start, fetcher, noWait)).resolves.toMatchObject({ accessToken: 'tok' });
  });

  it.each([
    ['expired_token', /expired/i],
    ['access_denied', /cancelled/i],
  ])('stops on %s with a message a person can act on', async (error, expected) => {
    const { fetcher } = stub([{ body: { error } }]);
    await expect(pollForToken('id', start, fetcher, noWait)).rejects.toThrow(expected);
  });

  it('records when the token expires, so it can be refreshed before it does', async () => {
    const { fetcher } = stub([{ body: { access_token: 'tok', expires_in: 28800 } }]);
    const token = await pollForToken('id', start, fetcher, noWait);
    expect(token.expiresAt).toBe(1_000_000 + 28_800_000);
  });
});

describe('refresh', () => {
  const token: StoredToken = { accessToken: 'old', expiresAt: 0, refreshToken: 'ref' };

  it('exchanges a refresh token for a new one', async () => {
    const { fetcher } = stub([{ body: { access_token: 'new', expires_in: 100, refresh_token: 'ref2' } }]);
    const next = await refreshToken('id', token, fetcher, () => 5_000);
    expect(next.accessToken).toBe('new');
    expect(next.expiresAt).toBe(105_000);
  });

  it('asks for a fresh sign-in when there is no refresh token', async () => {
    const { fetcher } = stub([]);
    await expect(refreshToken('id', { accessToken: 'a', expiresAt: 0 }, fetcher)).rejects.toThrow(ReauthRequired);
  });

  it('asks for a fresh sign-in when the refresh token is spent', async () => {
    const { fetcher } = stub([{ status: 400, body: { error: 'bad_refresh_token' } }]);
    await expect(refreshToken('id', token, fetcher)).rejects.toThrow(ReauthRequired);
  });
});

describe('isExpired', () => {
  it('treats a token as expired a minute early, so a call cannot die mid-flight', () => {
    const token: StoredToken = { accessToken: 'a', expiresAt: 100_000 };
    expect(isExpired(token, 39_000)).toBe(false);
    expect(isExpired(token, 41_000)).toBe(true);
  });
});

describe('callApi', () => {
  it('sends the token and the API version, and no secret', async () => {
    const { fetcher, calls } = stub([{ body: { ok: true } }]);
    await callApi('tok', { path: '/user' }, fetcher);
    expect(calls[0]?.init?.headers?.Authorization).toBe('Bearer tok');
    expect(calls[0]?.init?.headers?.['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('turns 401 into a re-sign-in rather than a generic failure', async () => {
    const { fetcher } = stub([{ status: 401, body: { message: 'Bad credentials' } }]);
    await expect(callApi('tok', { path: '/user' }, fetcher)).rejects.toThrow(ReauthRequired);
  });

  it('says a 404 may mean the app is not installed, because GitHub cannot tell them apart', async () => {
    const { fetcher } = stub([{ status: 404, body: { message: 'Not Found' } }]);
    await expect(callApi('tok', { path: '/repos/x/y' }, fetcher)).rejects.toThrow(/not installed/);
  });

  it('names the missing permission and where to set it, which GitHub does not', async () => {
    const { fetcher } = stub([{ status: 403, body: { message: 'Resource not accessible by integration' } }]);
    await expect(callApi('tok', { path: '/repos/a/b/contents/projects' }, fetcher)).rejects.toThrow(
      /Contents \(read-only\).*Permissions & events/s,
    );
  });

  it('names the Issues permission when that is the one missing', async () => {
    const { fetcher } = stub([{ status: 403, body: { message: 'Resource not accessible by integration' } }]);
    await expect(callApi('tok', { path: '/repos/a/b/issues' }, fetcher)).rejects.toThrow(/Issues \(read and write\)/);
  });

  it('treats 204 No Content as a success with nothing to read, instead of failing to parse an empty body', async () => {
    const fetcher: Fetcher = async () => ({
      status: 204,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
      text: async () => '',
    });
    await expect(callApi('tok', { path: '/repos/a/b/issues/comments/9', method: 'DELETE' }, fetcher)).resolves.toBeNull();
  });

  it('says what a bare failure returned and its request id, since there is no message to pass on', async () => {
    const fetcher: Fetcher = async () => ({
      status: 500,
      headers: { get: (n: string) => (n === 'x-github-request-id' ? 'AB12:34CD' : null) },
      json: async () => {
        throw new Error('not json');
      },
      text: async () => '<html>\n  Server Error\n</html>',
    });
    await expect(callApi('tok', { path: '/x', method: 'POST', body: {} }, fetcher)).rejects.toThrow(
      'GitHub returned 500 for POST /x: <html> Server Error </html> (request AB12:34CD)',
    );
  });

  it("passes GitHub's own message through for other failures", async () => {
    const { fetcher } = stub([{ status: 422, body: { message: 'Validation failed' } }]);
    await expect(callApi('tok', { path: '/x' }, fetcher)).rejects.toThrow(GitHubError);
  });
});
