import type { DeviceCodeStart, SignInState } from '../../shared/contract';
import {
	type Fetcher,
	type StoredToken,
	ReauthRequired,
	callApi,
	isExpired,
	pollForToken,
	readUser,
	refreshToken,
	startDeviceFlow,
} from '../../host/github';
import { singleFlight } from './concurrency';
import { HostError } from '../../host/hostError';
import type { TokenStore } from './tokenStore';

/**
 * Holds the signed-in session, and is the only thing that touches the token.
 *
 * Every API call goes through `withToken`, which refreshes first if the token is
 * close to expiry. GitHub's user tokens last 8 hours -- verified 2026-10-05 --
 * so without this a reviewer would be interrupted part way through a session.
 */
export class GitHubSession {
	private token: StoredToken | null = null;
	private user: SignInState = { state: 'signedOut' };
	private pending: AbortController | null = null;
	// One refresh at a time: GitHub replaces the refresh token on each use, so a second refresh with the old one is
	// refused, and that refusal used to sign the person out over the first one's fresh token.
	private readonly refreshing = singleFlight<'refresh', StoredToken>();

	constructor(
		private readonly clientId: string,
		private readonly store: TokenStore,
		private readonly fetcher: Fetcher,
		private readonly onChange: (state: SignInState) => void,
		private readonly now: () => number = () => Date.now(),
	) {}

	/** Restores a session from the keychain at startup, without a network call. */
	async restore(): Promise<SignInState> {
		const saved = this.store.read();
		if (!saved) {
			return this.state();
		}
		this.token = saved;
		try {
			const user = await this.withToken((t) => readUser(t, this.fetcher));
			this.setState({ state: 'signedIn', user });
		} catch (err) {
			// Expired or revoked while the app was closed: start signed out rather than showing a broken session. Offline
			// or a GitHub outage is not that: the token is kept for the next launch, and calls made meanwhile still use it.
			if (err instanceof ReauthRequired) {
				this.signOut();
			}
		}
		return this.state();
	}

	state(): SignInState {
		return this.user;
	}

	private setState(next: SignInState): void {
		this.user = next;
		this.onChange(next);
	}

	/**
	 * Starts device flow and returns as soon as there is a code to display.
	 * Polling continues in the background so the window can show the code at once.
	 */
	async startSignIn(): Promise<DeviceCodeStart> {
		if (!this.store.available()) {
			throw new HostError(
				'This machine has no secure storage available, so a sign-in cannot be kept. Signing in would have to be repeated every launch.',
			);
		}
		this.cancelSignIn();
		const start = await startDeviceFlow(this.clientId, this.fetcher);
		const controller = new AbortController();
		this.pending = controller;

		this.setState({
			state: 'awaitingDevice',
			userCode: start.userCode,
			verificationUri: start.verificationUri,
			expiresAt: new Date(this.now() + start.expiresInSeconds * 1000).toISOString(),
		});

		void pollForToken(this.clientId, start, this.fetcher, { now: this.now })
			.then(async (token) => {
				if (controller.signal.aborted) {
					return;
				}
				this.token = token;
				this.store.write(token);
				const user = await readUser(token.accessToken, this.fetcher);
				this.setState({ state: 'signedIn', user });
			})
			.catch(() => {
				if (!controller.signal.aborted) {
					this.setState({ state: 'signedOut' });
				}
			})
			.finally(() => {
				if (this.pending === controller) {
					this.pending = null;
				}
			});

		return start;
	}

	cancelSignIn(): void {
		this.pending?.abort();
		this.pending = null;
		if (this.user.state === 'awaitingDevice') {
			this.setState({ state: 'signedOut' });
		}
	}

	signOut(): void {
		this.cancelSignIn();
		this.token = null;
		this.store.clear();
		this.setState({ state: 'signedOut' });
	}

	/** Runs `fn` with a valid token, refreshing first when one is about to expire. */
	async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
		// Fall back to the stored token: a call can arrive before `restore()` has
		// finished, and signing out must then still clear what is on disk.
		this.token ??= this.store.read();
		if (!this.token) {
			throw new ReauthRequired('Sign in to GitHub first.');
		}
		if (isExpired(this.token, this.now())) {
			await this.refresh(this.token);
		}
		const token = this.token;
		if (!token) {
			throw new ReauthRequired('Sign in to GitHub first.');
		}
		try {
			return await fn(token.accessToken);
		} catch (err) {
			if (err instanceof ReauthRequired) {
				this.signOut();
			}
			throw err;
		}
	}

	/** Signs out only when GitHub refuses the refresh token; a network or server failure leaves the session as it was. */
	private refresh(token: StoredToken): Promise<StoredToken> {
		return this.refreshing.run('refresh', () =>
			refreshToken(this.clientId, token, this.fetcher, this.now).then(
				(fresh) => {
					this.token = fresh;
					this.store.write(fresh);
					return fresh;
				},
				(err: unknown) => {
					if (err instanceof ReauthRequired) {
						this.signOut();
					}
					throw err;
				},
			),
		);
	}

	api(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
		return this.withToken((token) => callApi(token, { path, ...init }, this.fetcher));
	}
}
