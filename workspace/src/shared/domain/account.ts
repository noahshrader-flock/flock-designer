/** Signing in to GitHub. */

/** Who is signed in. */
export interface GitHubUser {
	login: string;
	name: string | null;
	avatarUrl: string | null;
}

/** What the person types in, and where. */
export interface DeviceCodeStart {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	expiresInSeconds: number;
	intervalSeconds: number;
}

export type SignInState =
	| { state: 'signedOut' }
	| { state: 'awaitingDevice'; userCode: string; verificationUri: string; expiresAt: string }
	| { state: 'signedIn'; user: GitHubUser };
