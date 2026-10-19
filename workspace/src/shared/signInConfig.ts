export interface SignInConfig {
	clientId: string;
	/** The sign-in function's address: `POST`, `{ code, verifier }`. */
	exchange: string;
	/** Where GitHub sends the person back: must be the App's redirect address, exactly. */
	redirect: string;
	authorize: string;
}
