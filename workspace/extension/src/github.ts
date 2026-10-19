import type * as VsCode from 'vscode';
import { type Fetcher, ReauthRequired, ReadCache, callApi, readUser } from '../../src/codeHost/github';
import type { GitHubAccount } from '../../src/codeHost/github';
import type { SignInState } from '../../src/shared/contract';

const SCOPES = ['repo', 'read:org'];
/** VS Code keeps its session after the person signs out of DSNR, so this says not to use it until they sign in again. */
const SIGNED_OUT = 'dsnr.signedOut';

type Auth = Pick<typeof VsCode.authentication, 'getSession' | 'onDidChangeSessions'>;
interface Memento {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

/** Through VS Code's own sign-in, with no token of DSNR's own, so VS Code keeps the session and its Accounts menu shows it. */
export class VsCodeGitHub implements GitHubAccount {
	private token: string | null = null;
	private current: SignInState = { state: 'signedOut' };

	constructor(
		private readonly auth: Auth,
		private readonly fetcher: Fetcher,
		private readonly memento: Memento,
		private readonly onChange: (state: SignInState) => void,
	) {}

	watch(): VsCode.Disposable {
		return this.auth.onDidChangeSessions((e) => {
			if (e.provider.id === 'github') void this.restore();
		});
	}

	async restore(): Promise<SignInState> {
		if (this.memento.get<boolean>(SIGNED_OUT)) return this.state();
		const session = await this.auth.getSession('github', SCOPES, { silent: true });
		if (session) await this.use(session.accessToken);
		else if (this.token !== null || this.current.state !== 'signedOut') this.forget();
		return this.state();
	}

	async signIn(): Promise<SignInState> {
		const session = await this.auth.getSession('github', SCOPES, { createIfNone: true });
		await this.memento.update(SIGNED_OUT, false);
		await this.use(session.accessToken);
		return this.state();
	}

	state(): SignInState {
		return this.current;
	}

	signOut(): void {
		void this.memento.update(SIGNED_OUT, true);
		this.forget();
	}

	/** Reads asked again send their tag, and an unchanged one is free. */

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
