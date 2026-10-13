import type { SignInState } from '../../../src/shared/contract';

/**
 * Who is signed in to GitHub, at the far right of the panel's top bar: a small Sign in button when no one is, and their
 * avatar and username when someone is, which opens their account (Sign out) in VS Code's own quick pick.
 */
export const Account = ({ state, onSignIn, onAccount }: { state: SignInState; onSignIn: () => void; onAccount: () => void }) =>
	state.state === 'signedIn' ? (
		<button type="button" className="account" onClick={onAccount} aria-label={`Signed in as ${state.user.login}: your account`}>
			{state.user.avatarUrl ? <img className="avatar" src={state.user.avatarUrl} alt="" /> : null}
			<span className="account-name">{state.user.login}</span>
		</button>
	) : (
		<button type="button" className="sign-in" onClick={onSignIn}>
			Sign in
		</button>
	);
