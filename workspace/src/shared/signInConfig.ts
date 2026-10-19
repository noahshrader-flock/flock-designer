/** What the published site tells a page about signing in to comment: built by the site, read by the viewer. */
export interface SignInConfig {
	clientId: string;
	/** The sign-in function's address: `POST`, `{ code, verifier }`. */
	exchange: string;
	/** The site's own address, which GitHub sends the person back to: the App's redirect address, exactly. */
	redirect: string;
	/** GitHub's sign-in page. */
	authorize: string;
}
