import { DESIGN_REPO } from '../shared/config';
import { DesignRepo } from '../host/designRepo';
import type { AppPaths } from './appPaths';
import type { EventSink } from './handle';
import type { IpcContext } from './ipc';
import type { Ports } from './ports';
import { AgentRunner } from './services/agent';
import { CheckoutMemory } from './services/checkoutMemory';
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
	/** A fingerprint of how the shell draws pictures, so only pictures drawn the same way are shown. */
	pictureRecipe: string;
}

/**
 * The core's services, made in one place from what a shell gives (`Shell`): the composition root every shell shares.
 * Everything a handler reaches is made here, so `registerIpc` takes every one of them and defaults to nothing real; a
 * test builds its own from a temporary folder and fakes.
 */
export const createCore = ({ paths, emit, ports, github, pictureRecipe }: Shell): IpcContext => ({
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
	memory: new CheckoutMemory(paths.checkout),
	onPublishStatus: (status) => emit('onPublishStatus', status),
	prototypesRoot: paths.prototypes,
	prototypeServer: new PrototypeServer(),
	sessions: new SessionMemory(paths.agentSessions),
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
