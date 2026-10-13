import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import type { Appearance } from '../shared/appearance';
import type { AccessibilityResult, Checkout, ClonePlan, Person, PublishStatus } from '../shared/contract';
import { statesOf } from '../shared/prototypeStates';
import { type Check, type EventSink, arg, clearRoutes } from './handle';
import type { Ports } from './ports';
import { type CheckPage, accessibilityOf } from './services/accessibilityCheck';
import { AGENT_BUSY, AgentRunner } from './services/agent';
import { AppearanceMemory } from './services/appearance';
import { classify } from './services/branchProjects';
import { syncBranches } from './services/branchSync';
import type { CheckoutMemory } from './services/checkoutMemory';
import { type Cloned, Cloner, type GitProgress, notClonedOver } from './services/clone';
import { CloneFolderMemory, clonePlace, cloneFolderOf, defaultCloneFolderDeps } from './services/cloneFolder';
import { codebaseWork } from './services/codebaseWork';
import { ComponentPictures } from './services/componentPictures';
import { ComponentTokens, type Measure } from './services/componentTokens';
import { singleFlight } from './services/concurrency';
import { DESCRIPTOR_PATH, readDescriptor, type WorkspaceDescriptor } from './services/descriptor';
import { DesignLibrary } from './services/designLibrary';
import { DesignRepo } from '../host/designRepo';
import { designStore } from './services/designStore';
import { syncRecords } from './services/designSync';
import { DesignSystemsMemory } from './services/designSystems';
import { defaultDiscoveryDeps, findProductCheckouts, recordsRootFor } from './services/discovery';
import { SessionMemory } from './services/editor';
import { isRepository, readCheckout } from './services/git';
import type { GitHubSession } from './services/githubSession';
import { Installer } from './services/install';
import { recordedIteration } from './services/iterations';
import { readFolderProjects } from './services/localProjects';
import type { PageView } from './services/pageView';
import { type CoverDeps, type DrawCover } from './services/projectCovers';
import { esbuildEntry, sharedFilesOf } from './services/prototypeBundle';
import { PrototypeServer } from './services/prototypeServer';
import { localPrototypeFile, prototypeWork } from './services/prototypeWork';
import { PublishManager, publishInOrder } from './services/publisher';
import { listedAs, reachableRepositories } from './services/repositories';
import { RuntimeManager } from './services/runtime';
import { OpenedCheckouts } from './services/session';
import { type ShareRunner } from './services/share';
import { siteDeploys } from './services/siteDeploys';
import { StoryPreviews } from './services/storyPreviews';
import { TokenBranches } from './services/tokenBranches';
import { VOICE_NEEDS_CLI, VoiceAndToneFile } from './services/voiceAndTone';
import { registerAccount } from './ipc/account';
import { registerCheckout } from './ipc/checkout';
import { registerClone } from './ipc/clone';
import { registerCodebase } from './ipc/codebase';
import { registerDesignSystem } from './ipc/designSystem';
import { registerPage } from './ipc/page';
import { registerPrototypes } from './ipc/prototypes';
import { registerPublishing } from './ipc/publishing';
import { registerReview } from './ipc/review';
import { formatRepo, repoRefOf } from '../shared/repoRef';
import { HOST } from '../shared/vocabulary';
import { DESIGN_REPO } from '../shared/config';

/**
 * What only the shell can do for the core without being seen: draw a page out of sight. In the app, hidden windows
 * (`storyMeasure.ts`, `accessibilityWindow.ts`, `coverWindow.ts`); in another shell, its own headless browser.
 */
export interface Headless {
	/** How stories are drawn to read what they draw (T6). */
	measure: Measure;
	/** How a page is checked for accessibility (T7): axe-core in each of its states. */
	scan: CheckPage;
	/** How a prototype's page is drawn as its picture on its project's card. */
	draw: DrawCover;
}

export interface IpcContext {
	/** How the core tells the window that something happened: the shell's. */
	emit: EventSink;
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
	/** The component library for the Design System tab: a test's own, else built from the connected design systems. */
	designLibrary?: DesignLibrary;
	/** The design systems the person connected. */
	designSystems: DesignSystemsMemory;
	/** Where the previews of the library's stories are built: the app's own folder, never the library's. */
	storyPreviewsRoot: string;
	/** Which branch each design system's change to its tokens is kept on (T4). */
	tokenBranchesFile: string;
	/** Which branch a change to the voice and tone is kept on (T9). */
	voiceBranchFile: string;
	/** Drawing out of sight: the shell's. */
	headless: Headless;
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
	emit,
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
	headless,
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
	/** The accepted checkout and the design records beside it, or null when either is not here. */
	const trustedRecords = (): { root: string; recordsRoot: string } | null => {
		const root = trustedRoot();
		const recordsRoot = root === null ? null : recordsRootFor(root);
		return root === null || recordsRoot === null ? null : { root, recordsRoot };
	};

	/**
	 * Keeps the person's work published: branches, then records. It runs by itself (when the list is read, when
	 * something is written, when the window is focused) and shows where it has got to, so nothing is left for
	 * anyone to remember. See `PublishManager`.
	 */
	const publisher = new PublishManager(
		{
			context: async () => {
				const trusted = trustedRecords();
				if (trusted === null) return null;
				const { root, recordsRoot } = trusted;
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

	/** Who is signed in to the app, as a person and by their GitHub login, or null. */
	const me = (): Person | null => {
		const s = github.state();
		return s.state === 'signedIn' ? { name: s.user.name ?? s.user.login, login: s.user.login } : null;
	};
	const signedInLogin = (): string | null => me()?.login ?? null;

	const library = designLibrary ?? new DesignLibrary({ systems: designSystems });
	const shownSystem = () => {
		const shown = library.current();
		return typeof shown === 'string' ? null : shown;
	};
	const previews = new StoryPreviews({ system: shownSystem, folder: storyPreviewsRoot, server: prototypeServer });
	// Which tokens each component draws with (T6), and its picture (P5), from one drawing pass.
	const componentPictures = new ComponentPictures({ folder: componentPicturesRoot, server: prototypeServer, recipe: componentPictureRecipe });
	const componentTokens =
		injectedComponentTokens ?? new ComponentTokens({ system: shownSystem, previews, measure: headless.measure, pictures: componentPictures });
	// The previews and the index are got ready in the background, so a component opened later is drawn at once: as the app
	// opens, and whenever the library has been read (it may have moved). For a commit already ready it is nothing.
	const warm = () => void componentTokens.warm();
	if (warmAfterMs !== undefined) setTimeout(warm, warmAfterMs).unref();
	const tokenBranches = new TokenBranches({ system: shownSystem, file: tokenBranchesFile, tools: ports.shareTools });
	// The voice and tone (T9): the connected design system's, read, saved and proposed with the person's own command line.
	const voiceFile = (): VoiceAndToneFile => {
		const system = shownSystem();
		if (system === null) throw new Error('No design system is connected. Connect one in Components: its voice and tone is in its agent files.');
		if (personGitHub === null) throw new Error(VOICE_NEEDS_CLI);
		return new VoiceAndToneFile({ repo: repoRefOf(system.repository), folder: system.folder, github: personGitHub, file: voiceBranchFile });
	};

	/**
	 * What the handlers change and share: the repositories the person can see (read once, then kept), and the clone and
	 * the install in progress, which Cancel stops.
	 */
	const state: { visible: string[]; cloning: AbortController | null; installing: AbortController | null } = {
		visible: [],
		cloning: null,
		installing: null,
	};
	const DESIGN = formatRepo(DESIGN_REPO);
	/**
	 * What cloning `repository` into `folder` would do. Cloning, from the New modal, is only of a repository the person's
	 * own GitHub list returned (the last list shown, or asked again), only into the clone folder, and with the design
	 * repository beside it when it is missing.
	 */
	const planClone = async (repository: string, folder: string, forDesignSystem = false): Promise<ClonePlan> => {
		if (state.visible.length === 0 && github.state().state === 'signedIn')
			state.visible = (await reachableRepositories(github, personGitHub, signedInLogin())).names;
		const listed = listedAs(state.visible, repository);
		if (listed === undefined)
			throw new Error(`${repository} is not one of the repositories your ${HOST} account can see. Sign in to ${HOST} in DSNR, then try again.`);
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
		const progress = (of: string) => (p: GitProgress) => emit('onCloneProgress', { repository: of, ...p });
		try {
			const cloned = await cloner.clone({ repository: plan.repository, visible: state.visible, folder }, progress(plan.repository), stop.signal);
			// The design repository is the app's own, named here, never by the window: it is the whole list it may clone.
			if (plan.design) await cloner.clone({ repository: DESIGN, visible: [DESIGN], folder }, progress(DESIGN), stop.signal);
			return { ...cloned, repository: plan.repository };
		} finally {
			state.cloning = null;
		}
	};
	// Starting and picking up a project's codebase work, never under a running agent (`codebaseWork`).
	const codebase = codebaseWork({
		agentIn: (canonical) => agent.runningIn(canonical),
		records: (projectId) => work.records(projectId),
		login: signedInLogin,
		written,
	});
	const { assertAgentNotHere } = codebase;

	/** Whether the one agent is working. Starting it is the runner's to refuse; this is for what must wait for it. */
	const agentBusy = (): boolean => agent.status().state === 'running';
	/** For what must not run under the agent, or writes something before starting it: nothing is left for a run that cannot. */
	const refuseWhileBusy = (): void => {
		if (agentBusy()) throw new Error(AGENT_BUSY);
	};

	/** The design repository's clone on this machine, when there is one. */
	const designClone = (): string | null => {
		const trusted = trustedRecords();
		return trusted === null ? null : dirname(trusted.recordsRoot);
	};
	/*
	 * The design repository's files (`designStore`). Everything prototypes write goes to one place per machine: the clone
	 * here when there is one, so the publisher sends it like every other record, and otherwise GitHub directly.
	 */
	const store = designStore({ clone: designClone, files: designRepo.files, onWrite: () => void publisher.publish(true) });
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

	/**
	 * The site's deploys, run in the background, and whether an iteration's page is on the site (`siteDeploys`): asked of
	 * GitHub as the person signed in to the app, and worked out again here, so the window never hands this an address to open.
	 */
	const deploys = siteDeploys({ github, designClone });
	const publishedPage = deploys.status;
	const publishInBackground = deploys.page;
	const catchUpSite = deploys.catchUp;

	/**
	 * A prototype's accessibility (T7): its saved page, served as it is opened, checked in each of its states at its
	 * product's target, and kept beside it. Made again only when what it was made with changes.
	 */
	const prototypeAccessibility = async (projectId: string, name: string): Promise<AccessibilityResult> => {
		const html = await prototypePage(projectId, name);
		if (html === null) throw new Error('This prototype has no page yet.');
		const url = await servePrototype(projectId, name, html);
		const file = join(dirname(work.file(projectId, name)), `${name}.accessibility.json`);
		return accessibilityOf({ file, html, url, states: statesOf(html), target: await work.target(projectId, name), check: headless.scan });
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
		draw: headless.draw,
		tried: new Set(),
	};

	return {
		emit,
		ports,
		opened,
		runtime,
		agent,
		share,
		github,
		designRepo,
		page,
		prototypesRoot,
		prototypeServer,
		sessions,
		cloneFolders,
		appearanceMemory,
		applyAppearance,
		installer,
		designSystems,
		componentTokens,
		personGitHub,
		openRepository,
		checkout,
		productCheckouts,
		cloneFolder,
		trustedRoot,
		trustedRecords,
		publisher,
		written,
		me,
		signedInLogin,
		library,
		previews,
		componentPictures,
		warm,
		tokenBranches,
		voiceFile,
		state,
		planClone,
		cloneAsPlanned,
		codebase,
		assertAgentNotHere,
		agentBusy,
		refuseWhileBusy,
		recordStore,
		readDesignFile,
		readDesignBytes,
		readSkillText,
		work,
		servePrototype,
		prototypePage,
		once,
		publishedPage,
		publishInBackground,
		prototypeAccessibility,
		coverDeps,
	};
};
export type IpcDeps = ReturnType<typeof ipcDeps>;

/**
 * Every operation the window can reach, and nothing else, registered by area (`ipc/`). There is no generic invoke and no
 * passthrough: each handler is named, its arguments checked (`handle.ts`), its root resolved against what the person
 * actually opened, and its answer returned as a Result.
 */
export const registerIpc = (context: IpcContext): { publish: (force?: boolean) => Promise<void> } => {
	clearRoutes();
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
