export interface GitHubUser {
	login: string;
	name: string | null;
	avatarUrl: string | null;
}

export type SignInState = { state: 'signedOut' } | { state: 'signedIn'; user: GitHubUser };
