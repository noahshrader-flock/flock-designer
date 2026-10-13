import { type BrowserWindow, nativeTheme, safeStorage } from 'electron';
import { networkFetch } from '../host/github';
import type { AppPaths } from './appPaths';
import { createCore } from './core';
import { sendOverIpc } from './electronIpc';
import { electronPorts } from './electronPorts';
import type { IpcContext } from './ipc';
import { GitHubSession } from './services/githubSession';
import { PageView } from './services/pageView';
import { PICTURE_RECIPE } from './services/storyMeasure';
import { TokenStore } from './services/tokenStore';

/**
 * The app's services for one window: the core's (`createCore`), given Electron's shell. Events go to the window over
 * IPC, the person signs in with the app's own device flow, the preview is a native view over the window, and the
 * appearance chosen is the system's theme setting, in the app.
 */
export const createServices = (window: BrowserWindow, paths: AppPaths, githubClientId: string): IpcContext => {
	const emit = sendOverIpc(window);
	return createCore({
		paths,
		emit,
		ports: electronPorts(window),
		github: new GitHubSession(githubClientId, new TokenStore(paths.githubToken, safeStorage), networkFetch, (state) =>
			emit('onSignInChanged', state),
		),
		page: new PageView(
			window,
			(route) => emit('onPageRoute', route),
			(e) => emit('onPinEvent', e),
		),
		applyAppearance: (appearance) => void (nativeTheme.themeSource = appearance),
		pictureRecipe: PICTURE_RECIPE,
	});
};
