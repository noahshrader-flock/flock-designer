/**
 * The core, composed: every service it runs, made once for the window's session from what the shell gives (`CallsContext`),
 * and what they share. The calls are answered by area (`areas/`), each made from this, and registered with their arguments
 * checked (`calls.ts`, `calls/`).
 */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ChangeKind, Checkout, Person, PublishStatus, TriedValue } from '../shared/contract';
import { reachLine, tokenChanges, valueChanges } from '../shared/processChanges';
import { storyComponent } from '../shared/valueNames';
import { type Check, type EventSink, arg } from './handle';
import type { Ports } from './ports';
import { AGENT_BUSY, AgentRunner, runToEnd } from './services/agent/agent';
import { classify } from './services/projects/branchProjects';
import { syncBranches } from './services/publishing/branchSync';
import type { CheckoutMemory } from './services/projects/checkoutMemory';
import { codebaseWork } from './services/codebase/codebaseWork';
import { ComponentPictures } from './services/designSystem/componentPictures';
import { ComponentTokens } from './services/designSystem/componentTokens';
import { DESCRIPTOR_PATH, readDescriptor, type WorkspaceDescriptor } from './services/projects/descriptor';
import { DesignLibrary, libraryCommit, systemReads } from './services/designSystem/designLibrary';
import { readTokens } from './services/designSystem/designTokens';
import { HandOverBranches } from './services/designSystem/handOverBranches';
import { LibraryShown } from './services/designSystem/libraryShown';
import { DesignRepo } from '../codeHost/designRepo';
import { designStore } from './services/publishing/designStore';
import { syncRecords } from './services/publishing/designSync';
import { DesignSystemsMemory } from './services/designSystem/designSystems';
import { recordsRootFor } from './services/projects/discovery';
import { SessionMemory } from './services/agent/editor';
import { isRepository, readCheckout } from './services/platform/git';
import type { GitHubAccount } from '../codeHost/github';
import { Installer } from './services/codebase/install';
import { recordedWork } from './services/projects/workRecords';
import { readFolderProjects } from './services/projects/localProjects';
import { esbuildEntry } from './services/prototypes/prototypeBundle';
import { PrototypeServer } from './services/prototypes/prototypeServer';
import { prototypeWork } from './services/prototypes/prototypeWork';
import { PublishManager, publishInOrder } from './services/publishing/publisher';
import { RuntimeManager } from './services/codebase/runtime';
import { OpenedCheckouts } from './services/projects/session';
import { type ShareRunner } from './services/codebase/share';
import { siteDeploys } from './services/publishing/siteDeploys';
import { StoryPreviews } from './services/designSystem/storyPreviews';
import { windowFolder } from './services/platform/windowFolder';
import { withPageTheme } from './services/browser/pageTheme';
import { TokenBranches } from './services/designSystem/tokenBranches';
import { ValueBranches } from './services/designSystem/valueBranches';
import { ValueSources } from './services/designSystem/valueSources';
import { DESIGN_SYSTEM_CODE, ValueAgent } from './services/designSystem/valueAgent';
import { ComponentVariants } from './services/designSystem/componentVariants';
import { typeLibs } from './services/designSystem/componentProps';
import { VoiceBranches } from './services/designSystem/voiceAndTone';

/** A product checkout as a call is given it, once its root has been checked: one this window opened, its descriptor and records read. */
export type CheckedCheckout = { root: string; canonical: string; readonly descriptor: WorkspaceDescriptor; readonly recordsRoot: string };

/** What the shell gives the core. */
export interface CallsContext {
	/** How the core tells the window that something happened: the shell's. */
	emit: EventSink;
	/** Everything reached outside the app: dialogs, other applications, the clipboard, the network, the person's own tools. */
	ports: Ports;
	opened: OpenedCheckouts;
	runtime: RuntimeManager;
	agent: AgentRunner;
	share: ShareRunner;
	github: GitHubAccount;
	designRepo: DesignRepo;
	memory: CheckoutMemory;
	/** Told whenever publishing moves, so the window can show it. */
	onPublishStatus: (status: PublishStatus) => void;
	/** Where prototypes are built before they are saved: the app's own folder, never a repository. */
	prototypesRoot: string;
	prototypeServer: PrototypeServer;
	/** The latest agent conversation for each branch, so it can be continued in the person's editor. */
	sessions: SessionMemory;
	installer: Installer;
	/** The component library for the Design System tab: a test's own, else built from the connected design systems. */
	designLibrary?: DesignLibrary;
	/** The design systems the person connected. */
	designSystems: DesignSystemsMemory;
	/** Where the previews of the library's stories are built: the app's own folder, never the library's. */
	storyPreviewsRoot: string;
	/** Which branch each change to the library is kept on, a file for each kind (T4, Phase 4, T9, Process changes). */
	changeBranchFiles: Record<ChangeKind, string>;
	/**
	 * Which tokens each component draws with (T6), what a change reaches (Phase 3) and what writing a value does (Phase 4),
	 * and so what is got ready in the background: given for tests.
	 */
	componentTokens?: Pick<ComponentTokens, 'of' | 'users' | 'warm' | 'pictures' | 'reach' | 'drawn' | 'asIs' | 'reachWith'>;
	/** Where the pictures of the components are kept (P5): the app's own folder. */
	componentPicturesRoot: string;
	/** How the pictures are taken: a fingerprint, so only pictures taken that way are shown. */
	componentPictureRecipe: string;
	/** When to start getting the shown design system ready after the app opens; not at all when absent. */
	warmAfterMs?: number;
}

/** Everything the handlers share: the context, and what is made from it once, for the window's whole session. */
export const composeCore = ({
	emit,
	ports,
	opened,
	runtime,
	agent,
	share,
	github,
	designRepo,
	memory,
	onPublishStatus,
	prototypesRoot,
	prototypeServer,
	sessions,
	installer,
	designLibrary,
	designSystems,
	storyPreviewsRoot,
	changeBranchFiles,
	componentTokens: injectedComponentTokens,
	componentPicturesRoot,
	componentPictureRecipe,
	warmAfterMs,
}: CallsContext) => {
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
	const checkout: Check<CheckedCheckout> = (v) => {
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

	/**
	 * The product checkout this person has already accepted, or null.
	 *
	 * **Discovery deliberately does not feed this.** A repository's own
	 * `.dsnr/workspace.json` is its command allowlist, so a repository that merely
	 * exists on disk must never become runnable: finding one is a suggestion, and
	 * opening it (the folder the person opened in VS Code, through `open`) is what trusts it. Only a
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
								// Reviewers find a piece of work through its record, so work built in a terminal (a branch, a folder,
								// and no record) is recorded here, then published with the rest.
								for (const branch of found.mine) {
									const work = classify(descriptor, branch);
									if (work) await recordedWork(root, recordsRoot, descriptor, work.projectId, work.name).catch(() => undefined);
								}
								return syncRecords(dirname(recordsRoot));
							},
						);
						// Whatever is on GitHub and not yet on the site goes up too, however it got there.
						void deploys.catchUp();
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

	// Which commit the tab reads: the library's own branch, or a branch handed to Claude Code (Preview this branch), told to
	// every page when it changes, so each reads the library again.
	const libraryShown = new LibraryShown((showing) => emit('onLibraryShown', showing));
	const library = designLibrary ?? new DesignLibrary({ systems: designSystems, at: libraryShown.at });
	const shownSystem = () => {
		const shown = library.current();
		return typeof shown === 'string' ? null : shown;
	};
	// In a folder of this window's own: another window's DSNR builds in another, so neither deletes the other's builds.
	const previews = new StoryPreviews({ system: shownSystem, folder: windowFolder(storyPreviewsRoot), server: prototypeServer, at: libraryShown.at });
	// Which tokens each component draws with (T6), and its picture (P5), from one drawing pass.
	const componentPictures = new ComponentPictures({ folder: componentPicturesRoot, server: prototypeServer, recipe: componentPictureRecipe });
	const componentTokens =
		injectedComponentTokens ??
		new ComponentTokens({ system: shownSystem, previews, measure: ports.headless.measure, pictures: componentPictures, at: libraryShown.at });
	// The previews and the index are got ready in the background, so a component opened later is drawn at once: as the app
	// opens, and whenever the library has been read (it may have moved). For a commit already ready it is nothing.
	const warm = () => void componentTokens.warm();
	if (warmAfterMs !== undefined) setTimeout(warm, warmAfterMs).unref();
	const branchDeps = (kind: ChangeKind) => ({ system: shownSystem, file: changeBranchFiles[kind], tools: ports.shareTools });
	const tokenBranches = new TokenBranches(branchDeps('tokens'));
	// What the agent writes for a value where there is no literal, or to follow a token (4.5, 4.6): in a copy of the library,
	// under the standard every run is given, as the app's tasks are given theirs.
	const valueAgent = new ValueAgent({
		system: shownSystem,
		tokens: componentTokens,
		run: (cwd, task, readOnly) => runToEnd(cwd, task, { readOnly }),
		readStandard: (path) => readSkillText(path),
	});
	// Every case a component's props declare, drawn (Phase 5), its props read by the compiler the app carries.
	const componentVariants = new ComponentVariants({
		tokens: componentTokens,
		previews,
		measure: ports.headless.measure,
		typeLibs: typeLibs(),
		folder: () => shownSystem()?.folder ?? '',
	});
	// Where the values tried on a component are written, found as they are tried, and the branch each component's are saved on (Phase 4).
	const valueSources = new ValueSources({ tokens: componentTokens, previews, measure: ports.headless.measure, agent: valueAgent });
	const valueBranches = new ValueBranches({ ...branchDeps('values'), sources: valueSources });
	// Process changes: one unit (the tokens, or one component's values) handed to Claude Code on a branch DSNR names, then read from
	// git and proposed. Its lines are said as a Save's are, with where each is written; what it reaches, as the Values' reach is.
	const valuesFound = async (file: string, tried: TriedValue[]) => {
		const found = await valueSources.of(file, tried);
		return found.state === 'ready' ? found : null;
	};
	const handOverBranches = new HandOverBranches({
		...branchDeps('handOver'),
		rules: () => readSkillText(DESIGN_SYSTEM_CODE),
		changes: async (scope, change) => {
			const system = shownSystem();
			if (system === null) throw new Error('There is no design system connected.');
			if ('edits' in change) {
				const commit = await libraryCommit(system.root, system.branch);
				if (commit === null) throw new Error(`The library has no ${system.branch} branch from GitHub to read its tokens from.`);
				return tokenChanges((await readTokens(await systemReads(system, commit))).tokens, change.edits);
			}
			const drawn = await componentTokens.of(scope);
			const rows = drawn.state === 'ready' && drawn.values.state === 'read' ? drawn.values.rows.light : null;
			const found = await valuesFound(scope, change.tried);
			const places = new Map((found?.values ?? []).flatMap((v) => (v.state === 'found' ? [[v.id, v.places] as const] : [])));
			return valueChanges(storyComponent(scope), rows, change.tried, places);
		},
		reach: async (scope, change) =>
			reachLine('edits' in change ? await componentTokens.reach(change.edits) : ((await valuesFound(scope, change.tried))?.reach ?? null)),
		saved: async (scope) => (scope === '' ? (await tokenBranches.current()) !== null : (await valueBranches.current(scope)) !== null),
	});
	// The voice and tone (T9): the connected design system's, kept on a branch as every change to it is.
	const voiceBranches = new VoiceBranches(branchDeps('voice'));

	// Starting and picking up a project's codebase work, never under a running agent (`codebaseWork`).
	const codebase = codebaseWork({
		agentIn: (canonical) => agent.runningIn(canonical),
		records: (projectId) => work.records(projectId),
		login: signedInLogin,
		written,
	});

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
		store: store.records,
		readDesignFile: store.readFile,
		esbuild: esbuildEntry,
	});
	/** A prototype's page on the local server, with the shared files it points at beside it: where it is opened and checked. */
	const servePrototype = (projectId: string, name: string, html: string): Promise<string> =>
		prototypeServer.servePage(`${projectId}/${name}`, withPageTheme(html), work.sharedText);
	/** The page: this machine's newest build first (built again when its source changed), then the saved one. */
	const prototypePage = (projectId: string, name: string): Promise<string | null> => work.page(projectId, name, agentBusy());

	/**
	 * The site's deploys, run in the background, and whether a version's page is on the site (`siteDeploys`): asked of
	 * GitHub as the person signed in to the app, and worked out again here, so the window never hands this an address to open.
	 */
	const deploys = siteDeploys({ github, designClone });

	return {
		emit,
		ports,
		opened,
		runtime,
		agent,
		share,
		github,
		designRepo,
		prototypesRoot,
		sessions,
		installer,
		designSystems,
		componentTokens,
		openRepository,
		checkout,
		trustedRoot,
		trustedRecords,
		publisher,
		written,
		me,
		signedInLogin,
		library,
		previews,
		warm,
		tokenBranches,
		valueSources,
		valueBranches,
		handOverBranches,
		libraryShown,
		shownSystem,
		valueAgent,
		componentVariants,
		voiceBranches,
		codebase,
		agentBusy,
		refuseWhileBusy,
		readSkillText,
		store,
		work,
		servePrototype,
		prototypePage,
		deploys,
	};
};
export type CallsDeps = ReturnType<typeof composeCore>;
