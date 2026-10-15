/** Who is signed in to GitHub, if anyone. */

/** Who is signed in. */
export interface GitHubUser {
	login: string;
	name: string | null;
	avatarUrl: string | null;
}

export type SignInState = { state: 'signedOut' } | { state: 'signedIn'; user: GitHubUser };
