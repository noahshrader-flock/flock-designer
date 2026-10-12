import { type BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import {
	type AccessibilityResult,
	CHANNELS,
	type Checkout,
	type CheckoutSuggestion,
	type BuildInClaude,
	type ClonePlan,
	type MarkerRequest,
	PAGE_HOLD_REASONS,
	type PageBounds,
	type PageHoldReason,
	type MoveToCodePlan,
	type DesignSystemConnection,
	type OpenedPrototype,
	type Person,
	type PageStatus,
	type PrototypeAddressed,
	type PrototypeReadiness,
	type Project,
	type RepositoryList,
	type PublishStatus,
	type Result,
	type ReviewComment,
} from '../shared/contract';
import { type Appearance, isAppearance } from '../shared/appearance';
import { AGENT_BUSY, type AgentExtras, AgentRunner, agentReadiness, locateClaude } from './services/agent';
import { SessionMemory, findEditor, openFolder, openPrompt, openSession, resumeCommand, startCommand } from './services/editor';
import { CODEBASE_SKILL, HANDOFF_FILE, HANDOFF_SKILL, codebaseWorkPreamble, commandLine, handoffTask } from './services/engineeringHandoff';
import { lastVerdict } from '../shared/handoff';
import { type ShareRunner, type ShareTools, previewIsUp, pullRequestText } from './services/share';
import { realShareTools } from './services/shareTools';
import { buildContextReceipt } from './services/contextReceipt';
import { DESCRIPTOR_PATH, designSystemCheckout, findCommand, readDescriptor } from './services/descriptor';
import { branchCommit, branchExists, branchesWithFile, ensureLocalBranch, isRepository, readCheckout, recentBranches, runGit } from './services/git';
import { assertUsableProjectId, codebaseBranchFor, continueIteration, createIteration, readIterations, recordPreview, recordedIteration } from './services/iterations';
import { type Cloned, Cloner, type GitProgress, notClonedOver } from './services/clone';
import { INSTALL_COMMAND, Installer } from './services/install';
import { DesignLibrary } from './services/designLibrary';
import { DesignSystemsMemory } from './services/designSystems';
import { ProfileNames } from './services/profileNames';
import { StoryPreviews } from './services/storyPreviews';
import { tokenEditsOf } from './services/tokenEdits';
import { A11Y_COMMAND, fixRequest, productTarget, taskAccessibility } from './services/accessibilityBrief';
import { type CheckPage, accessibilityOf } from './services/accessibilityCheck';
import { TokenBranches } from './services/tokenBranches';
import { NEEDS_GH, VoiceAndToneFile } from './services/voiceAndTone';
import { ComponentTokens, type Measure } from './services/componentTokens';
import { ComponentPictures } from './services/componentPictures';
import { AppearanceMemory } from './services/appearance';
import { CloneFolderMemory, clonePlace, cloneFolderOf, defaultCloneFolderDeps } from './services/cloneFolder';
import { defaultDiscoveryDeps, findProductCheckouts, recordsRootFor } from './services/discovery';
import { gitHubRepoOf, listedAs, mergeRepositories, originOf, reachableRepositories } from './services/repositories';
import { ghApi } from './services/ghCli';
import { classify, readBranchProjects } from './services/branchProjects';
import { RuntimeManager } from './services/runtime';
import { ADDRESS_SKILL, chooseComment, prepareAddress } from './services/address';
import { projectTitle, writeCommentsExport } from './services/commentsExport';
import { syncRecords } from './services/designSync';
import { syncBranches } from './services/branchSync';
import { PublishManager, publishInOrder } from './services/publisher';
import { DESIGN_REPO, DesignRepo } from './services/designRepo';
import type { PageView } from './services/pageView';
import { assertPreviewUrl, sanitizeAnchor, sanitizePicture } from '../shared/anchor';
import type { GitHubSession } from './services/githubSession';
import { OpenedCheckouts } from './services/session';
import { readFolderProjects } from './services/localProjects';
import {
	coverPath,
	folderName,
	isRecordName,
	iterationLabel,
	mergeProjects,
	prototypeKey,
	prototypePagePath,
	shownRecord,
	unionLocal,
	workKind,
} from '../shared/projects';
import { resolveInside } from './services/paths';
import { PrototypeServer } from './services/prototypeServer';
import { esbuildEntry, sharedFilesOf } from './services/prototypeBundle';
import { statesOf } from '../shared/prototypeStates';
import { type PrototypeChange, localPrototypeFile, prototypeWork, whereTheChangeGoes } from './services/prototypeWork';
import { type CoverDeps, type DrawCover, builtHere, ensureCovers } from './services/projectCovers';
import { jpegDataUrl } from './services/picture';
import { pageStatus, publish, recordsFrom, redeploySite, siteBehind } from './services/pages';
import {
	BUILD_SKILL,
	MOVE_SKILL,
	type RecordStore,
	assertPrototypeName,
	assignFolder,
	cloneStore,
	moveToCodePrompt,
	moveToCodeTask,
	prototypeAddressTask,
	prototypeBuildTask,
	prototypeReadable,
	type PrototypeSources,
} from './services/prototype';
import type { CheckoutMemory } from './services/checkoutMemory';

/**
 * Every operation the window can reach, and nothing else.
 *
 * There is no generic invoke and no passthrough. Each handler is named, takes
 * typed arguments, resolves the root against what the designer actually opened,
 * and returns a Result rather than throwing across the boundary -- an exception
 * crossing IPC arrives as a shapeless string, which is how a real problem turns
 * into "something went wrong".
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: unknown): Result<never> => ({
	ok: false,
	error: error instanceof Error ? error.message : String(error),
});

const guard =
	<Args extends unknown[], T>(fn: (...args: Args) => Promise<T> | T) =>
	async (_event: Electron.IpcMainInvokeEvent, ...args: Args): Promise<Result<T>> => {
		try {
			return ok(await fn(...args));
		} catch (err) {
			return fail(err);
		}
	};

export interface IpcContext {
	window: BrowserWindow;
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
	prototypesRoot?: string;
	prototypeServer?: PrototypeServer;
	/** The latest agent conversation for each branch, so it can be continued in the person's editor. */
	sessions?: SessionMemory;
	/** Where this person's clones go, once they choose. */
	cloneFolders?: CloneFolderMemory;
	/** The appearance they chose (Settings), and how it is applied to the app: the system's theme setting, in the app. */
	appearanceMemory?: AppearanceMemory;
	applyAppearance?: (appearance: Appearance) => void;
	/** Clones what the New modal asks for. Given for tests, to clone from this machine instead of GitHub. */
	cloner?: Cloner;
	installer?: Installer;
	/** The component library for the Design System tab. Given for tests, to read a library made for them. */
	designLibrary?: DesignLibrary;
	/** The design systems the person connected. */
	designSystems?: DesignSystemsMemory;
	/**
	 * GitHub as the person's own account sees it (its command line), so every repository they can reach is listed, not
	 * only those the app's GitHub App is installed on. Null where there is none; given for tests.
	 */
	personGitHub?: Pick<GitHubSession, 'api'> | null;
	/** Where the previews of the library's stories are built: the app's own folder, never the library's. */
	storyPreviewsRoot?: string;
	/** Which branch each design system's change to its tokens is kept on (T4); and the GitHub tools it is proposed with. */
	tokenBranchesFile?: string;
	tokenBranchTools?: (root: string) => ShareTools;
	/** Which branch a change to the voice and tone is kept on (T9). */
	voiceBranchFile?: string;
	/** How stories are drawn to read what they draw (T6): hidden windows, in the app. */
	measureStories?: Measure;
	/** How a page is checked for accessibility (T7): axe-core in a hidden window, in the app. */
	checkPage?: CheckPage;
	/** How a prototype's page is drawn as its picture on its project's card: a hidden window, in the app. */
	drawCover?: DrawCover;
	/**
	 * Which tokens each component draws with (T6), and so what is got ready in the background: given for tests.
	 */
	componentTokens?: Pick<ComponentTokens, 'of' | 'warm' | 'pictures'>;
	/** Where the pictures of the components are kept (P5): the app's own folder. */
	componentPicturesRoot?: string;
	/** How the pictures are taken: a fingerprint, so only pictures taken that way are shown. */
	componentPictureRecipe?: string;
	/** When to start getting the shown design system ready after the app opens; not at all when absent. */
	warmAfterMs?: number;
}

export const registerIpc = ({
	window,
	opened,
	runtime,
	agent,
	share,
	github,
	designRepo,
	page,
	memory,
	onPublishStatus,
	prototypesRoot = join(tmpdir(), 'dsnr-prototypes'),
	prototypeServer = new PrototypeServer(),
	sessions = new SessionMemory(join(tmpdir(), 'dsnr-agent-sessions.json')),
	cloneFolders = new CloneFolderMemory(join(tmpdir(), 'dsnr-clone-folder.json')),
	appearanceMemory = new AppearanceMemory(join(tmpdir(), 'dsnr-appearance.json')),
	applyAppearance = () => undefined,
	cloner = new Cloner(),
	installer = new Installer(),
	designLibrary,
	designSystems = new DesignSystemsMemory(join(tmpdir(), 'dsnr-design-system.json')),
	personGitHub = ghApi(),
	storyPreviewsRoot = join(tmpdir(), 'dsnr-story-previews'),
	tokenBranchesFile = join(tmpdir(), 'dsnr-token-branches.json'),
	tokenBranchTools = (root: string) => realShareTools(root),
	voiceBranchFile = join(tmpdir(), 'dsnr-voice-branch.json'),
	measureStories = async () => {
		throw new Error('Stories can be drawn only in the app.');
	},
	checkPage = async () => {
		throw new Error('Pages can be checked only in the app.');
	},
	drawCover = async () => {
		throw new Error('Pictures of prototypes can be drawn only in the app.');
	},
	componentTokens: injectedComponentTokens,
	componentPicturesRoot = join(tmpdir(), 'dsnr-component-pictures'),
	componentPictureRecipe = 'for tests',
	warmAfterMs,
}: IpcContext): { publish: (force?: boolean) => Promise<void> } => {
	const openRepository = async (root: string): Promise<Checkout> => {
		if (!isRepository(root)) {
			throw new Error(`${root} is not a git repository.`);
		}
		const canonical = opened.remember(root);
		memory.write(canonical);
		return readCheckout(canonical);
	};

	const descriptorFor = (root: string) => readDescriptor(opened.require(root));

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

	ipcMain.handle(
		CHANNELS.chooseCheckout,
		guard(async (): Promise<Checkout | null> => {
			const { canceled, filePaths } = await dialog.showOpenDialog(window, {
				title: 'Open a product repository',
				properties: ['openDirectory'],
			});
			const chosen = filePaths[0];
			if (canceled || chosen === undefined) {
				return null;
			}
			return openRepository(chosen);
		}),
	);

	ipcMain.handle(
		CHANNELS.lastCheckout,
		guard(async (): Promise<Checkout | null> => {
			const root = trustedRoot();
			return root === null ? null : openRepository(root);
		}),
	);

	// Finding a repository grants it nothing: this only describes one, and
	// `useCheckout` is the step that trusts it.
	ipcMain.handle(
		CHANNELS.suggestCheckout,
		guard((): CheckoutSuggestion | null => {
			if (trustedRoot() !== null) return null;
			const root = productCheckouts()[0];
			if (root === undefined) return null;
			try {
				return { root, name: basename(root), product: readDescriptor(root).product };
			} catch {
				// A descriptor we cannot read is not a repository we should offer.
				return null;
			}
		}),
	);

	ipcMain.handle(
		CHANNELS.useCheckout,
		guard(async (root: string): Promise<Checkout> => {
			// Only ever a repository discovery itself found, so the renderer cannot
			// name an arbitrary directory and have it trusted.
			if (!productCheckouts().includes(root)) {
				throw new Error('That is not a repository DSNR found on this machine.');
			}
			return openRepository(root);
		}),
	);

	ipcMain.handle(CHANNELS.cloneFolder, guard(cloneFolder));

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
	const componentTokens = injectedComponentTokens ?? new ComponentTokens({ system: shownSystem, previews, measure: measureStories, pictures: componentPictures });
	ipcMain.handle(CHANNELS.componentPictures, guard(() => componentTokens.pictures()));
	// The previews and the index are got ready in the background, so a component opened later is drawn at once: as the app
	// opens, and whenever the library has been read (it may have moved). For a commit already ready it is nothing.
	const warm = () => void componentTokens.warm();
	if (warmAfterMs !== undefined) setTimeout(warm, warmAfterMs).unref();
	ipcMain.handle(
		CHANNELS.designSystemCatalog,
		guard(async (refresh: unknown) => {
			const catalog = await library.catalog(refresh === true);
			if (catalog.state === 'ready') warm();
			return catalog;
		}),
	);
	// A change is only ever a list of token edits, checked here and again before anything is written (T3, T4).
	ipcMain.handle(CHANNELS.storyPreview, guard((edits: unknown) => previews.preview(tokenEditsOf(edits))));
	// The window names a story file, and only a story file of the library is answered.
	ipcMain.handle(
		CHANNELS.componentTokens,
		guard((file: unknown) => {
			if (typeof file !== 'string' || file.length === 0 || file.length > 500) throw new Error('A component is asked for by its story file.');
			return componentTokens.of(file);
		}),
	);
	const tokenBranches = new TokenBranches({ system: shownSystem, file: tokenBranchesFile, tools: tokenBranchTools });
	ipcMain.handle(CHANNELS.tokenBranch, guard(() => tokenBranches.current()));
	ipcMain.handle(CHANNELS.saveTokens, guard((edits: unknown) => tokenBranches.save(tokenEditsOf(edits))));
	ipcMain.handle(CHANNELS.proposeTokens, guard(() => tokenBranches.propose()));
	ipcMain.handle(CHANNELS.forgetTokenBranch, guard(() => (tokenBranches.forget(), null)));
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
	ipcMain.handle(CHANNELS.voiceAndTone, guard(() => voiceFile().current()));
	ipcMain.handle(
		CHANNELS.saveVoiceAndTone,
		guard((text: unknown, against: unknown) => {
			if (typeof text !== 'string' || text.length > MAX_VOICE) throw new Error('The voice and tone is saved as text, up to 200,000 characters.');
			// A blob's sha: 40 hex, or 64 in a repository on SHA-256.
			if (against !== null && (typeof against !== 'string' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(against))) throw new Error('A save is made against the file’s sha.');
			return voiceFile().save(text, against);
		}),
	);
	ipcMain.handle(CHANNELS.proposeVoiceAndTone, guard(() => voiceFile().propose()));
	ipcMain.handle(CHANNELS.forgetVoiceBranch, guard(() => (voiceFile().forget(), null)));
	ipcMain.handle(CHANNELS.designSystems, guard(() => designSystems.read()));
	ipcMain.handle(CHANNELS.selectDesignSystem, guard((id: string) => (designSystems.select(String(id)), null)));
	// Removed with everything the app keeps of it: its pictures too (P5).
	ipcMain.handle(
		CHANNELS.removeDesignSystem,
		guard((id: string) => {
			designSystems.remove(String(id));
			componentPictures.forget(String(id));
			return null;
		}),
	);
	// Chosen with the system's picker, here: the window never names a folder to put files in.
	ipcMain.handle(
		CHANNELS.chooseCloneFolder,
		guard(async (): Promise<string | null> => {
			const { canceled, filePaths } = await dialog.showOpenDialog(window, {
				title: 'Choose where repositories are cloned',
				defaultPath: cloneFolder(),
				properties: ['openDirectory', 'createDirectory'],
			});
			const chosen = filePaths[0];
			if (canceled || chosen === undefined) return null;
			cloneFolders.write(chosen);
			return chosen;
		}),
	);

	/**
	 * Cloning, from the New modal: only a repository the person's own GitHub list returned (the last list shown, or asked
	 * again), only into the clone folder, and the design repository beside it when it is missing.
	 */
	let visible: string[] = [];
	let cloning: AbortController | null = null;
	const DESIGN = `${DESIGN_REPO.owner}/${DESIGN_REPO.repo}`;
	/** What cloning `repository` into `folder` would do. */
	const planClone = async (repository: string, folder: string, forDesignSystem = false): Promise<ClonePlan> => {
		if (visible.length === 0 && github.state().state === 'signedIn') visible = (await reachableRepositories(github, personGitHub, signedInLogin())).names;
		const listed = listedAs(visible, repository);
		if (listed === undefined) throw new Error(`${repository} is not one of the repositories your GitHub account can see. Sign in to GitHub in DSNR, then try again.`);
		const design = clonePlace(folder, DESIGN);
		const place = clonePlace(folder, listed);
		const home = homedir();
		const where = place.path.startsWith(home + sep) ? `~${place.path.slice(home.length)}` : place.path;
		// The design system is read, not worked in, so it needs no design repository beside it.
		return { repository: listed, place, where, design: design.state === 'cloned' || forDesignSystem ? null : design };
	};
	ipcMain.handle(CHANNELS.clonePlan, guard((repository: string, forDesignSystem: unknown) => planClone(repository, cloneFolder(), forDesignSystem === true)));
	/**
	 * Clones what `planClone` says, with its progress sent to the window and `cancelClone` able to stop it: the repository,
	 * and the design repository beside it when the plan has one. Where it went, and whether it was cloned or already there.
	 */
	const cloneAsPlanned = async (repository: string, forDesignSystem = false): Promise<Cloned & { repository: string }> => {
		const folder = cloneFolder();
		const plan = await planClone(repository, folder, forDesignSystem);
		// Both asked first, so the product is not cloned only for the design repository to be in the way.
		for (const p of [plan.place, plan.design]) if (p?.state === 'taken') throw new Error(notClonedOver(p.why));
		const stop = (cloning = new AbortController());
		const progress = (of: string) => (p: GitProgress) => window.webContents.send(CHANNELS.cloneProgress, { repository: of, ...p });
		try {
			const cloned = await cloner.clone({ repository: plan.repository, visible, folder }, progress(plan.repository), stop.signal);
			// The design repository is the app's own, named here, never by the window: it is the whole list it may clone.
			if (plan.design) await cloner.clone({ repository: DESIGN, visible: [DESIGN], folder }, progress(DESIGN), stop.signal);
			return { ...cloned, repository: plan.repository };
		} finally {
			cloning = null;
		}
	};
	ipcMain.handle(
		CHANNELS.cloneRepository,
		guard(async (repository: string): Promise<Checkout> => {
			const { path: product, cloned: fresh, repository: listed } = await cloneAsPlanned(repository);
			await startAtSetup(listed, product, fresh);
			return openRepository(product);
		}),
	);
	// Only a design system, refused by name before anything is downloaded; then connected like a folder that was located.
	// Connecting a design system (P4): cloned or used where it is, then looked in (`DesignLibrary.connect`).
	ipcMain.handle(
		CHANNELS.connectDesignSystem,
		guard(async (repository: string): Promise<DesignSystemConnection> => {
			const cloned = await cloneAsPlanned(String(repository), true);
			return library.connect(cloned.repository, cloned.path);
		}),
	);
	ipcMain.handle(
		CHANNELS.chooseDesignSystem,
		guard((repository: string, folder: string): DesignSystemConnection => library.choose(String(repository), String(folder))),
	);
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
		await runGit(root, ['checkout', '-q', good]);
	};
	ipcMain.handle(
		CHANNELS.cancelClone,
		guard(() => {
			cloning?.abort();
			return null;
		}),
	);

	ipcMain.handle(
		CHANNELS.listRepositories,
		guard(async (): Promise<RepositoryList> => {
			const clones = productCheckouts().map((root) => {
				const origin = originOf(root);
				return { root, repo: origin === null ? null : gitHubRepoOf(origin) };
			});
			// Signed out, or GitHub out of reach: what is on this machine can still be started in.
			const remote = github.state().state === 'signedIn' ? await reachableRepositories(github, personGitHub, signedInLogin()) : { names: [], reach: 'none' as const };
			if (remote.names.length > 0) visible = remote.names;
			return { repositories: mergeRepositories(remote.names, clones), reach: remote.reach };
		}),
	);

	ipcMain.handle(
		CHANNELS.listBaseBranches,
		guard((root: string) => recentBranches(opened.require(root))),
	);
	ipcMain.handle(
		CHANNELS.branchesWithSetup,
		guard((root: string) => branchesWithFile(opened.require(root), DESCRIPTOR_PATH)),
	);

	// Re-reads a checkout the person already opened; it trusts and remembers nothing, so the window naming a folder
	// is never enough to make it trusted (only the picker, a repository discovery found, the last one, and a clone are).
	ipcMain.handle(CHANNELS.readCheckout, guard((root: string) => readCheckout(opened.require(root))));

	ipcMain.handle(
		CHANNELS.readContextReceipt,
		guard((root: string) => buildContextReceipt(opened.require(root), descriptorFor(root))),
	);

	ipcMain.handle(
		CHANNELS.listIterations,
		guard((root: string, projectId: string) =>
			readIterations(recordsFor(opened.require(root)), projectId),
		),
	);

	/** Switching branches under a running agent changes the files it is working on mid-run. */
	const assertAgentNotHere = (canonical: string): void => {
		if (agent.runningIn(canonical)) {
			throw new Error(`The agent is working in ${basename(canonical)}, and this would change its branch. Wait for it to finish, or take it over, then try again.`);
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
		const setup = `${descriptor.contextDir}/workspace.json`;
		if (!(await runGit(canonical, ['cat-file', '-e', `refs/heads/${branch}:${setup}`]).then(() => true, () => false))) {
			throw new Error(`${branch} has no ${setup}, so work cannot start from it. Start from a branch that has the DSNR setup.`);
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
		await continueIteration(canonical, recordsFor(canonical), projectId, 'codebase', me.state === 'signedIn' ? me.user.login : null, descriptorFor(root));
	}

	ipcMain.handle(
		CHANNELS.continueIteration,
		guard(async (root: string, projectId: string, name: string) => {
			const canonical = opened.require(root);
			// Opening the run's own work is fine: the checkout is already on its branch, so nothing moves.
			if (agent.runningIn(canonical)) {
				const wanted = await recordedIteration(canonical, recordsFor(canonical), descriptorFor(root), projectId, name);
				if ((await readCheckout(canonical)).branch !== wanted.branch) assertAgentNotHere(canonical);
			}
			const recordsRoot = recordsFor(canonical);
			const me = github.state();
			const login = me.state === 'signedIn' ? me.user.login : null;
			return written(await continueIteration(canonical, recordsRoot, projectId, name, login, descriptorFor(root)));
		}),
	);

	ipcMain.handle(
		CHANNELS.startCommand,
		guard((root: string, commandId: string, projectId?: string) =>
			runtime.start(opened.require(root), descriptorFor(root), commandId, projectId),
		),
	);

	ipcMain.handle(
		CHANNELS.stopCommand,
		guard((root: string, commandId: string) => {
			opened.require(root);
			return runtime.stop(commandId);
		}),
	);

	ipcMain.handle(
		CHANNELS.commandStatus,
		guard((root: string, commandId: string) => {
			opened.require(root);
			return runtime.status(commandId);
		}),
	);

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
			note: ['', '', '## Also yours to read (never change)', '', ...found.map(([what, d]) => `- ${what}: \`${d}\``)].join('\n'),
		};
	};

	/**
	 * Starts a run the person can come back to: tagged with its branch, its conversation named and kept (so it can
	 * be continued in VS Code), and given the shared guidance to read and the accessibility rules and the product's target
	 * (T7). Every run in a product checkout starts here.
	 */
	const startTracked = async (
		canonical: string,
		projectId: string,
		task: string,
		{ branch, addDirs, purpose }: { branch: string | null; addDirs: string[]; purpose?: AgentExtras['purpose'] },
	) => {
		const session = randomUUID();
		const shared = sharedGuidance(canonical);
		const accessibility = await codebaseAccessibility(canonical);
		// The voice and tone (T9), from the design system beside this product; nothing while it is blank.
		const voice = await work.voice(canonical);
		// Joining the run already going on this branch keeps that run's conversation, not this new name for it.
		const joining = agentBusy();
		const started = agent.start(canonical, projectId, `${task}${shared.note}\n\n${accessibility}${voice ? `\n\n${voice}` : ''}`, {
			// The project's records live in the design repository, beside the product checkout.
			addDirs,
			readOnly: shared.dirs,
			...(branch !== null ? { work: branch } : {}),
			...(purpose ? { purpose } : {}),
			session,
			name: `DSNR: ${projectId}`,
		});
		if (!joining && started.state === 'running' && branch !== null) sessions.write(canonical, branch, session);
		return started;
	};

	ipcMain.handle(
		CHANNELS.startAgent,
		guard(async (root: string, projectId: string, task: string) => {
			// Same rule startCommand applies. This one is interpolated into the agent's
			// prompt, and the agent runs unattended with edit permission, so an
			// unchecked value here is prompt injection rather than argv injection.
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const branch = (await readCheckout(canonical)).branch;
			// On the project's codebase branch, the shared rules for unattended codebase work, and this product's light check.
			const descriptor = descriptorFor(root);
			const skill = branch === codebaseBranchFor(descriptor, projectId) ? await readDesignFile(CODEBASE_SKILL) : null;
			const preamble = skill ? codebaseWorkPreamble(skill, commandLine(descriptor.commands, 'check-iteration', projectId)) : '';
			// A prototype being moved into the code is read from the app's own copy of it.
			const prototypeFolder = join(prototypesRoot, projectId);
			return startTracked(canonical, projectId, `${preamble}${task}`, {
				branch,
				addDirs: [recordsFor(canonical), ...(existsSync(prototypeFolder) ? [prototypeFolder] : [])],
			});
		}),
	);

	// Handing the work to the person, in VS Code. Only ever on a click: it opens another application.
	ipcMain.handle(
		CHANNELS.editorState,
		guard((root: string, branch: string) => ({
			editor: findEditor() !== null,
			session: sessions.read(opened.require(root), String(branch)) !== null,
		})),
	);
	ipcMain.handle(
		CHANNELS.openInEditor,
		guard(async (root: string) => {
			const canonical = opened.require(root);
			const editor = findEditor();
			if (editor) await openFolder(editor, canonical);
			else await shell.openPath(canonical);
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.continueInClaude,
		guard(async (root: string, branch: string): Promise<'editor' | 'terminal'> => {
			const canonical = opened.require(root);
			const found = sessions.read(canonical, String(branch));
			if (!found) throw new Error('There is no agent conversation for this work on this machine.');
			// Taking over a run still going: one conversation has one writer, so the app's run stops, but only once
			// the way to continue it is there: a folder that would not open must not cost the run.
			const takeOver = () => {
				if (agent.runningSession() === found.session) agent.stop();
			};
			const editor = findEditor();
			if (editor) {
				await openSession(editor, found, takeOver);
				return 'editor';
			}
			clipboard.writeText(resumeCommand(locateClaude(), found));
			takeOver();
			await dialog.showMessageBox({
				type: 'info',
				message: 'The command to continue is copied',
				detail: 'VS Code with the Claude Code extension is not installed here. Paste the command into a terminal to continue the same conversation.',
			});
			return 'terminal';
		}),
	);

	ipcMain.handle(CHANNELS.agentStatus, guard(() => agent.status()));
	ipcMain.handle(CHANNELS.agentRecent, guard(() => agent.recentLines()));
	ipcMain.handle(CHANNELS.agentReadiness, guard(() => agentReadiness()));

	// One click: read the comments now, write the file from that read, then start the agent. Nothing
	// a reviewer wrote is put in the task; it reaches the agent only through the file.
	ipcMain.handle(
		CHANNELS.addressComments,
		guard(async (root: string, projectId: string, name: string, commentId: number) => {
			assertUsableProjectId(projectId);
			// The window supplies this, so it is checked like anything else that crosses the boundary.
			// There is no batch: a request with no comment is a mistake, not a request for all of them.
			if (!Number.isSafeInteger(commentId)) throw new Error('That is not a comment.');
			const canonical = opened.require(root);
			const recordsRoot = recordsFor(canonical);
			const iteration = await recordedIteration(canonical, recordsRoot, descriptorFor(root), projectId, name);
			const skill = await readDesignFile(ADDRESS_SKILL);
			const prepared = await prepareAddress(
				{
					readComments: () => designRepo.readComments(projectId, iteration.branch),
					checkout: () => readCheckout(canonical),
					agentRunning: agentBusy,
					skill: () => skill,
					title: projectTitle(recordsRoot, projectId),
				},
				{ recordsRoot, projectId, iteration, commentId },
			);
			return startTracked(canonical, projectId, prepared.task, { branch: null, addDirs: [recordsRoot] });
		}),
	);

	// Sharing. The branch comes from this person's own record, never from the window, and
	// the repository's descriptor says what a share is. Starts and returns: it takes minutes.
	ipcMain.handle(
		CHANNELS.shareIteration,
		guard(async (root: string, projectId: string, name: string) => {
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const descriptor = descriptorFor(root);
			const { share: how } = descriptor;
			if (!how) {
				throw new Error(`${descriptor.product} does not say how a shared preview is built, so it cannot be shared from here.`);
			}
			const recordsRoot = recordsFor(canonical);
			const iteration = await recordedIteration(canonical, recordsRoot, descriptor, projectId, name);
			// Only what is committed goes up. Sharing a branch with unsaved edits would show reviewers less than the designer sees.
			const here = await readCheckout(canonical);
			if (here.branch === iteration.branch && !here.clean) {
				throw new Error(`There are uncommitted changes on ${iteration.branch}, and only committed work is shared. Commit them, then share again.`);
			}
			// The commit that goes up now, which is what reviewers will be looking at.
			const shared = await branchCommit(canonical, iteration.branch).catch(() => undefined);
			return share.start({
				request: {
					share: how,
					kind: workKind(iteration),
					projectId,
					name,
					branch: iteration.branch,
					...pullRequestText(projectId, name),
				},
				tools: realShareTools(canonical),
				// Saved, then published, and only then is the link called ready: a reviewer cannot open what is not up yet.
				record: async (url, prUrl) => {
					recordPreview(recordsRoot, projectId, name, url, shared, prUrl);
					await publisher.publish(true);
				},
			});
		}),
	);
	ipcMain.handle(CHANNELS.shareStatus, guard(() => share.status()));

	// Publishing happens by itself; these only report it, and let a person ask for it now.
	ipcMain.handle(CHANNELS.publishStatus, guard(() => publisher.status()));
	ipcMain.handle(
		CHANNELS.publishNow,
		guard(async () => {
			await publisher.publish(true);
			return publisher.status();
		}),
	);
	ipcMain.handle(
		CHANNELS.previewReachable,
		guard(async (url: string): Promise<boolean> => {
			const checked = assertPreviewUrl(String(url));
			try {
				const res = await fetch(checked, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
				await res.body?.cancel();
				return previewIsUp(res.status);
			} catch {
				return false;
			}
		}),
	);

	// Sign-in. No handler returns a token: the renderer only ever learns whether
	// someone is signed in, and who.
	ipcMain.handle(CHANNELS.signInStart, guard(() => github.startSignIn()));
	ipcMain.handle(
		CHANNELS.signInCancel,
		guard(() => {
			github.cancelSignIn();
			return null;
		}),
	);
	ipcMain.handle(CHANNELS.signInState, guard(() => github.state()));
	ipcMain.handle(
		CHANNELS.signOut,
		guard(() => {
			github.signOut();
			return null;
		}),
	);

	/** Names people by their GitHub profile, once each, so a person is the same name wherever they appear. */
	const profiles = new ProfileNames((path) => github.api(path));
	// Reviewer mode: read through the API, never a checkout.
	// Everything on GitHub plus everything built on this machine. Work made here
	// must appear here, shared or not, so the two are merged; if GitHub cannot be
	// reached, what is local still shows.
	ipcMain.handle(
		CHANNELS.listProjects,
		guard(async (): Promise<Project[]> => {
			// The gate, not the discovery list: nothing is read or run in a repository
			// this person has not accepted.
			const root = trustedRoot();
			const me = github.state();
			const login = me.state === 'signedIn' ? me.user.login : null;
			let local: Project[] = [];
			// The checkout's repository on GitHub, for codebase work recorded before records named it.
			let here: { repository: string; branchOf: (projectId: string) => string } | null = null;
			if (root !== null) {
				opened.require(root);
				const recordsRoot = recordsRootFor(root);
				// Every project folder, not only those that record an iteration: the folder is what an agent makes
				// first, and it is what vouches for a `feature/<id>` branch (see readBranchProjects).
				const folders = recordsRoot ? readFolderProjects(recordsRoot) : [];
				// The branches are the evidence: work made without the app still shows.
				const branches = await readBranchProjects(
					root,
					readDescriptor(root),
					login,
					new Set(folders.map((p) => p.id)),
				).catch(() => []);
				// A folder with nothing built yet is a notes folder, not work in progress.
				local = unionLocal(folders, branches).filter((p) => p.iterations.length > 0);
				const origin = originOf(root);
				const repository = origin === null ? null : gitHubRepoOf(origin);
				const descriptor = readDescriptor(root);
				if (repository) here = { repository, branchOf: (projectId) => codebaseBranchFor(descriptor, projectId) };
			}
			let remote: Project[] = [];
			try {
				remote = await designRepo.listProjects();
			} catch (err) {
				if (local.length === 0) throw err;
			}
			// Reading the list is a good moment to make sure what it shows is published.
			void publisher.publish();
			const merged = mergeProjects(remote, local);
			// Work on this checkout's codebase branch for a project is in this checkout's repository.
			const located = here === null ? merged : merged.map((p) => ({
				...p,
				iterations: p.iterations.map((it) => (workKind(it) === 'codebase' && !it.repository && it.branch === here.branchOf(p.id) ? { ...it, repository: here.repository } : it)),
			}));
			return profiles.nameEveryone(located);
		}),
	);
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
				readIterations(recordsRoot, projectId).find((i) => i.branch === branch)?.name ??
				classify(readDescriptor(root as string), branch)?.name;
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
	const recordStore = (): RecordStore => {
		const clone = designClone();
		return clone !== null
			? cloneStore(clone, () => void publisher.publish(true))
			: {
					read: (path) => designRepo.readFile(path),
					readBytes: (path) => designRepo.readBytes(path),
					has: (path) => designRepo.hasFile(path),
					write: (path, content, message) => designRepo.writeFile(path, content, message),
				};
	};
	/**
	 * A file from the design repository: through the record store, and from GitHub when the clone here does not have
	 * it yet (a colleague's work not pulled). Without a clone the store already is GitHub, so it is asked once. As text,
	 * or as the bytes of a picture.
	 */
	const fromDesignRepo = async <T>(here: T | null, there: () => Promise<T | null>): Promise<T | null> =>
		here !== null || designClone() === null ? here : there();
	const readDesignFile = async (path: string): Promise<string | null> => fromDesignRepo(await recordStore().read(path), () => designRepo.readFile(path));
	const readDesignBytes = async (path: string): Promise<Buffer | null> => fromDesignRepo(await recordStore().readBytes(path), () => designRepo.readBytes(path));
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

	// Installing a repository's packages, from the New modal: only the command it declares, one at a time, stoppable.
	let installing: AbortController | null = null;
	ipcMain.handle(
		CHANNELS.installPackages,
		guard(async (root: string): Promise<null> => {
			const canonical = opened.require(root);
			// Its packages change under a running agent otherwise.
			if (agent.runningIn(canonical)) throw new Error(`The agent is working in ${basename(canonical)}. Install the packages when it has finished.`);
			const command = findCommand(descriptorFor(root), INSTALL_COMMAND);
			const stop = (installing = new AbortController());
			try {
				await installer.install(canonical, command, (line) => window.webContents.send(CHANNELS.installLine, line), stop.signal);
			} finally {
				installing = null;
			}
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.cancelInstall,
		guard(() => {
			installing?.abort();
			return null;
		}),
	);
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
	/** Runs `work` once at a time per key: a second caller waits for the first and shares its answer. */
	const inFlight = new Map<string, Promise<unknown>>();
	const once = <T>(key: string, work: () => Promise<T>): Promise<T> => {
		const running = inFlight.get(key) as Promise<T> | undefined;
		if (running) return running;
		const p = work().finally(() => inFlight.delete(key));
		inFlight.set(key, p);
		return p;
	};
	const me = (): Person | null => {
		const s = github.state();
		return s.state === 'signedIn' ? { name: s.user.name ?? s.user.login, login: s.user.login } : null;
	};

	ipcMain.handle(CHANNELS.prototypeReadiness, guard((root: string) => prototypeReadiness(root)));

	ipcMain.handle(
		CHANNELS.createPrototype,
		guard(async (projectId: string, title: string, note: string, from: { root: string; branch: string } | null, folder?: unknown) => {
			// What it is modeled on is not optional: a prototype is built from a repository's real design system.
			if (!from) throw new Error('A prototype is modeled on a branch of a repository on this machine. Choose one.');
			// Only a repository this person accepted, and a branch in it, made local when it is only on GitHub.
			const root = opened.require(from.root);
			await ensureLocalBranch(root, from.branch);
			return work.start(root, { projectId, title, note, branch: from.branch, me: me(), folder: folderName(folder) });
		}),
	);
	ipcMain.handle(
		CHANNELS.appearance,
		guard(async () => appearanceMemory.read()),
	);
	ipcMain.handle(
		CHANNELS.setAppearance,
		guard(async (appearance: unknown) => {
			if (!isAppearance(appearance)) throw new Error('That is not an appearance: Auto, Light or Dark.');
			// Applied before it is kept: a setting that could not be applied must not be what the app opens with.
			applyAppearance(appearance);
			appearanceMemory.write(appearance);
			return appearance;
		}),
	);
	ipcMain.handle(
		CHANNELS.assignFolder,
		guard(async (projectId: string, folder: unknown) => {
			assertUsableProjectId(projectId);
			await assignFolder(recordStore(), projectId, folderName(folder));
		}),
	);

	ipcMain.handle(
		CHANNELS.buildPrototype,
		guard(async (projectId: string, name: string, request: string) => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			// The screen can ask twice (it is opened twice in development, and Try again asks again): the runner joins
			// this prototype's run, and refuses while it is working on anything else.
			const skill = await readSkillText(BUILD_SKILL);
			const { build, sources } = await prototypeRun(projectId, name);
			const accessibility = await work.accessibility(projectId, name);
			const voice = await work.voice();
			return startPrototypeAgent(projectId, name, sources, prototypeBuildTask({ skill, build, sources, accessibility, voice, request: String(request) }));
		}),
	);

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
	ipcMain.handle(
		CHANNELS.addressPrototype,
		guard(async (projectId: string, name: string, commentId: number) => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			if (!Number.isSafeInteger(commentId)) throw new Error('That is not a comment.');
			refuseWhileBusy();
			// One left from a run whose screen was closed is finished first, or this run would start from the same copy.
			await finishPrototypeChanges(projectId);
			const addressSkill = await readSkillText(ADDRESS_SKILL);
			const buildSkill = await readSkillText(BUILD_SKILL);
			// Read now, not earlier: this is what makes the file current, and what says who has commented.
			const comments = await designRepo.readComments(projectId, prototypeKey(projectId, name));
			const written = writeCommentsExport(prototypesRoot, {
				projectId,
				title: await work.title(projectId),
				iteration: { name, branch: prototypeKey(projectId, name) },
				comments,
				generatedAt: new Date(),
			});
			const number = chooseComment(comments, commentId);
			const change = await work.startChange(projectId, name, async (it) =>
				(it.name === name ? comments : await designRepo.readComments(projectId, it.branch)).map((c) => c.author),
			);
			// Modeled on what the iteration it comes from was: a new one has no record of its own yet.
			const { build, sources } = await prototypeRun(projectId, change.target, change.from.name);
			prototypeChanges.set(commentId, { projectId, change });
			const where = whereTheChangeGoes(change, name);
			const accessibility = await work.accessibility(projectId, change.from.name);
			const voice = await work.voice();
			return startPrototypeAgent(
				projectId,
				name,
				sources,
				prototypeAddressTask({ addressSkill, buildSkill, build, sources, accessibility, voice, commentsPath: written.path, number, name, where }),
			);
		}),
	);
	/**
	 * The iteration's published page. Asked of GitHub as the person signed in to the app; nothing to say when they are
	 * not. Opening it works the address out again here, so the window never hands this an address to open.
	 */
	const publishedPage = async (projectId: string, name: string): Promise<PageStatus> => {
		assertUsableProjectId(projectId);
		assertPrototypeName(name);
		if (github.state().state !== 'signedIn') return { state: 'none' };
		const key = prototypeKey(projectId, name);
		if (publishing.has(key)) return { state: 'publishing' };
		let status: PageStatus;
		try {
			status = await pageStatus(github, DESIGN_REPO, projectId, name);
		} catch (err) {
			// Most often the app's GitHub permission: reading the site and its deploys needs Pages and Deployments.
			return { state: 'unavailable', why: `GitHub would not say whether this is published: ${err instanceof Error ? err.message : String(err)}` };
		}
		const stopped = publishStopped.get(key);
		return status.state === 'unpublished' && stopped ? { state: 'unpublished', why: stopped } : status;
	};
	/**
	 * Publishes what the app itself just made (a prototype it built, or a change Address made), in the background, as
	 * the agent publishes from Claude Code: the same code. What stopped it is kept, so the screen can say why the page
	 * is not published.
	 */
	const publishing = new Map<string, Promise<void>>();
	const publishStopped = new Map<string, string>();
	// Asked for again while one runs: what changed since may have missed its push, so one more runs after it.
	const publishAgain = new Set<string>();
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
		if (publishing.has(key)) return void publishAgain.add(key);
		const run = deploy()
			.then(() => void publishStopped.delete(key))
			.catch((err: unknown) => void publishStopped.set(key, err instanceof Error ? err.message : String(err)))
			.finally(() => {
				publishing.delete(key);
				if (publishAgain.delete(key)) inBackground(key, deploy);
			});
		publishing.set(key, run);
	};
	const publishInBackground = (projectId: string, name: string): void =>
		inBackground(prototypeKey(projectId, name), async () => publish({ github, ref: DESIGN_REPO, ...(await recordsFrom(designClone())), projectId, name }));
	/** The site, when what it is built from changed and no page did: it has no page of its own to key on. */
	const redeployInBackground = (): void => inBackground('the site', async () => redeploySite({ github, ref: DESIGN_REPO, ...(await recordsFrom(designClone())) }));
	ipcMain.handle(CHANNELS.publishedPage, guard((projectId: string, name: string) => publishedPage(projectId, name)));
	ipcMain.handle(
		CHANNELS.openPublishedPage,
		guard(async (projectId: string, name: string): Promise<null> => {
			const status = await publishedPage(projectId, name);
			if (status.state !== 'published') throw new Error('This iteration is not on its page yet.');
			await shell.openExternal(assertPreviewUrl(status.url));
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.publishPage,
		guard(async (projectId: string, name: string): Promise<PageStatus> => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			if (github.state().state !== 'signedIn') throw new Error('Sign in to GitHub to publish.');
			publishInBackground(projectId, name);
			return publishedPage(projectId, name);
		}),
	);
	ipcMain.handle(
		CHANNELS.finishPrototypeAddress,
		guard((commentId: number): Promise<PrototypeAddressed> => finishPrototypeChange(commentId)),
	);

	ipcMain.handle(
		CHANNELS.savePrototype,
		guard(async (projectId: string, name: string): Promise<null> => {
			await work.save(projectId, name);
			publishInBackground(projectId, name);
			return null;
		}),
	);

	ipcMain.handle(
		CHANNELS.openPrototype,
		guard(async (projectId: string, name: string): Promise<OpenedPrototype> => {
			await finishPrototypeChanges(projectId);
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			// A page built here but never saved (the screen was left, or gave up, while the agent finished) is saved
			// now: what this machine shows is what reviewers get, and no finished page is stranded on one machine.
			const local = work.file(projectId, name);
			const path = prototypePagePath(projectId, name);
			if (existsSync(local) && agent.status().state !== 'running' && (await recordStore().read(path)) !== html) await work.keep(projectId, name, html);
			return { url: await servePrototype(projectId, name, html), states: statesOf(html) };
		}),
	);

	/**
	 * A prototype's accessibility (T7): its saved page, served as it is opened, checked in each of its states at its
	 * product's target, and kept beside it. Made again only when what it was made with changes.
	 */
	const prototypeAccessibility = async (projectId: string, name: string): Promise<AccessibilityResult> => {
		assertUsableProjectId(projectId);
		assertPrototypeName(name);
		const html = await prototypePage(projectId, name);
		if (html === null) throw new Error('This prototype has no page yet.');
		const url = await servePrototype(projectId, name, html);
		const file = join(dirname(work.file(projectId, name)), `${name}.accessibility.json`);
		return accessibilityOf({ file, html, url, states: statesOf(html), target: await work.target(projectId, name), check: checkPage });
	};
	ipcMain.handle(
		CHANNELS.checkAccessibility,
		guard((projectId: string, name: string) => once(`accessibility:${projectId}/${name}`, () => prototypeAccessibility(projectId, name))),
	);
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
	ipcMain.handle(
		CHANNELS.ensureCovers,
		guard(() => once('covers', async () => (agentBusy() ? [] : ensureCovers(coverDeps, builtHere(prototypesRoot))))),
	);
	/** Pictures read this session, by path: what is at a picture's path never changes, so it is read once. */
	const coversRead = new Map<string, string>();
	ipcMain.handle(
		CHANNELS.projectCover,
		guard(async (projectId: string, name: string, cover: string): Promise<string | null> => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			const path = coverPath(projectId, name, cover);
			const kept = coversRead.get(path);
			if (kept !== undefined) return kept;
			const bytes = await readDesignBytes(path);
			if (bytes === null) return null;
			const url = jpegDataUrl(bytes);
			coversRead.set(path, url);
			return url;
		}),
	);
	// One round of the prototype's own check: its agent given what the check found, as a build error is given (T7).
	ipcMain.handle(
		CHANNELS.fixAccessibility,
		guard(async (projectId: string, name: string) => {
			refuseWhileBusy();
			const result = await prototypeAccessibility(projectId, name);
			if (result.violations.length === 0) throw new Error('The accessibility check found nothing to fix.');
			const skill = await readSkillText(BUILD_SKILL);
			const { build, sources } = await prototypeRun(projectId, name);
			const accessibility = await work.accessibility(projectId, name);
			const voice = await work.voice();
			return startPrototypeAgent(projectId, name, sources, prototypeBuildTask({ skill, build, sources, accessibility, voice, request: fixRequest(result) }));
		}),
	);

	ipcMain.handle(
		CHANNELS.moveToCodePlan,
		guard(async (root: string, projectId: string, name: string): Promise<MoveToCodePlan> => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			const canonical = opened.require(root);
			const { branch, exists, recorded, started, records } = await codebaseWorkOf(root, projectId);
			const basedOn = records.find((i) => i.name === name)?.basedOn;
			const here = await readCheckout(canonical);
			return {
				branch,
				exists,
				recorded,
				started,
				repository: basename(canonical),
				basedOn: basedOn ? { repository: basedOn.repository, branch: basedOn.branch } : null,
				current: here.branch,
				clean: here.clean,
			};
		}),
	);

	// Handoff: the heavy pass on codebase work, started here so the checks and the start are one step. Where the
	// branch stood when it started is kept, so the verdict can tell a handoff written now from one left from before.
	const handoffStarts = new Map<string, { branch: string; head: string }>();
	ipcMain.handle(
		CHANNELS.startHandoff,
		guard(async (root: string, projectId: string) => {
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const recordsRoot = recordsFor(canonical);
			const descriptor = descriptorFor(root);
			const iteration = await recordedIteration(canonical, recordsRoot, descriptor, projectId, 'codebase');
			const here = await readCheckout(canonical);
			if (here.branch !== iteration.branch) throw new Error(`Open ${iteration.branch} first: a handoff checks the work where it is.`);
			refuseWhileBusy();
			const skill = await readSkillText(HANDOFF_SKILL);
			const task = handoffTask({
				skill,
				projectId,
				branch: iteration.branch,
				gate: commandLine(descriptor.commands, 'handoff', projectId),
				lightCheck: commandLine(descriptor.commands, 'check-iteration', projectId),
			});
			handoffStarts.set(canonical, { branch: iteration.branch, head: (await runGit(canonical, ['rev-parse', 'HEAD'])).trim() });
			return startTracked(canonical, projectId, task, { branch: iteration.branch, addDirs: [recordsRoot], purpose: 'handoff' });
		}),
	);
	/**
	 * Whether the last Handoff here found the work ready: the run's own last verdict says so, and HANDOFF.md was
	 * committed since it started. Null when this app did not start one on this branch (it was restarted since).
	 */
	ipcMain.handle(
		CHANNELS.handoffResult,
		guard(async (root: string): Promise<boolean | null> => {
			const canonical = opened.require(root);
			const started = handoffStarts.get(canonical);
			const here = await readCheckout(canonical);
			const recent = agent.recentLines();
			if (!started || started.branch !== here.branch || recent.work !== here.branch) return null;
			const written = (await runGit(canonical, ['diff', '--name-only', started.head, 'HEAD', '--', HANDOFF_FILE])).trim() !== '';
			return written && lastVerdict(recent.lines) === 'ready';
		}),
	);

	/**
	 * Build, from a prototype: its branch and record are made here, as all codebase work's are (or, when the work was
	 * started before, picked up where it is), and the building is handed to Claude Code in the product repository, where the person watches it and can step in. The
	 * task is written beside the prototype's own copy (the skill, the page and source to start from, where the audit
	 * goes); the conversation starts with a line pointing at it. In VS Code when it has Claude Code; otherwise the
	 * command that starts it in a terminal is put on the clipboard.
	 */
	ipcMain.handle(
		CHANNELS.buildInClaude,
		guard(async (root: string, projectId: string, name: string, from?: string): Promise<BuildInClaude> => {
			assertUsableProjectId(projectId);
			assertPrototypeName(name);
			const canonical = opened.require(root);
			const recordsRoot = recordsFor(canonical);
			const skill = await readSkillText(MOVE_SKILL);
			// The page and its source are copied where the agent can read them, so it works from the version saved.
			const html = await prototypePage(projectId, name);
			if (html === null) throw new Error('This prototype has no page yet.');
			const pageFile = work.file(projectId, name);
			const sourceFile = work.sourceFile(projectId, name);
			const source = await work.sourceText(projectId, name);
			const label = iterationLabel({ name, branch: prototypeKey(projectId, name) });
			// The branch first: nothing is written for the agent if the work cannot start (a dirty tree, work not found).
			// Work already started, here or recorded, is continued where it is; it is not started a second time.
			const { branch, started: continuing } = await codebaseWorkOf(root, projectId);
			if (continuing) await continueCodebaseWork(root, projectId, branch);
			else await startCodebaseWork(root, projectId, `From prototype ${label}`, from);
			writeFileSync(pageFile, html);
			if (source !== null) writeFileSync(sourceFile, source);
			const taskFile = join(dirname(pageFile), `${name}-into-code.md`);
			writeFileSync(
				taskFile,
				moveToCodeTask({
					skill,
					pageFile,
					sourceFile: source !== null ? sourceFile : null,
					auditFile: join(recordsRoot, projectId, `audit-${name}.md`),
					name,
					basedOn: (await work.record(projectId, name))?.basedOn,
					// Built toward the product's target from the start, with what the prototype's check left open: its page
					// checked now when it was not already. A check that cannot run leaves the findings out, never the move.
					accessibility: await codebaseAccessibility(canonical, await prototypeAccessibility(projectId, name).catch(() => null)),
					voice: await work.voice(canonical),
					lightCheck: commandLine(descriptorFor(root).commands, 'check-iteration', projectId),
					shared: sharedGuidance(canonical).note,
				}),
			);
			const prompt = moveToCodePrompt({ label, projectId, taskFile, continuing: continuing ? branch : null });
			const editor = findEditor();
			if (editor) {
				await openPrompt(editor, canonical, prompt);
				return { editor: true, command: null };
			}
			const command = startCommand(locateClaude(), canonical, prompt);
			clipboard.writeText(command);
			return { editor: false, command };
		}),
	);

	/** A record is text a person reads; anything larger than this is not one, and is cut rather than sent whole. */
	const MAX_RECORD = 400_000;
	ipcMain.handle(
		CHANNELS.readRecord,
		guard(async (projectId: string, name: string): Promise<string> => {
			if (!isRecordName(projectId) || !isRecordName(name)) throw new Error('That is not a file in a project.');
			// This machine's copy first: it is the one being written, and may not be published yet.
			const root = trustedRoot();
			const recordsRoot = root === null ? null : recordsRootFor(root);
			const path = recordsRoot === null ? null : resolveInside(recordsRoot, join(projectId, name));
			const text = path !== null && existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : await designRepo.readRecord(projectId, name);
			// The brief without its front matter (its folder), which is the app's and not the person's to read.
			return shownRecord(name, text).slice(0, MAX_RECORD);
		}),
	);
	ipcMain.handle(
		CHANNELS.readComments,
		guard(async (projectId: string, branch: string): Promise<ReviewComment[]> => {
			const comments = await designRepo.readComments(projectId, branch);
			exportComments(projectId, branch, comments);
			return comments;
		}),
	);
	ipcMain.handle(
		CHANNELS.postComment,
		guard(
			(projectId: string, branch: string, body: string, anchor: unknown, picture?: unknown): Promise<ReviewComment> =>
				designRepo.postComment(projectId, branch, body, sanitizeAnchor(anchor), sanitizePicture(picture)),
		),
	);

	// The preview. Every argument is re-checked here: the window is trusted less
	// than the main process, and the preview less than the window.
	const nothing = (_done?: unknown): null => null;
	// A prototype is one page: the app's own server says which addresses are its, never the window.
	ipcMain.handle(CHANNELS.pageOpen, guard(async (url: string) => nothing(await page.open(String(url), { singlePage: prototypeServer.owns(String(url)) }))));
	ipcMain.handle(CHANNELS.pageClose, guard(() => nothing(page.close())));
	// The page the preview is on, in the person's own browser. The address comes from the preview itself, never
	// from the window, and goes through the same check as opening one: this app's own web addresses only.
	ipcMain.handle(
		CHANNELS.openPreviewInBrowser,
		guard(async () => {
			const url = page.currentUrl();
			if (url === null) throw new Error('There is no preview open to show in a browser.');
			await shell.openExternal(assertPreviewUrl(url));
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.pageSetBounds,
		guard((b: PageBounds) => nothing(page.setBounds({ x: Number(b?.x), y: Number(b?.y), width: Number(b?.width), height: Number(b?.height) }))),
	);
	ipcMain.handle(CHANNELS.pageSnapshot, guard(() => page.snapshot()));
	ipcMain.handle(
		CHANNELS.pageHold,
		guard((reason: string, held: boolean) => {
			if (!(PAGE_HOLD_REASONS as readonly string[]).includes(reason)) throw new Error('That is not a reason to hide the preview.');
			return nothing(page.hold(reason as PageHoldReason, held === true));
		}),
	);
	ipcMain.handle(CHANNELS.pagePick, guard(() => page.pick()));
	ipcMain.handle(CHANNELS.pageCancelPick, guard(async () => nothing(await page.cancelPick())));
	ipcMain.handle(
		CHANNELS.pageShowMarkers,
		guard((items: MarkerRequest[]) => {
			const clean = (Array.isArray(items) ? items : []).slice(0, 200).flatMap((i): MarkerRequest[] => {
				const anchor = sanitizeAnchor(i?.anchor);
				return anchor && Number.isInteger(i.id) && Number.isInteger(i.number)
					? [{ id: i.id, number: i.number, anchor, movable: i.movable === true }]
					: [];
			});
			return page.showMarkers(clean);
		}),
	);
	ipcMain.handle(
		CHANNELS.moveComment,
		guard((commentId: number, anchor: unknown): Promise<ReviewComment> => {
			const clean = sanitizeAnchor(anchor);
			if (!clean || !Number.isInteger(commentId)) throw new Error('That is not a place a pin can be moved to.');
			return designRepo.moveComment(commentId, clean);
		}),
	);
	ipcMain.handle(
		CHANNELS.deleteComment,
		guard(async (commentId: number) => {
			if (!Number.isInteger(commentId)) throw new Error('That is not a comment.');
			await designRepo.deleteComment(commentId);
			return null;
		}),
	);
	ipcMain.handle(
		CHANNELS.resolveComment,
		guard((commentId: number, resolved: boolean): Promise<ReviewComment> => {
			if (!Number.isInteger(commentId)) throw new Error('That is not a comment.');
			return designRepo.setResolved(commentId, resolved === true);
		}),
	);
	ipcMain.handle(
		CHANNELS.markAddressed,
		guard((commentId: number, commit: unknown): Promise<ReviewComment> => {
			if (!Number.isInteger(commentId)) throw new Error('That is not a comment.');
			// A commit, or nothing. Anything else is not written into a comment body.
			const sha = typeof commit === 'string' && /^[0-9a-f]{7,40}$/.test(commit) ? commit : null;
			return designRepo.setAddressed(commentId, sha);
		}),
	);
	// What the branch is at right now: read when a comment is placed, so the comment says
	// which version of the code it was made against rather than which one was last recorded.
	ipcMain.handle(
		CHANNELS.iterationCommit,
		guard(async (root: string, projectId: string, name: string): Promise<string | null> => {
			assertUsableProjectId(projectId);
			const canonical = opened.require(root);
			const found = await recordedIteration(canonical, recordsFor(canonical), descriptorFor(root), projectId, name).catch(() => null);
			return found ? branchCommit(canonical, found.branch).catch(() => null) : null;
		}),
	);
	ipcMain.handle(CHANNELS.pageFocusMarker, guard(async (id: number) => nothing(await page.focusMarker(Number(id)))));

	return { publish: (force = false) => publisher.publish(force) };
};
