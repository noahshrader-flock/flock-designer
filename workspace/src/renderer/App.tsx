import { useCallback, useEffect, useState } from 'react';
import type { SignInState } from '../shared/contract';
import { Projects } from './Projects';
import { SignIn } from './SignIn';
import { ErrorBoundary } from './ErrorBoundary';
import { TopNav } from './TopNav';

/**
 * The window: a fixed top bar, and under it whatever the current section is.
 *
 * There is one section, Projects: every project in the design repository, with
 * its iterations and comments, read through the API with only a GitHub account.
 * The earlier Author view (open a checkout, start the agent, run a preview) is
 * not shown; the services behind it are still in the main process, and it comes
 * back as a GitHub-backed list of repositories rather than a folder picker.
 */
export const App = () => {
	const [signIn, setSignIn] = useState<SignInState>({ state: 'signedOut' });

	const refreshSignIn = useCallback(async () => {
		const result = await window.workspace.signInState();
		if (result.ok) setSignIn(result.value);
	}, []);

	useEffect(() => {
		void refreshSignIn();
		return window.workspace.onSignInChanged(setSignIn);
	}, [refreshSignIn]);

	const signOut = async () => {
		await window.workspace.signOut();
		await refreshSignIn();
	};

	return (
		<div className="bg-background h-screen overflow-hidden">
			<TopNav user={signIn.state === 'signedIn' ? signIn.user : null} onSignOut={signOut} />
			{/* The bar is fixed, so the rest starts below it and scrolls on its own. */}
			<div className="h-full overflow-y-auto pt-(--nav-height)">
				<div className="mx-auto max-w-[1400px] p-6">
					<ErrorBoundary>
						{signIn.state === 'signedIn' ? <Projects /> : <SignIn state={signIn} onChanged={refreshSignIn} />}
					</ErrorBoundary>
				</div>
			</div>
		</div>
	);
};
