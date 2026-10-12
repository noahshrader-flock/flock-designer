import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Fetcher, ReauthRequired } from '../src/main/services/github';
import { GitHubSession } from '../src/main/services/githubSession';
import { type SafeStorageLike, TokenStore } from '../src/main/services/tokenStore';
import type { SignInState } from '../src/shared/contract';

/** Stands in for the OS keychain: reversible, and obviously not plaintext. */
const fakeSafeStorage = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  // Reversible but genuinely unreadable, so "not plaintext on disk" is a real
  // assertion rather than one a prefix would satisfy.
  encryptString: (plain) => Buffer.from(plain, 'utf8').toString('base64url') as unknown as Buffer,
  decryptString: (buf) => Buffer.from(String(buf), 'base64url').toString('utf8'),
});

const stub = (responses: Array<{ status?: number; body: unknown }>) => {
  const fetcher: Fetcher = async () => {
    const next = responses.shift() ?? { body: {} };
    return { status: next.status ?? 200, json: async () => next.body, text: async () => '' };
  };
  return fetcher;
};

const USER = { login: 'noahshrader-flock', name: 'Noah', avatar_url: 'https://avatars/x' };

let dir: string;
let states: SignInState[];
let store: TokenStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fd-session-'));
  states = [];
  store = new TokenStore(join(dir, 'token.enc'), fakeSafeStorage());
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const session = (fetcher: Fetcher, tokenStore = store, now = () => 1_000) =>
  new GitHubSession('client', tokenStore, fetcher, (s) => states.push(s), now);

describe('sign-in', () => {
  it('shows a code immediately, then signs in when the person finishes', async () => {
    const s = session(
      stub([
        { body: { device_code: 'd', user_code: 'WXYZ-9999', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 0 } },
        { body: { access_token: 'tok', expires_in: 28800, refresh_token: 'ref' } },
        { body: USER },
      ]),
    );
    const start = await s.startSignIn();
    expect(start.userCode).toBe('WXYZ-9999');
    expect(states[0]).toMatchObject({ state: 'awaitingDevice', userCode: 'WXYZ-9999' });

    await new Promise((r) => setTimeout(r, 30));
    expect(s.state()).toMatchObject({ state: 'signedIn', user: { login: 'noahshrader-flock' } });
  });

  it('refuses to start when the machine cannot store a token securely', async () => {
    const insecure = new TokenStore(join(dir, 'x.enc'), fakeSafeStorage(false));
    await expect(session(stub([]), insecure).startSignIn()).rejects.toThrow(/secure storage/i);
  });

  it('goes back to signed out when the person cancels', async () => {
    const s = session(
      stub([{ body: { device_code: 'd', user_code: 'A', verification_uri: 'u', expires_in: 900, interval: 60 } }]),
    );
    await s.startSignIn();
    s.cancelSignIn();
    expect(s.state()).toEqual({ state: 'signedOut' });
  });
});

describe('the stored token', () => {
  it('is encrypted on disk, never plaintext', async () => {
    const s = session(
      stub([
        { body: { device_code: 'd', user_code: 'A', verification_uri: 'u', expires_in: 900, interval: 0 } },
        { body: { access_token: 'super-secret-token', expires_in: 28800 } },
        { body: USER },
      ]),
    );
    await s.startSignIn();
    await new Promise((r) => setTimeout(r, 30));

    const raw = readFileSync(join(dir, 'token.enc')).toString();
    expect(raw).not.toContain('super-secret-token');
    expect(store.read()?.accessToken).toBe('super-secret-token');
  });

  it('is gone from disk after signing out', async () => {
    store.write({ accessToken: 'tok', expiresAt: Number.MAX_SAFE_INTEGER });
    const s = session(stub([]));
    s.signOut();
    expect(store.read()).toBeNull();
  });

  it('is ignored when it cannot be decrypted, rather than crashing', () => {
    const broken = new TokenStore(join(dir, 'token.enc'), {
      isEncryptionAvailable: () => true,
      encryptString: (p) => Buffer.from(p),
      decryptString: () => {
        throw new Error('key changed');
      },
    });
    broken.write({ accessToken: 'tok', expiresAt: 1 });
    expect(broken.read()).toBeNull();
  });
});

describe('expiry', () => {
  it('refreshes before a call when the token is near expiry', async () => {
    store.write({ accessToken: 'old', expiresAt: 1_000, refreshToken: 'ref' });
    const s = session(
      stub([
        { body: { access_token: 'fresh', expires_in: 28800, refresh_token: 'ref2' } },
        { body: { ok: true } },
      ]),
      store,
      () => 500_000,
    );
    await s.restore().catch(() => {});
    const used: string[] = [];
    await s.withToken(async (t) => {
      used.push(t);
    });
    expect(used[0]).toBe('fresh');
    expect(store.read()?.accessToken).toBe('fresh');
  });

  it('signs out when the refresh token is rejected, so the person is told', async () => {
    store.write({ accessToken: 'old', expiresAt: 0, refreshToken: 'dead' });
    const s = session(stub([{ status: 400, body: { error: 'bad' } }]), store, () => 500_000);
    await expect(s.withToken(async () => 'never')).rejects.toThrow(/sign in/i);
    expect(s.state()).toEqual({ state: 'signedOut' });
    expect(store.read()).toBeNull();
  });

  // GitHub hands back a new refresh token and the old one stops working, so a second refresh with the old one is
  // refused: two calls refreshing at once must share one.
  const tokenServer = (answer: () => Promise<{ status: number; body: unknown }>) => {
    const sent: string[] = [];
    const fetcher: Fetcher = async (url, init) => {
      if (url.includes('access_token')) {
        const used = JSON.parse(String(init?.body)).refresh_token as string;
        sent.push(used);
        const next = used === 'ref' && sent.length === 1 ? await answer() : { status: 200, body: { error: 'bad_refresh_token' } };
        return { status: next.status, json: async () => next.body, text: async () => '' };
      }
      return { status: 200, json: async () => USER, text: async () => '' };
    };
    return { fetcher, sent };
  };

  it('makes one refresh for calls that arrive at once, and stays signed in', async () => {
    store.write({ accessToken: 'old', expiresAt: 0, refreshToken: 'ref' });
    const { fetcher, sent } = tokenServer(async () => ({ status: 200, body: { access_token: 'fresh', expires_in: 28800, refresh_token: 'ref2' } }));
    const s = session(fetcher, store, () => 500_000);
    const used = await Promise.all([s.withToken(async (t) => t), s.withToken(async (t) => t), s.restore()]);
    expect(sent).toEqual(['ref']);
    expect(used.slice(0, 2)).toEqual(['fresh', 'fresh']);
    expect(s.state().state).toBe('signedIn');
    expect(store.read()?.accessToken).toBe('fresh');
  });

  it.each([
    ['the network is down', () => Promise.reject(new TypeError('fetch failed'))],
    ['GitHub has a server error', async () => ({ status: 502, body: {} })],
  ])('keeps the session when a refresh fails because %s', async (_, answer) => {
    store.write({ accessToken: 'old', expiresAt: 0, refreshToken: 'ref' });
    const { fetcher } = tokenServer(answer);
    const s = session(fetcher, store, () => 500_000);
    const failed = await s.withToken(async () => 'never').catch((err: unknown) => err);
    expect(failed).toBeInstanceOf(Error);
    expect(failed).not.toBeInstanceOf(ReauthRequired);
    expect(states).not.toContainEqual({ state: 'signedOut' });
    expect(store.read()?.refreshToken).toBe('ref');
  });

  it('keeps a stored session it could not check because the network is down', async () => {
    store.write({ accessToken: 'kept', expiresAt: Number.MAX_SAFE_INTEGER });
    const s = session(async () => Promise.reject(new TypeError('fetch failed')), store);
    expect(await s.restore()).toEqual({ state: 'signedOut' });
    expect(store.read()?.accessToken).toBe('kept');
  });

  it('starts signed out when a stored session is no longer valid', async () => {
    store.write({ accessToken: 'stale', expiresAt: Number.MAX_SAFE_INTEGER });
    const s = session(stub([{ status: 401, body: { message: 'Bad credentials' } }]), store);
    expect(await s.restore()).toEqual({ state: 'signedOut' });
  });
});
