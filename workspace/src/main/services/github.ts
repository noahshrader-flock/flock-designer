import type { DeviceCodeStart, GitHubUser } from '../../shared/contract';

/**
 * GitHub's device flow, and the slice of the REST API the app uses.
 *
 * Device flow because this is a desktop app: it needs no client secret, so there
 * is no server of ours anywhere in the design. Verified against the real app on
 * 2026-10-05 -- sign-in, issue creation, commenting, and that the token cannot
 * see a repository the app is not installed on.
 *
 * Tokens last 8 hours and arrive with a refresh token. That is the reason
 * `withToken` exists rather than callers holding a token: a reviewer part way
 * through a session must not be thrown back to a sign-in screen.
 */

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/** Raised when the person must sign in again -- the refresh token is spent or revoked. */
export class ReauthRequired extends GitHubError {
  constructor(message = 'Sign in to GitHub again.') {
    super(message);
    this.name = 'ReauthRequired';
  }
}

export interface StoredToken {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

export interface Fetcher {
  (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }>;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Step one: ask GitHub for a code the person types into github.com/login/device. */
export const startDeviceFlow = async (clientId: string, fetcher: Fetcher): Promise<DeviceCodeStart> => {
  const res = await fetcher(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }),
  });
  const body = asRecord(await res.json());
  if (typeof body.device_code !== 'string' || typeof body.user_code !== 'string') {
    throw new GitHubError(
      typeof body.error_description === 'string'
        ? body.error_description
        : 'GitHub did not return a device code. Check the client ID, and that device flow is enabled on the app.',
      res.status,
    );
  }
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: typeof body.verification_uri === 'string' ? body.verification_uri : 'https://github.com/login/device',
    expiresInSeconds: typeof body.expires_in === 'number' ? body.expires_in : 900,
    intervalSeconds: typeof body.interval === 'number' ? body.interval : 5,
  };
};

const tokenFromResponse = (body: Record<string, unknown>, now: number): StoredToken => ({
  accessToken: String(body.access_token),
  // GitHub returns 8 hours today. Trust the response rather than the number.
  expiresAt: now + (typeof body.expires_in === 'number' ? body.expires_in : 8 * 3600) * 1000,
  ...(typeof body.refresh_token === 'string' ? { refreshToken: body.refresh_token } : {}),
  ...(typeof body.refresh_token_expires_in === 'number'
    ? { refreshExpiresAt: now + body.refresh_token_expires_in * 1000 }
    : {}),
});

/**
 * Step two: poll until the person authorises, or the attempt ends.
 *
 * `authorization_pending` is the normal case and means keep waiting;
 * `slow_down` means GitHub wants a longer interval and is not an error.
 */
export const pollForToken = async (
  clientId: string,
  start: DeviceCodeStart,
  fetcher: Fetcher,
  deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<StoredToken> => {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = now() + start.expiresInSeconds * 1000;
  let interval = start.intervalSeconds;

  while (now() < deadline) {
    await sleep(interval * 1000);
    const res = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: start.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const body = asRecord(await res.json());

    if (typeof body.access_token === 'string') {
      return tokenFromResponse(body, now());
    }
    switch (body.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        interval = typeof body.interval === 'number' ? body.interval : interval + 5;
        continue;
      case 'expired_token':
        throw new GitHubError('The sign-in code expired. Start again.');
      case 'access_denied':
        throw new GitHubError('Sign-in was cancelled on GitHub.');
      default:
        throw new GitHubError(
          typeof body.error_description === 'string' ? body.error_description : 'GitHub refused the sign-in.',
          res.status,
        );
    }
  }
  throw new GitHubError('The sign-in code expired. Start again.');
};

export const refreshToken = async (
  clientId: string,
  token: StoredToken,
  fetcher: Fetcher,
  now: () => number = () => Date.now(),
): Promise<StoredToken> => {
  if (!token.refreshToken) {
    throw new ReauthRequired();
  }
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
  });
  const body = asRecord(await res.json());
  if (typeof body.access_token !== 'string') {
    throw new ReauthRequired();
  }
  return tokenFromResponse(body, now());
};

/** Refreshed a minute early, so a call cannot start on a token that expires mid-flight. */
export const isExpired = (token: StoredToken, now: number): boolean => token.expiresAt - 60_000 <= now;

export interface ApiCall {
  path: string;
  method?: string;
  body?: unknown;
}

export const callApi = async (token: string, call: ApiCall, fetcher: Fetcher): Promise<unknown> => {
  const res = await fetcher(`${API}${call.path}`, {
    method: call.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(call.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
  });
  if (res.status === 401) {
    throw new ReauthRequired();
  }
  if (res.status >= 400) {
    const detail = asRecord(await res.json().catch(() => ({})));
    const message = typeof detail.message === 'string' ? detail.message : '';

    // GitHub's own wording for a missing permission is "Resource not accessible
    // by integration", which tells you nothing about which permission or where
    // to set it. Name both -- this cost a round trip the first time it happened.
    if (res.status === 403 && /not accessible by integration/i.test(message)) {
      const needed = call.path.includes('/contents/') || call.path.includes('/branches')
        ? 'Contents (read-only)'
        : call.path.includes('/issues')
          ? 'Issues (read and write)'
          : 'an additional repository permission';
      throw new GitHubError(
        `The GitHub App is missing the ${needed} permission. Add it under the app's ` +
          'Permissions & events, then approve the update on the installation.',
        res.status,
      );
    }
    if (res.status === 404) {
      // Indistinguishable from a repository that does not exist, so say both.
      throw new GitHubError(`Not found, or this app is not installed on it: ${call.path}`, res.status);
    }
    throw new GitHubError(message || `GitHub returned ${res.status}`, res.status);
  }
  return res.json();
};

export const readUser = async (token: string, fetcher: Fetcher): Promise<GitHubUser> => {
  const me = asRecord(await callApi(token, { path: '/user' }, fetcher));
  return {
    login: String(me.login ?? ''),
    name: typeof me.name === 'string' ? me.name : null,
    avatarUrl: typeof me.avatar_url === 'string' ? me.avatar_url : null,
  };
};
