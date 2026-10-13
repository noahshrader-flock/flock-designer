import type { Appearance } from '../shared/appearance';
import { DESIGN_REPO } from '../shared/config';
import { DesignRepo } from '../host/designRepo';
import type { AppPaths } from './appPaths';
import type { EventSink } from './handle';
import type { IpcContext, PreviewPage } from './ipc';
import type { Ports } from './ports';
import { AgentRunner } from './services/agent';
import { AppearanceMemory } from './services/appearance';
import { CheckoutMemory } from './services/checkoutMemory';
import { Cloner } from './services/clone';
import { CloneFolderMemory } from './services/cloneFolder';
import { DesignSystemsMemory } from './services/designSystems';
import { SessionMemory } from './services/editor';
import type { GitHubAccount } from './services/githubSession';
import { Installer } from './services/install';
import { PrototypeServer } from './services/prototypeServer';
import { RuntimeManager } from './services/runtime';
import { OpenedCheckouts } from './services/session';
import { ShareRunner } from './services/share';

/** What a shell gives the core: where its files go, how it tells the window, and what only it can do. */
export interface Shell {
	/** The shell's own folder for the app's files (Electron's userData; the extension's global storage). */
	paths: AppPaths;
	emit: EventSink;
	ports: Ports;
	github: GitHubAccount;
	page: PreviewPage;
	/** How the person's chosen appearance is applied: the system's theme setting in the app; nothing where the editor owns it. */
	applyAppearance: (appearance: Appearance) => void;
	/** A fingerprint of how the shell draws pictures, so only pictures drawn the same way are shown. */
	pictureRecipe: string;
}

/**
 * The core's services, made in one place from what a shell gives (`Shell`): the composition root every shell shares.
 * Everything a handler reaches is made here, so `registerIpc` takes every one of them and defaults to nothing real; a
 * test builds its own from a temporary folder and fakes.
 */
export const createCore = ({ paths, emit, ports, github, page, applyAppearance, pictureRecipe }: Shell): IpcContext => ({
	emit,
	ports,
	opened: new OpenedCheckouts(),
	runtime: new RuntimeManager({
		onLog: (line) => emit('onRunLog', line),
		onStatus: (status) => emit('onPreviewStatus', status),
	}),
	agent: new AgentRunner((line) => emit('onAgentLog', line)),
	share: new ShareRunner((status) => emit('onShareStatus', status)),
	github,
	designRepo: new DesignRepo(github, DESIGN_REPO),
	page,
	memory: new CheckoutMemory(paths.checkout),
	onPublishStatus: (status) => emit('onPublishStatus', status),
	prototypesRoot: paths.prototypes,
	prototypeServer: new PrototypeServer(),
	sessions: new SessionMemory(paths.agentSessions),
	cloneFolders: new CloneFolderMemory(paths.cloneFolder),
	appearanceMemory: new AppearanceMemory(paths.appearance),
	applyAppearance,
	cloner: new Cloner(),
	installer: new Installer(),
	designSystems: new DesignSystemsMemory(paths.designSystems),
	storyPreviewsRoot: paths.storyPreviews,
	tokenBranchesFile: paths.tokenBranches,
	voiceBranchFile: paths.voiceBranch,
	componentPicturesRoot: paths.componentPictures,
	componentPictureRecipe: pictureRecipe,
	// A little after the window is up, so opening it is not slowed by getting the design system ready.
	warmAfterMs: 3000,
});
