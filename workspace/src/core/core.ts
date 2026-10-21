import type { AppPaths } from './appPaths';
import type { EventSink } from './handle';
import type { CallsContext } from './compose';
import type { Ports } from './ports';
import { agentsHere } from './services/agent/agents';
import { CheckoutMemory } from './services/projects/checkoutMemory';
import { DesignSystemsMemory } from './services/designSystem/designSystems';
import { SourceAnswers } from './services/projects/productDesignSystem';
import { DesignRepositoryClones } from './services/projects/discovery';
import type { GitHubAccount } from '../codeHost/github';
import { Installer } from './services/codebase/install';
import { PrototypeServer } from './services/prototypes/prototypeServer';
import { RuntimeManager } from './services/codebase/runtime';
import { OpenedCheckouts } from './services/projects/session';
import { ShareRunner } from './services/codebase/share';

export interface Shell {
	paths: AppPaths;
	emit: EventSink;
	ports: Ports;
	github: GitHubAccount;
	/** A fingerprint of how the shell draws pictures, so only pictures drawn the same way are shown. */
	pictureRecipe: string;
}

/** Everything a handler reaches is made here, so `registerCalls` defaults to nothing real; a test builds its own with fakes. */
export const createCore = ({ paths, emit, ports, github, pictureRecipe }: Shell): CallsContext => ({
	emit,
	ports,
	opened: new OpenedCheckouts(),
	runtime: new RuntimeManager({
		onLog: (line) => emit('onRunLog', line),
		onStatus: (status) => emit('onPreviewStatus', status),
	}),
	agents: agentsHere(),
	share: new ShareRunner((status) => emit('onShareStatus', status)),
	github,
	memory: new CheckoutMemory(paths.checkout),
	onPublishStatus: (status) => emit('onPublishStatus', status),
	prototypesRoot: paths.prototypes,
	prototypeServer: new PrototypeServer(),
	installer: new Installer(),
	designSystems: new DesignSystemsMemory(paths.designSystems),
	sourceAnswers: new SourceAnswers(paths.designSystemSources),
	designRepositories: new DesignRepositoryClones(paths.designRepositories),
	storyPreviewsRoot: paths.storyPreviews,
	splitChecksRoot: paths.splitChecks,
	splitBranchesFile: paths.splitBranches,
	changeBranchFiles: paths.changeBranches,
	componentPicturesRoot: paths.componentPictures,
	componentPictureRecipe: pictureRecipe,
	// A little after the window is up, so opening it is not slowed by getting the design system ready.
	warmAfterMs: 3000,
});
