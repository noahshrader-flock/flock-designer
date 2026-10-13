import { useCallback, useEffect, useState } from 'react';
import type { SignInState } from '../shared/contract';
import { Projects } from './Projects';
import { SignIn } from './SignIn';
import { DesignSystem } from './DesignSystem';
import { ErrorBoundary } from './ErrorBoundary';
import { Settings } from './Settings';
import { TopNav, type Section } from './TopNav';

/**
 * The window: a fixed top bar, and under it whatever the current section is. Projects: every project in the design
 * repository, and a prototype's review screen when one is opened. Design System: the design system connected, read from
 * its clone on this machine, on the branch it is read from.
 */
export const App = () => {
	const [section, setSection] = useState<Section>('projects');
	const [signIn, setSignIn] = useState<SignInState>({ state: 'signedOut' });
	const [settingsOpen, setSettingsOpen] = useState(false);

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
			<TopNav
				user={signIn.state === 'signedIn' ? signIn.user : null}
				section={section}
				onSectionChange={setSection}
				onSignOut={signOut}
				onSettings={() => setSettingsOpen(true)}
			/>
			<Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
			{/* The bar is fixed, so the rest starts below it and scrolls on its own. */}
			<div className="h-full overflow-y-auto pt-(--nav-height)">
				<ErrorBoundary>
					{signIn.state === 'signedIn' ? (
						<>
							{/* Stays mounted so an open review and the list's state survive a visit to the other tab.
							    Hidden, its preview is a native layer that would still show, so it is told to step aside. */}
							<div hidden={section !== 'projects'}>
								<Projects hidden={section !== 'projects'} />
							</div>
							{/* Stays mounted too, so the search and the scroll survive a visit to Projects. */}
							<div hidden={section !== 'design-system'}>
								<DesignSystem hidden={section !== 'design-system'} />
							</div>
						</>
					) : (
						// Centered on the window, across and down: the bar's height is left clear below as well as above (the
						// area starts under the bar), so the middle is the window's, not what is left under the bar.
						<div className="flex min-h-full items-center justify-center p-6 pb-(--nav-height)">
							<SignIn state={signIn} onChanged={refreshSignIn} />
						</div>
					)}
				</ErrorBoundary>
			</div>
		</div>
	);
};
