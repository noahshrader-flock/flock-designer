import type * as VsCode from 'vscode';
import { type Fetcher, ReauthRequired, ReadCache, callApi, readUser } from '../../src/host/github';
import type { GitHubAccount } from '../../src/main/services/githubSession';
import type { DeviceCodeStart, SignInState } from '../../src/shared/contract';

/** What DSNR asks of GitHub: the person's private repositories, and the organizations they are in. */
const SCOPES = ['repo', 'read:org'];
/** Kept by the extension: the person signed out of DSNR, so a session VS Code keeps is not used until they sign in. */
const SIGNED_OUT = 'dsnr.signedOut';

type Auth = Pick<typeof VsCode.authentication, 'getSession' | 'onDidChangeSessions'>;
interface Memento {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

/**
 * The person's GitHub account in VS Code (`GitHubAccount`), through VS Code's own sign-in: no device flow and no token of
 * DSNR's own, so VS Code keeps the session and its Accounts menu shows it. Signing out of DSNR stops using the session,
 * and is remembered, since VS Code keeps it for its own use; signing out of GitHub in VS Code signs DSNR out too.
 */
export class VsCodeGitHub implements GitHubAccount {
	private token: string | null = null;
	private current: SignInState = { state: 'signedOut' };

	constructor(
		private readonly auth: Auth,
		private readonly fetcher: Fetcher,
		private readonly memento: Memento,
		private readonly onChange: (state: SignInState) => void,
	) {}

	/** Follows VS Code's own sign-in: a GitHub session added or removed there is read again here. */
	watch(): VsCode.Disposable {
		return this.auth.onDidChangeSessions((e) => {
			if (e.provider.id === 'github') void this.restore();
		});
	}

	/** Uses a session VS Code already has, without asking; signed out when there is none, or the person signed out. */
	async restore(): Promise<SignInState> {
		if (this.memento.get<boolean>(SIGNED_OUT)) return this.state();
		const session = await this.auth.getSession('github', SCOPES, { silent: true });
		if (session) await this.use(session.accessToken);
		else if (this.token !== null || this.current.state !== 'signedOut') this.forget();
		return this.state();
	}

	/** Signs in through VS Code: its own prompt, the browser, and back. */
	async signIn(): Promise<SignInState> {
		const session = await this.auth.getSession('github', SCOPES, { createIfNone: true });
		await this.memento.update(SIGNED_OUT, false);
		await this.use(session.accessToken);
		return this.state();
	}

	state(): SignInState {
		return this.current;
	}

	/** The app's own device flow has no place here: VS Code signs the person in. */
	async startSignIn(): Promise<DeviceCodeStart> {
		throw new Error('In VS Code, sign in from the DSNR title bar, or with DSNR: Sign in to GitHub.');
	}

	cancelSignIn(): void {}

	signOut(): void {
		void this.memento.update(SIGNED_OUT, true);
		this.forget();
	}

	/** Reads asked again are asked with their tag, and an unchanged one is free (`ReadCache`). */

	private readonly reads = new ReadCache();

	async api(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
		if (this.token === null) throw new ReauthRequired();
		try {
			return await callApi(this.token, { path, ...init }, this.fetcher, this.reads);
		} catch (err) {
			// A session GitHub no longer takes: signed out, so the person is asked again rather than failing call by call.
			if (err instanceof ReauthRequired) this.forget();
			throw err;
		}
	}

	private async use(token: string): Promise<void> {
		this.token = token;
		this.set({ state: 'signedIn', user: await readUser(token, this.fetcher) });
	}

	private forget(): void {
		this.token = null;
		this.set({ state: 'signedOut' });
	}

	private set(state: SignInState): void {
		this.current = state;
		this.onChange(state);
	}
}
