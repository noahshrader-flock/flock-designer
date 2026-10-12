import type { BrowserWindow } from 'electron';

import { type Check, arg, emit } from './handle';
import type { Ports } from './ports';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import {
	type AccessibilityResult,
	type Checkout,
	type ClonePlan,
	type Person,
	type PageStatus,
	type PrototypeAddressed,
	type PrototypeReadiness,
	type PublishStatus,
	type ReviewComment,
} from '../shared/contract';
import { type Appearance } from '../shared/appearance';
import { AGENT_BUSY, type AgentExtras, AgentRunner } from './services/agent';
import { SessionMemory } from './services/editor';
import { type CheckoutParts } from './services/agentTasks';
import { commandLine } from './services/engineeringHandoff';

import { type ShareRunner } from './services/share';

import { DESCRIPTOR_PATH, designSystemCheckout, readDescriptor, type WorkspaceDescriptor } from './services/descriptor';
import { branchExists, branchesWithFile, checkoutBranch, ensureLocalBranch, hasFileAt, isRepository, readCheckout } from './services/git';
import { codebaseBranchFor, continueIteration, createIteration, readIterations, recordedIteration } from './services/iterations';
import { type Cloned, Cloner, type GitProgress, notClonedOver } from './services/clone';
import { INSTALL_COMMAND, Installer } from './services/install';
import { DesignLibrary } from './services/designLibrary';
import { DesignSystemsMemory } from './services/designSystems';
import { ProfileNames } from './services/profileNames';
import { StoryPreviews } from './services/storyPreviews';

import { A11Y_COMMAND, productTarget, taskAccessibility } from './services/accessibilityBrief';
import { type CheckPage, accessibilityOf } from './services/accessibilityCheck';
import { TokenBranches } from './services/tokenBranches';
import { NEEDS_GH, VoiceAndToneFile } from './services/voiceAndTone';
import { ComponentTokens, type Measure } from './services/componentTokens';
import { ComponentPictures } from './services/componentPictures';
import { AppearanceMemory } from './services/appearance';
import { CloneFolderMemory, clonePlace, cloneFolderOf, defaultCloneFolderDeps } from './services/cloneFolder';
import { defaultDiscoveryDeps, findProductCheckouts, recordsRootFor } from './services/discovery';
import { listedAs, reachableRepositories } from './services/repositories';
import { classify } from './services/branchProjects';
import { RuntimeManager } from './services/runtime';
import { projectTitle, writeCommentsExport } from './services/commentsExport';
import { syncRecords } from './services/designSync';
import { syncBranches } from './services/branchSync';
import { PublishManager, publishInOrder } from './services/publisher';
import { DESIGN_REPO, DesignRepo } from './services/designRepo';
import type { PageView } from './services/pageView';
import type { GitHubSession } from './services/githubSession';
import { OpenedCheckouts } from './services/session';
import { readFolderProjects } from './services/localProjects';
import { prototypeKey } from '../shared/designPaths';

import { iterationLabel } from '../shared/work';

import { PrototypeServer } from './services/prototypeServer';
import { esbuildEntry, sharedFilesOf } from './services/prototypeBundle';
import { statesOf } from '../shared/prototypeStates';
import { type PrototypeChange, localPrototypeFile, prototypeWork } from './services/prototypeWork';
import { type CoverDeps, type DrawCover } from './services/projectCovers';

import { pageStatus, publish, recordsFrom, redeploySite, siteBehind } from './services/pages';
import { prototypeReadable, type PrototypeSources } from './services/prototype';
import type { CheckoutMemory } from './services/checkoutMemory';
import { errorText } from '../shared/result';
import { coalescingByKey, singleFlight } from './services/concurrency';
import { designStore } from './services/designStore';
import { registerCheckout } from './ipc/checkout';
import { registerClone } from './ipc/clone';
import { registerDesignSystem } from './ipc/designSystem';
import { registerCodebase } from './ipc/codebase';
import { registerPrototypes } from './ipc/prototypes';
import { registerReview } from './ipc/review';
import { registerPublishing } from './ipc/publishing';
import { registerPage } from './ipc/page';
import { registerAccount } from './ipc/account';

export interface IpcContext {
	window: BrowserWindow;
	/** Everything reached outside the app: dialogs, other applications, the clipboard, the network, the person's own tools. */
	ports: Ports;
	opened: OpenedCheckouts;
	runtime: RuntimeManager;
	agent: AgentRunner;
	share: ShareRunner;
	github: GitHubSession;
	designRepo: DesignRepo;
	page: PageView;
	memory: CheckoutMemory;
	/** Told whenever publishing moves, so the window can show it. */
	onPublishStatus: (status: PublishStatus) => void;
	/** Where prototypes are built before they are saved: the app's own folder, never a repository. */
	prototypesRoot: string;
	prototypeServer: PrototypeServer;
	/** The latest agent conversation for each branch, so it can be continued in the person's editor. */
	sessions: SessionMemory;
	/** Where this person's clones go, once they choose. */
	cloneFolders: CloneFolderMemory;
	/** The appearance they chose (Settings), and how it is applied to the app: the system's theme setting, in the app. */
	appearanceMemory: AppearanceMemory;
	applyAppearance: (appearance: Appearance) => void;
	/** Clones what the New modal asks for. Given for tests, to clone from this machine instead of GitHub. */
	cloner: Cloner;
	installer: Installer;
	/** The component library for the Design System tab. Given for tests, to read a library made for them. */
	/** A test's own; built from the connected design systems when not given. */
	designLibrary?: DesignLibrary;
	/** The design systems the person connected. */
	designSystems: DesignSystemsMemory;
	/** Where the previews of the library's stories are built: the app's own folder, never the library's. */
	storyPreviewsRoot: string;
	/** Which branch each design system's change to its tokens is kept on (T4). */
	tokenBranchesFile: string;
	/** Which branch a change to the voice and tone is kept on (T9). */
	voiceBranchFile: string;
	/** How stories are drawn to read what they draw (T6): hidden windows, in the app. */
	measureStories: Measure;
	/** How a page is checked for accessibility (T7): axe-core in a hidden window, in the app. */
	checkPage: CheckPage;
	/** How a prototype's page is drawn as its picture on its project's card: a hidden window, in the app. */
	drawCover: DrawCover;
	/**
	 * Which tokens each component draws with (T6), and so what is got ready in the background: given for tests.
	 */
	componentTokens?: Pick<ComponentTokens, 'of' | 'warm' | 'pictures'>;
	/** Where the pictures of the components are kept (P5): the app's own folder. */
	componentPicturesRoot: string;
	/** How the pictures are taken: a fingerprint, so only pictures taken that way are shown. */
	componentPictureRecipe: string;
	/** When to start getting the shown design system ready after the app opens; not at all when absent. */
	warmAfterMs?: number;
}

/** Everything the handlers share: the context, and what is made from it once, for the window's whole session. */
export const ipcDeps = ({
	window,
	ports,
	opened,
	runtime,
	agent,
	share,
	github,
	designRepo,
	page,
	memory,
	onPublishStatus,
	prototypesRoot,
	prototypeServer,
	sessions,
	cloneFolders,
	appearanceMemory,
	applyAppearance,
	cloner,
	installer,
	designLibrary,
	designSystems,
	storyPreviewsRoot,
	tokenBranchesFile,
	voiceBranchFile,
	measureStories,
	checkPage,
	drawCover,
	componentTokens: injectedComponentTokens,
	componentPicturesRoot,
	componentPictureRecipe,
	warmAfterMs,
}: IpcContext) => {
	const { personGitHub } = ports;
	const openRepository = async (root: string): Promise<Checkout> => {
		if (!isRepository(root)) {
			throw new Error(`${root} is not a git repository.`);
		}
		const canonical = opened.remember(root);
		memory.write(canonical);
		return readCheckout(canonical);
	};

	const descriptorFor = (root: string) => readDescriptor(opened.require(root));

	/**
	 * A checkout the window names, found once among those the person opened: its folder as named and as resolved, and its
	 * descriptor and the design repository's records beside it, each read when first asked for, as before.
	 */
	const checkout: Check<{ root: string; canonical: string; readonly descriptor: WorkspaceDescriptor; readonly recordsRoot: string }> = (v) => {
		const root = arg.root(v);
		const canonical = opened.require(root);
		let descriptor: WorkspaceDescriptor | undefined;
		let records: string | undefined;
		return {
			root,
			canonical,
			get descriptor() {
				return (descriptor ??= readDescriptor(canonical));
			},
			get recordsRoot() {
				return (records ??= recordsFor(canonical));
			},
		};
	};

	/** The product repositories on this machine: discovery's usual places, and first the folder this person's clones go in. */
	const productCheckouts = (): string[] => {
		const chosen = cloneFolders.read();
		return findProductCheckouts({ ...defaultDiscoveryDeps, ...(chosen ? { folders: [chosen] } : {}) });
	};
	/** Where clones go: the folder chosen, else beside the repository last worked in, else a usual code folder. */
	const cloneFolder = (): string => cloneFolderOf(cloneFolders, defaultCloneFolderDeps(productCheckouts()));

	/**
	 * The product checkout this person has already accepted, or null.
	 *
	 * **Discovery deliberately does not feed this.** A repository's own
	 * `.dsnr/workspace.json` is its command allowlist, so a repository that merely
	 * exists on disk must never become runnable: finding one is a suggestion, and
	 * accepting it (`useCheckout`, which a click calls) is what trusts it. Only a
	 * root that went through `openRepository` is remembered here, so the memory file
	 * can restore a choice that was made, never manufacture one.
	 */
	const trustedRoot = (): string | null => {
		const saved = memory.read();
		return saved !== null && isRepository(saved) && existsSync(join(saved, DESCRIPTOR_PATH)) ? saved : null;
	};

	/** Where this checkout's design records go; an error that says what to do when the design repository is not beside it. */
	const recordsFor = (productRoot: string): string => {
		const found = recordsRootFor(productRoot);
		if (found === null) {
			throw new Error(
				`DSNR could not find the design repository next to ${basename(productRoot)}. Clone flock-designer into the same folder, beside it.`,
			);
		}
		return found;
	};

	/**
	 * Keeps the person's work published: branches, then records. It runs by itself (when the list is read, when
	 * something is written, when the window is focused) and shows where it has got to, so nothing is left for
	 * anyone to remember. See `PublishManager`.
	 */
	const publisher = new PublishManager(
		{
			context: async () => {
				const root = trustedRoot();
				const recordsRoot = root === null ? null : recordsRootFor(root);
				if (root === null || recordsRoot === null) return null;
				opened.require(root);
				const descriptor = readDescriptor(root);
				return {
					run: async () => {
						const done = await publishInOrder(
							() => syncBranches({ root, descriptor, projects: new Set(readFolderProjects(recordsRoot).map((p) => p.id)) }),
							async (found) => {
								// Reviewers find an iteration through its record, so work built in a terminal (a branch, a folder,
								// and no record) is recorded here, then published with the rest.
								for (const branch of found.mine) {
									const work = classify(descriptor, branch);
									if (work) await recordedIteration(root, recordsRoot, descriptor, work.projectId, work.name).catch(() => undefined);
								}
								return syncRecords(dirname(recordsRoot));
							},
						);
						// Whatever is on GitHub and not yet on the site goes up too, however it got there.
						void catchUpSite();
						return done;
					},
				};
			},
		},
		onPublishStatus,
	);
	// A record just written is published without anyone asking, and without holding up what they were doing.
	const written = <T>(value: T): T => {
		void publisher.publish(true);
		return value;
	};

	/** Who is signed in to the app, by their GitHub login, or null. */
	const signedInLogin = (): string | null => {
		const s = github.state();
		return s.state === 'signedIn' ? s.user.login : null;
	};

	// The window says only whether to wait for the update; where the design system is, it is never told and never asks.
	const library = designLibrary ?? new DesignLibrary({ systems: designSystems });
	const shownSystem = () => {
		const shown = library.current();
		return typeof shown === 'string' ? null : shown;
	};
	const previews = new StoryPreviews({ system: shownSystem, folder: storyPreviewsRoot, server: prototypeServer });
	// Which tokens each component draws with (T6), and its picture (P5), from one drawing pass.
	const componentPictures = new ComponentPictures({ folder: componentPicturesRoot, server: prototypeServer, recipe: componentPictureRecipe });
	const componentTokens =
		injectedComponentTokens ?? new ComponentTokens({ system: shownSystem, previews, measure: measureStories, pictures: componentPictures });
	// The previews and the index are got ready in the background, so a component opened later is drawn at once: as the app
	// opens, and whenever the library has been read (it may have moved). For a commit already ready it is nothing.
	const warm = () => void componentTokens.warm();
	if (warmAfterMs !== undefined) setTimeout(warm, warmAfterMs).unref();
	const tokenBranches = new TokenBranches({ system: shownSystem, file: tokenBranchesFile, tools: ports.shareTools });
	// The voice and tone (T9): the connected design system's, read, saved and proposed with the person's own command line.
	const voiceFile = (): VoiceAndToneFile => {
		const system = shownSystem();
		if (system === null) throw new Error('No design system is connected. Connect one in Components: its voice and tone is in its agent files.');
		if (personGitHub === null) throw new Error(NEEDS_GH);
		const [owner = '', repo = ''] = system.repository.split('/');
		return new VoiceAndToneFile({ repo: { owner, repo }, folder: system.folder, github: personGitHub, file: voiceBranchFile });
	};
	// The longest a save takes: far beyond any real voice and tone, short of anything that could hurt.
	const MAX_VOICE = 200_000;

	/**
	 * Cloning, from the New modal: only a repository the person's own GitHub list returned (the last list shown, or asked
	 * again), only into the clone folder, and the design repository beside it when it is missing.
	 */
	/**
	 * What the handlers change and share: the repositories the person can see (read once, then kept), and the clone and
	 * the install in progress, which Cancel stops.
	 */
	const state: { visible: string[]; cloning: AbortController | null; installing: AbortController | null } = {
		visible: [],
		cloning: null,
		installing: null,
	};
	const DESIGN = `${DESIGN_REPO.owner}/${DESIGN_REPO.repo}`;
	/** What cloning `repository` into `folder` would do. */
	const planClone = async (repository: string, folder: string, forDesignSystem = false): Promise<ClonePlan> => {
		if (state.visible.length === 0 && github.state().state === 'signedIn')
			state.visible = (await reachableRepositories(github, personGitHub, signedInLogin())).names;
		const listed = listedAs(state.visible, repository);
		if (listed === undefined)
			throw new Error(`${repository} is not one of the repositories your GitHub account can see. Sign in to GitHub in DSNR, then try again.`);
		const design = clonePlace(folder, DESIGN);
		const place = clonePlace(folder, listed);
		const home = homedir();
		const where = place.path.startsWith(home + sep) ? `~${place.path.slice(home.length)}` : place.path;
		// The design system is read, not worked in, so it needs no design repository beside it.
		return { repository: listed, place, where, design: design.state === 'cloned' || forDesignSystem ? null : design };
	};
	/**
	 * Clones what `planClone` says, with its progress sent to the window and `cancelClone` able to stop it: the repository,
	 * and the design repository beside it when the plan has one. Where it went, and whether it was cloned or already there.
	 */
	const cloneAsPlanned = async (repository: string, forDesignSystem = false): Promise<Cloned & { repository: string }> => {
		const folder = cloneFolder();
		const plan = await planClone(repository, folder, forDesignSystem);
		// Both asked first, so the product is not cloned only for the design repository to be in the way.
		for (const p of [plan.place, plan.design]) if (p?.state === 'taken') throw new Error(notClonedOver(p.why));
		const stop = (state.cloning = new AbortController());
		const progress = (of: string) => (p: GitProgress) => emit(window, 'onCloneProgress', { repository: of, ...p });
		try {
			const cloned = await cloner.clone({ repository: plan.repository, visible: state.visible, folder }, progress(plan.repository), stop.signal);
			// The design repository is the app's own, named here, never by the window: it is the whole list it may clone.
			if (plan.design) await cloner.clone({ repository: DESIGN, visible: [DESIGN], folder }, progress(DESIGN), stop.signal);
			return { ...cloned, repository: plan.repository };
		} finally {
			state.cloning = null;
		}
	};
	/**
	 * A clone is used on a branch with the DSNR setup, since the app reads it from the files there. A clone just
	 * made is moved to the most recently committed branch that has it (it holds nothing of the person's yet); one that
	 * was already there is the person's, so it is never moved, and they are told which branch to switch it to.
	 */
	const startAtSetup = async (repository: string, root: string, fresh: boolean): Promise<void> => {
		if (existsSync(join(root, DESCRIPTOR_PATH))) return;
		const here = (await readCheckout(root)).branch ?? 'no branch';
		const good = (await branchesWithFile(root, DESCRIPTOR_PATH))[0];
		if (good === undefined) {
			throw new Error(`Cloned, but no branch of ${repository.split('/')[1]} has the DSNR setup (${DESCRIPTOR_PATH}), so it can't be used here yet.`);
		}
		if (!fresh) throw new Error(`${root} is on ${here}, which has no DSNR setup. Switch it to ${good}, which has it, then try again.`);
		await ensureLocalBranch(root, good);
		await checkoutBranch(root, good);
	};

	/** Switching branches under a running agent changes the files it is working on mid-run. */
	const assertAgentNotHere = (canonical: string): void => {
		if (agent.runningIn(canonical)) {
			throw new Error(
				`The agent is working in ${basename(canonical)}, and this would change its branch. Wait for it to finish, or take it over, then try again.`,
			);
		}
	};

	/**
	 * Codebase work's branch, checked out, and its record: from `from`, or the branch the checkout is on. Only Build
	 * starts codebase work from the app, so there is no channel for it of its own.
	 */
	async function startCodebaseWork(root: string, projectId: string, note: string, from?: string) {
		const canonical = opened.require(root);
		assertAgentNotHere(canonical);
		const descriptor = descriptorFor(root);
		// Only ever a branch that exists here or on GitHub, so the window cannot pass git an option or a revision
		// expression. One only on GitHub (as most are in a fresh clone) is made local, with nothing checked out.
		if (from !== undefined) await ensureLocalBranch(canonical, from);
		const branch = from ?? (await readCheckout(canonical)).branch;
		if (branch === null) {
			throw new Error('This repository has a detached HEAD. Check out a branch first.');
		}
		// Work is built where the product's DSNR setup is. A branch without it (develop, before the
		// setup is merged there) would leave the checkout on a branch this app can no longer work in.
		if (!(await hasFileAt(canonical, `refs/heads/${branch}`, DESCRIPTOR_PATH))) {
			throw new Error(`${branch} has no ${DESCRIPTOR_PATH}, so work cannot start from it. Start from a branch that has the DSNR setup.`);
		}
		const recordsRoot = recordsFor(canonical);
		return written(await createIteration(canonical, recordsRoot, descriptor, projectId, note, branch));
	}

	/**
	 * A project's codebase work as this checkout and the records know it: its branch, whether that branch is here, and
	 * whether it is recorded. Started when either is true; Build then continues it rather than starting a second.
	 */
	async function codebaseWorkOf(root: string, projectId: string) {
		const canonical = opened.require(root);
		const branch = codebaseBranchFor(descriptorFor(root), projectId);
		const records = await work.records(projectId);
		const exists = await branchExists(canonical, branch);
		const recorded = records.some((i) => i.name === 'codebase');
		return { branch, exists, recorded, started: exists || recorded, records };
	}

	/**
	 * Codebase work already started, picked up: its branch made local if it is only on GitHub, and the checkout moved to
	 * it. A checkout already on it is left exactly as it is, uncommitted work and all, since that is the work in
	 * progress; moving from another branch needs a clean one, so nothing is carried or lost.
	 */
	async function continueCodebaseWork(root: string, projectId: string, branch: string) {
		const canonical = opened.require(root);
		assertAgentNotHere(canonical);
		await ensureLocalBranch(canonical, branch);
		if ((await readCheckout(canonical)).branch === branch) return;
		const me = github.state();
		await continueIteration(
			canonical,
			recordsFor(canonical),
			projectId,
			'codebase',
			me.state === 'signedIn' ? me.user.login : null,
			descriptorFor(root),
		);
	}

	/** The accessibility section of a codebase task (T7): the product's target from its own manifest, on the branch it is on. */
	const codebaseAccessibility = (canonical: string, findings?: Parameters<typeof taskAccessibility>[2]): Promise<string> => {
		const descriptor = readDescriptor(canonical);
		// The product's own check, where its setup declares one (Coke's `a11y`), run as the work goes; its gate runs it at handoff.
		const check = commandLine(descriptor.commands, A11Y_COMMAND, '');
		return taskAccessibility(readSkillText, productTarget(join(canonical, descriptor.contextDir), descriptor.product), findings, check);
	};

	/**
	 * What a codebase run may read besides the checkout: the shared skills and standards the product's guidance
	 * points at, and the design system's own guidance (`designSystemCheckout`). Read only, and named in the task, since a folder
	 * the agent has not been told about is one it never opens.
	 */
	/** Whether the one agent is working. Starting it is the runner's to refuse; this is for what must wait for it. */
	const agentBusy = (): boolean => agent.status().state === 'running';
	/** For what must not run under the agent, or writes something before starting it: nothing is left for a run that cannot. */
	const refuseWhileBusy = (): void => {
		if (agentBusy()) throw new Error(AGENT_BUSY);
	};

	const sharedGuidance = (canonical: string): { dirs: string[]; note: string } => {
		const designRoot = recordsRootFor(canonical);
		const designSystem = readDescriptor(canonical).designSystem;
		const named: Array<[string, string | null]> = [
			["Shared agents (the product's shims point here)", designRoot === null ? null : join(dirname(designRoot), 'agents')],
			['Shared skills (a `skills/…` path in any guidance is here)', designRoot === null ? null : join(dirname(designRoot), 'skills')],
			['Shared standards', designRoot === null ? null : join(dirname(designRoot), 'standards')],
			['Shared logging (how the product logs what went wrong)', designRoot === null ? null : join(dirname(designRoot), 'knowledge')],
			["The design system's checkout (its guidance and source)", designSystemCheckout(canonical, designSystem)],
		];
		const found = named.filter((n): n is [string, string] => n[1] !== null && existsSync(n[1]));
		if (!found.length) return { dirs: [], note: '' };
		return {
			dirs: found.map(([, d]) => d),
			note: ['## Also yours to read (never change)', '', ...found.map(([what, d]) => `- ${what}: \`${d}\``)].join('\n'),
		};
	};

	/**
	 * What every run in a product checkout is given besides its own task (`CheckoutParts`, put in place by `agentTasks`),
	 * and the folders it may read for them. `findings`: what a prototype's own accessibility check left open, to fix.
	 */
	const checkoutParts = async (
		canonical: string,
		projectId: string,
		findings?: Parameters<typeof taskAccessibility>[2],
	): Promise<{ parts: CheckoutParts; readOnly: string[] }> => {
		const shared = sharedGuidance(canonical);
		return {
			readOnly: shared.dirs,
			parts: {
				lightCheck: commandLine(readDescriptor(canonical).commands, 'check-iteration', projectId),
				shared: shared.note,
				accessibility: await codebaseAccessibility(canonical, findings),
				// The voice and tone (T9), from the design system beside this product; nothing while it is blank.
				voice: await work.voice(canonical),
			},
		};
	};

	/**
	 * Starts a run the person can come back to: tagged with its branch, and its conversation named and kept, so it can
	 * be continued in VS Code. Every run in a product checkout starts here, with its whole task (`agentTasks`).
	 */
	const startTracked = (
		canonical: string,
		projectId: string,
		task: string,
		{ branch, addDirs, readOnly, purpose }: { branch: string | null; addDirs: string[]; readOnly: string[]; purpose?: AgentExtras['purpose'] },
	) => {
		const session = randomUUID();
		// Joining the run already going on this branch keeps that run's conversation, not this new name for it.
		const joining = agentBusy();
		const started = agent.start(canonical, projectId, task, {
			// The project's records live in the design repository, beside the product checkout.
			addDirs,
			readOnly,
			...(branch !== null ? { work: branch } : {}),
			...(purpose ? { purpose } : {}),
			session,
			name: `DSNR: ${projectId}`,
		});
		if (!joining && started.state === 'running' && branch !== null) sessions.write(canonical, branch, session);
		return started;
	};

	/** Names people by their GitHub profile, once each, so a person is the same name wherever they appear. */
	const profiles = new ProfileNames((path) => github.api(path));
	/**
	 * Rewrites `comments.md` for what was just read, on a machine that has the design repository
	 * beside the product checkout. Best effort: reading comments never fails because a file
	 * could not be written; the Address button, which depends on the file, is strict.
	 */
	const exportComments = (projectId: string, branch: string, comments: ReviewComment[]): void => {
		try {
			const root = trustedRoot();
			const recordsRoot = root === null ? null : recordsRootFor(root);
			if (recordsRoot === null) return;
			// The record's name for it, or the one the branch's own name gives it (work with no record yet).
			const name =
				readIterations(recordsRoot, projectId).find((i) => i.branch === branch)?.name ?? classify(readDescriptor(root as string), branch)?.name;
			if (!name) return;
			writeCommentsExport(recordsRoot, {
				projectId,
				title: projectTitle(recordsRoot, projectId),
				iteration: { name, branch },
				comments,
				generatedAt: new Date(),
			});
		} catch {
			// Nothing to do: the comments themselves were read fine.
		}
	};
	/*
	 * Prototypes. Everything they write goes to one place per machine: the design repository's
	 * clone when there is one here, so the publisher sends it like every other record, and otherwise
	 * GitHub directly.
	 */
	/** The design repository's clone on this machine, when there is one. */
	const designClone = (): string | null => {
		const root = trustedRoot();
		const recordsRoot = root === null ? null : recordsRootFor(root);
		return recordsRoot === null ? null : dirname(recordsRoot);
	};
	// The design repository's files: the clone here, written then published, or GitHub (`designStore`).
	const store = designStore({ clone: designClone, designRepo, onWrite: () => void publisher.publish(true) });
	const recordStore = store.records;
	const readDesignFile = store.readFile;
	const readDesignBytes = store.readBytes;
	/** A shared skill, which the agent's task is built from: read as the dsnr command reads it. */
	const readSkillText = (path: string): Promise<string> => work.skill(path);
	/**
	 * Making prototypes: the same code the dsnr command runs from Claude Code, given this app's folder, the repository
	 * this person accepted, and this app's store.
	 */
	const work = prototypeWork({
		prototypesRoot,
		productRoot: () => {
			const root = trustedRoot();
			return root === null ? null : opened.require(root);
		},
		store: recordStore,
		readDesignFile,
		esbuild: esbuildEntry,
	});
	/** Whether a prototype can be built from this accepted repository here. */
	const prototypeReadiness = (root: string): PrototypeReadiness => {
		const readiness = work.readiness(opened.require(root));
		return readiness.ready ? readiness : { ...readiness, canInstall: descriptorFor(root).commands.some((c) => c.id === INSTALL_COMMAND) };
	};

	/** What building a prototype and changing one share: what it is modeled on, read once, and how it is built. */
	const prototypeRun = async (projectId: string, name: string, modeledOn = name) =>
		work.buildPlan(projectId, name, await once(`source:${projectId}`, () => work.sources(projectId, modeledOn)));
	/** Its agent, in the folder it was built in, reading the product read-only, and nothing committed. */
	const startPrototypeAgent = (projectId: string, name: string, sources: PrototypeSources, task: string) =>
		agent.start(work.dir(projectId), projectId, task, { bare: true, readOnly: prototypeReadable(sources), work: prototypeKey(projectId, name) });
	/** Makes the shared files a page points at available beside it: this machine's copy, else the design repository's. */
	const serveShared = async (html: string): Promise<void> => {
		for (const n of sharedFilesOf(html)) {
			if (prototypeServer.hasShared(n)) continue;
			const uri = await work.sharedText(n);
			if (uri !== null) prototypeServer.share(n, uri);
		}
	};
	/** A prototype's page on the local server, with the shared files it points at beside it: where it is opened and checked. */
	const servePrototype = async (projectId: string, name: string, html: string): Promise<string> => {
		await serveShared(html);
		return prototypeServer.serve(`${projectId}/${name}`, html);
	};
	/** The page: this machine's newest build first (built again when its source changed), then the saved one. */
	const prototypePage = (projectId: string, name: string): Promise<string | null> => work.page(projectId, name, agentBusy());
	/** Runs `run` once at a time per key: a second caller waits for the first and shares its answer. */
	const inFlight = singleFlight<string, unknown>();
	const once = <T>(key: string, run: () => Promise<T>): Promise<T> => inFlight.run(key, run) as Promise<T>;
	const me = (): Person | null => {
		const s = github.state();
		return s.state === 'signedIn' ? { name: s.user.name ?? s.user.login, login: s.user.login } : null;
	};

	/**
	 * Acting on one comment on a prototype. The same steps as on a branch -- comments read from GitHub now, the file
	 * written from that read, then the agent started -- but the agent changes the prototype's source in the app's own
	 * folder, where it was built, and nothing is committed. What others commented on is never changed under them: the
	 * service says which iteration the change goes in (`startChange`), and `finishPrototypeAddress` records and saves it.
	 */
	const prototypeChanges = new Map<number, { projectId: string; change: PrototypeChange }>();
	/**
	 * Finishes one: a changed prototype built, recorded when new, and saved, and the comment marked with where the change
	 * is. Run by the screen when the agent ends, and when the prototype is opened again, so a change made while the screen
	 * was left is never stranded.
	 */
	const finishPrototypeChange = async (commentId: number): Promise<PrototypeAddressed> => {
		const pending = prototypeChanges.get(commentId);
		if (!pending) throw new Error('There is no change to this comment waiting to be saved.');
		refuseWhileBusy();
		prototypeChanges.delete(commentId);
		const { projectId, change } = pending;
		const { version, made } = await work.finishChange(projectId, change, me(), `For a comment on ${iterationLabel(change.from)}`);
		// Either way: a run that changed nothing clears the mark an earlier one left.
		const comment = await designRepo.setAddressed(commentId, version, version === null ? null : change.target);
		if (version !== null) publishInBackground(projectId, change.target);
		return { changed: version !== null, iteration: change.target, made, comment };
	};
	const finishPrototypeChanges = async (projectId: string): Promise<void> => {
		if (agentBusy()) return;
		for (const [commentId, pending] of [...prototypeChanges]) {
			// One that does not build is left as it is on this machine, unrecorded: nobody is watching to be told why, and
			// the next Address on it starts again from what people saw.
			if (pending.projectId === projectId) await finishPrototypeChange(commentId).catch(() => undefined);
		}
	};
	/**
	 * The iteration's published page. Asked of GitHub as the person signed in to the app; nothing to say when they are
	 * not. Opening it works the address out again here, so the window never hands this an address to open.
	 */
	const publishedPage = async (projectId: string, name: string): Promise<PageStatus> => {
		if (github.state().state !== 'signedIn') return { state: 'none' };
		const key = prototypeKey(projectId, name);
		if (publishing.has(key)) return { state: 'publishing' };
		let status: PageStatus;
		try {
			status = await pageStatus(github, DESIGN_REPO, projectId, name);
		} catch (err) {
			// Most often the app's GitHub permission: reading the site and its deploys needs Pages and Deployments.
			return { state: 'unavailable', why: `GitHub would not say whether this is published: ${errorText(err)}` };
		}
		const stopped = publishStopped.get(key);
		return status.state === 'unpublished' && stopped ? { state: 'unpublished', why: stopped } : status;
	};
	/**
	 * Publishes what the app itself just made (a prototype it built, or a change Address made), in the background, as
	 * the agent publishes from Claude Code: the same code. What stopped it is kept, so the screen can say why the page
	 * is not published.
	 */
	// One deploy of a page at a time, and once more if asked again meanwhile: what changed since may have missed its push.
	const publishing = coalescingByKey<string>();
	const publishStopped = new Map<string, string>();
	/**
	 * Brings the site up to date with what GitHub has, by itself: on every cycle of the publisher (opening, focusing,
	 * refreshing, any record written), if a page was pushed, or what the site is built from changed, and no deploy has
	 * it, one is started. That can reach GitHub without a deploy (an edit made outside a save, a deploy that failed, a
	 * push from another machine), and nothing else would ever notice. Asked at most once a minute, and after a deploy
	 * that failed, once every ten, so a permission that is missing is not retried on every focus. A failed deploy of
	 * the site alone is only remembered for that pause: a page's failure is shown on its screen, and the cause (the
	 * permission) shows there too the next time a page is published.
	 */
	let lastCatchUp = 0;
	const catchUpSite = async (): Promise<void> => {
		const gap = publishStopped.size > 0 ? 10 * 60_000 : 60_000;
		if (github.state().state !== 'signedIn' || publishing.size > 0 || Date.now() - lastCatchUp < gap) return;
		lastCatchUp = Date.now();
		try {
			const behind = await siteBehind(github, DESIGN_REPO);
			if (behind?.kind === 'page') publishInBackground(behind.projectId, behind.name);
			else if (behind?.kind === 'code') redeployInBackground();
		} catch {
			// GitHub would not say: the review screen says so for the page being looked at.
		}
	};
	/** Runs a deploy in the background under `key`, one at a time for a key, and once more if asked again meanwhile. */
	const inBackground = (key: string, deploy: () => Promise<unknown>): void => {
		if (github.state().state !== 'signedIn') return;
		void publishing.run(key, () =>
			deploy()
				.then(() => void publishStopped.delete(key))
				.catch((err: unknown) => void publishStopped.set(key, errorText(err))),
		);
	};
	const publishInBackground = (projectId: string, name: string): void =>
		inBackground(prototypeKey(projectId, name), async () =>
			publish({ github, ref: DESIGN_REPO, ...(await recordsFrom(designClone())), projectId, name }),
		);
	/** The site, when what it is built from changed and no page did: it has no page of its own to key on. */
	const redeployInBackground = (): void =>
		inBackground('the site', async () => redeploySite({ github, ref: DESIGN_REPO, ...(await recordsFrom(designClone())) }));

	/**
	 * A prototype's accessibility (T7): its saved page, served as it is opened, checked in each of its states at its
	 * product's target, and kept beside it. Made again only when what it was made with changes.
	 */
	const prototypeAccessibility = async (projectId: string, name: string): Promise<AccessibilityResult> => {
		const html = await prototypePage(projectId, name);
		if (html === null) throw new Error('This prototype has no page yet.');
		const url = await servePrototype(projectId, name, html);
		const file = join(dirname(work.file(projectId, name)), `${name}.accessibility.json`);
		return accessibilityOf({ file, html, url, states: statesOf(html), target: await work.target(projectId, name), check: checkPage });
	};
	/**
	 * The picture of each prototype on its project's card (PROJECT_PICTURES_PLAN.md). Asked for by the list once it is on
	 * screen: every page built on this machine whose record does not name its picture is drawn, one at a time, and kept.
	 * Never while an agent works, as its page may be half written: the next time the list is opened does it.
	 */
	const coverDeps: CoverDeps = {
		store: recordStore,
		page: (projectId, name) => {
			const file = localPrototypeFile(prototypesRoot, projectId, name, 'html');
			return existsSync(file) ? readFileSync(file, 'utf8') : null;
		},
		serve: servePrototype,
		draw: drawCover,
		tried: new Set(),
	};
	/** Pictures read this session, by path: what is at a picture's path never changes, so it is read once. */
	const coversRead = new Map<string, string>();

	// Handoff: the heavy pass on codebase work, started here so the checks and the start are one step. Where the
	// branch stood when it started is kept, so the verdict can tell a handoff written now from one left from before.
	const handoffStarts = new Map<string, { branch: string; head: string }>();

	/** A record is text a person reads; anything larger than this is not one, and is cut rather than sent whole. */
	const MAX_RECORD = 400_000;

	// The preview. Every argument is re-checked here: the window is trusted less
	// than the main process, and the preview less than the window.
	const nothing = (_done?: unknown): null => null;
	return {
		window,
		ports,
		opened,
		runtime,
		agent,
		share,
		github,
		designRepo,
		page,
		memory,
		onPublishStatus,
		prototypesRoot,
		prototypeServer,
		sessions,
		cloneFolders,
		appearanceMemory,
		applyAppearance,
		cloner,
		installer,
		designLibrary,
		designSystems,
		storyPreviewsRoot,
		tokenBranchesFile,
		voiceBranchFile,
		measureStories,
		checkPage,
		drawCover,
		componentTokens,
		componentPicturesRoot,
		componentPictureRecipe,
		warmAfterMs,
		personGitHub,
		openRepository,
		descriptorFor,
		checkout,
		productCheckouts,
		cloneFolder,
		trustedRoot,
		recordsFor,
		publisher,
		written,
		signedInLogin,
		library,
		shownSystem,
		previews,
		componentPictures,
		warm,
		tokenBranches,
		voiceFile,
		MAX_VOICE,
		state,
		DESIGN,
		planClone,
		cloneAsPlanned,
		startAtSetup,
		assertAgentNotHere,
		startCodebaseWork,
		codebaseWorkOf,
		continueCodebaseWork,
		codebaseAccessibility,
		agentBusy,
		refuseWhileBusy,
		sharedGuidance,
		checkoutParts,
		startTracked,
		profiles,
		exportComments,
		designClone,
		recordStore,
		readDesignFile,
		readDesignBytes,
		readSkillText,
		work,
		prototypeReadiness,
		prototypeRun,
		startPrototypeAgent,
		serveShared,
		servePrototype,
		prototypePage,
		inFlight,
		once,
		me,
		prototypeChanges,
		finishPrototypeChange,
		finishPrototypeChanges,
		publishedPage,
		publishing,
		publishStopped,
		lastCatchUp,
		catchUpSite,
		inBackground,
		publishInBackground,
		redeployInBackground,
		prototypeAccessibility,
		coverDeps,
		coversRead,
		handoffStarts,
		MAX_RECORD,
		nothing,
	};
};
export type IpcDeps = ReturnType<typeof ipcDeps>;

/**
 * Every operation the window can reach, and nothing else, registered by area (`ipc/`). There is no generic invoke and no
 * passthrough: each handler is named, its arguments checked (`handle.ts`), its root resolved against what the person
 * actually opened, and its answer returned as a Result.
 */
export const registerIpc = (context: IpcContext): { publish: (force?: boolean) => Promise<void> } => {
	const d = ipcDeps(context);
	registerCheckout(d);
	registerClone(d);
	registerDesignSystem(d);
	registerCodebase(d);
	registerPrototypes(d);
	registerReview(d);
	registerPublishing(d);
	registerPage(d);
	registerAccount(d);
	return { publish: (force = false) => d.publisher.publish(force) };
};
