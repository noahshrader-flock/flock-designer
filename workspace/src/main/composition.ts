import { type BrowserWindow, nativeTheme, safeStorage } from 'electron';
import type { AppPaths } from './appPaths';
import type { IpcContext } from './ipc';
import { sendOverIpc } from './electronIpc';
import { electronPorts } from './ports';
import { checkInWindow } from './services/accessibilityWindow';
import { AgentRunner } from './services/agent';
import { AppearanceMemory } from './services/appearance';
import { CheckoutMemory } from './services/checkoutMemory';
import { Cloner } from './services/clone';
import { CloneFolderMemory } from './services/cloneFolder';
import { coverInWindow } from './services/coverWindow';
import { DesignRepo } from '../host/designRepo';
import { DesignSystemsMemory } from './services/designSystems';
import { SessionMemory } from './services/editor';
import { networkFetch } from '../host/github';
import { GitHubSession } from './services/githubSession';
import { Installer } from './services/install';
import { PageView } from './services/pageView';
import { PrototypeServer } from './services/prototypeServer';
import { RuntimeManager } from './services/runtime';
import { OpenedCheckouts } from './services/session';
import { ShareRunner } from './services/share';
import { PICTURE_RECIPE, measureInWindows } from './services/storyMeasure';
import { TokenStore } from './services/tokenStore';
import { DESIGN_REPO } from '../shared/config';

/**
 * The app's services, made in one place for one window: the composition root. Everything a handler reaches is made
 * here, from the app's own folder (`paths`) and the real ports, so `registerIpc` takes every one of them and defaults
 * to nothing real; a test builds its own from a temporary folder and fakes.
 */
export const createServices = (window: BrowserWindow, paths: AppPaths, githubClientId: string): IpcContext => {
	const emit = sendOverIpc(window);
	const github = new GitHubSession(githubClientId, new TokenStore(paths.githubToken, safeStorage), networkFetch, (state) =>
		emit('onSignInChanged', state),
	);
	return {
		emit,
		ports: electronPorts(window),
		opened: new OpenedCheckouts(),
		runtime: new RuntimeManager({
			onLog: (line) => emit('onRunLog', line),
			onStatus: (status) => emit('onPreviewStatus', status),
		}),
		agent: new AgentRunner((line) => emit('onAgentLog', line)),
		share: new ShareRunner((status) => emit('onShareStatus', status)),
		github,
		designRepo: new DesignRepo(github, DESIGN_REPO),
		page: new PageView(
			window,
			(route) => emit('onPageRoute', route),
			(e) => emit('onPinEvent', e),
		),
		memory: new CheckoutMemory(paths.checkout),
		onPublishStatus: (status) => emit('onPublishStatus', status),
		prototypesRoot: paths.prototypes,
		prototypeServer: new PrototypeServer(),
		sessions: new SessionMemory(paths.agentSessions),
		cloneFolders: new CloneFolderMemory(paths.cloneFolder),
		appearanceMemory: new AppearanceMemory(paths.appearance),
		applyAppearance: (appearance) => void (nativeTheme.themeSource = appearance),
		cloner: new Cloner(),
		installer: new Installer(),
		designSystems: new DesignSystemsMemory(paths.designSystems),
		storyPreviewsRoot: paths.storyPreviews,
		tokenBranchesFile: paths.tokenBranches,
		voiceBranchFile: paths.voiceBranch,
		headless: { measure: measureInWindows, scan: checkInWindow, draw: coverInWindow },
		componentPicturesRoot: paths.componentPictures,
		componentPictureRecipe: PICTURE_RECIPE,
		// A little after the window is up, so opening the app is not slowed by getting the design system ready.
		warmAfterMs: 3000,
	};
};
