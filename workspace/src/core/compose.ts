import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ChangeKind, Checkout, Person, PublishStatus, SaveOutcome, TriedValue } from '../shared/contract';
import { reachLine, tokenChanges, valueChanges } from '../shared/processChanges';
import { storyComponent } from '../shared/valueNames';
import { type Check, type EventSink, arg } from './handle';
import type { Ports } from './ports';
import { type Agent, type AgentId, runByChosen } from './services/agent/agent';
import { type Offered, chooseAgent, settled } from './services/agent/choose';
import { classify } from './services/prototypes/branchPrototypes';
import { syncBranches } from './services/publishing/branchSync';
import type { CheckoutMemory } from './services/products/checkoutMemory';
import { codebaseWork } from './services/codebase/codebaseWork';
import { ComponentPictures } from './services/designSystem/componentPictures';
import { ComponentTokens } from './services/designSystem/componentTokens';
import { DESCRIPTOR_PATH, readDescriptor, type WorkspaceDescriptor } from './services/products/descriptor';
import { DesignLibrary, libraryCommit, systemReads } from './services/designSystem/designLibrary';
import { readTokens } from './services/designSystem/designTokens';
import { HandOverBranches } from './services/designSystem/handOverBranches';
import { LibraryShown } from './services/designSystem/libraryShown';
import { DesignRepo, DesignRepos } from '../codeHost/designRepo';
import { handTask } from './services/agent/handOver';
import { handSetUp } from './services/products/setUp';
import { DESIGN_REPO } from '../shared/config';
import type { RepoRef } from '../shared/repoRef';
import { designStore } from './services/publishing/designStore';
import { syncRecords } from './services/publishing/designSync';
import { DesignSystemsMemory } from './services/designSystem/designSystems';
import { type SourceAnswers, usableDesignSystem } from './services/products/productDesignSystem';
import { type DesignRepositoryClones, designRepositoryMissing, designRepositoryOf, recordsRootFor } from './services/products/discovery';
import { isRepository, readCheckout } from './services/platform/git';
import type { GitHubAccount } from '../codeHost/github';
import { codebaseMadeFrom, recordedWork } from './services/prototypes/workRecords';
import { readFolderPrototypes } from './services/prototypes/localPrototypes';
import { startedHere } from './services/prototypes/pendingPrototypes';
import { workLabel } from '../shared/work';
import { esbuildEntry } from './services/prototypes/prototypeBundle';
import { PrototypeServer } from './services/prototypes/prototypeServer';
import { versionWork } from './services/prototypes/versionWork';
import { SavedSourceChanged } from './services/prototypes/savedSource';
import { PublishManager, publishInOrder } from './services/publishing/publisher';
import { RuntimeManager } from './services/codebase/runtime';
import { OpenedCheckouts } from './services/products/session';
import { type ShareRunner } from './services/codebase/share';
import { siteDeploys } from './services/publishing/siteDeploys';
import { StoryPreviews } from './services/designSystem/storyPreviews';
import { windowFolder } from './services/platform/windowFolder';
import { SplitProof } from './services/designSystem/splitProof';
import { SplitBranches } from './services/designSystem/splitBranches';
import { withPageTheme } from './services/browser/pageTheme';
import { TokenBranches } from './services/designSystem/tokenBranches';
import { ValueBranches } from './services/designSystem/valueBranches';
import { ValueSources } from './services/designSystem/valueSources';
import { DESIGN_SYSTEM_CODE, ValueAgent } from './services/designSystem/valueAgent';
import { ComponentVariants } from './services/designSystem/componentVariants';
import { typeLibs } from './services/designSystem/componentProps';
import { VoiceBranches } from './services/designSystem/voiceAndTone';

export type CheckedCheckout = { root: string; canonical: string; readonly descriptor: WorkspaceDescriptor; readonly recordsRoot: string };

export interface CallsContext {
	emit: EventSink;
	ports: Ports;
	opened: OpenedCheckouts;
	runtime: RuntimeManager;
	/** Each agent work can be handed to; which one is the person's choice (`ports.agentChoice`). */
	agents: Record<AgentId, Agent>;
	share: ShareRunner;
	github: GitHubAccount;
	memory: CheckoutMemory;
	onPublishStatus: (status: PublishStatus) => void;
	/** The app's own folder, never a repository. */
	prototypesRoot: string;
	prototypeServer: PrototypeServer;
	designLibrary?: DesignLibrary;
	designSystems: DesignSystemsMemory;
	/** The person's answers for a product's design system that could not be confirmed as its source. */
	sourceAnswers: SourceAnswers;
	/** Where the person keeps a design repository's clone, when it is not beside the product. */
	designRepositories: DesignRepositoryClones;
	/** How a design repository is reached over the API; absent, a `DesignRepo` over `github`. */
	designRepoOf?: (ref: RepoRef) => DesignRepo;
	/** The app's own folder, never the library's. */
	storyPreviewsRoot: string;
	/** Where a split's checks copy the design system's tip: the app's own, never a repository. */
	splitChecksRoot: string;
	/** The split proposed, by design system, so one stopped partway is gone on with after a restart. */
	splitBranchesFile: string;
	changeBranchFiles: Record<ChangeKind, string>;
	/** Given for tests. */
	componentTokens?: Pick<ComponentTokens, 'of' | 'users' | 'warm' | 'pictures' | 'reach' | 'editedReach' | 'drawn' | 'asIs' | 'reachWith'>;
	componentPicturesRoot: string;
	/** A fingerprint, so only pictures taken the same way are shown. */
	componentPictureRecipe: string;
	/** Not warmed at all when absent. */
	warmAfterMs?: number;
}

export const composeCore = ({
	emit,
	ports,
	opened,
	runtime,
	agents,
	share,
	github,
	memory,
	onPublishStatus,
	prototypesRoot,
	prototypeServer,
	designLibrary,
	designSystems,
	sourceAnswers,
	designRepositories,
	designRepoOf,
	storyPreviewsRoot,
	splitChecksRoot,
	splitBranchesFile,
	changeBranchFiles,
	componentTokens: injectedComponentTokens,
	componentPicturesRoot,
	componentPictureRecipe,
	warmAfterMs,
}: CallsContext) => {
	/** An agent's readiness, with what the editor can tell of one that cannot say itself. */
	const offered = (): Promise<Offered[]> =>
		Promise.all(
			Object.values(agents).map(async (a) => {
				const own = await a.readiness();
				const readiness = own.state === 'unknown' && (await ports.agentWindow.signedIn(a)) === true ? { state: 'ready' as const } : own;
				return { id: a.id, name: a.name, readiness };
			}),
		);
	const choose = async (always: boolean): Promise<Agent | null> => {
		const all = await offered();
		const id = await chooseAgent(all, { choice: () => ports.agentChoice(), pick: ports.pickAgent, keep: ports.keepAgent }, { always });
		if (id === null) return null;
		// Its readiness was read in choosing it: the hand-off asks again of this one, so it is not run twice.
		const readiness = (all.find((o) => o.id === id) as Offered).readiness;
		return { ...agents[id], readiness: async () => readiness };
	};
	/** Asked at each hand-off, so a change of choice is used at once; the person is asked only when it must be. */
	const agent = async (): Promise<Agent> => {
		const chosen = await choose(false);
		if (chosen === null) throw new Error('No agent was chosen, so nothing was handed over.');
		return chosen;
	};
	const openRepository = async (root: string): Promise<Checkout> => {
		if (!isRepository(root)) {
			throw new Error(`${root} is not a git repository.`);
		}
		const canonical = opened.remember(root);
		memory.write(canonical);
		return readCheckout(canonical);
	};

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
	 * Discovery deliberately does not feed this: a repository's `.dsnr/workspace.json` is its command allowlist, so only a
	 * root opened through `openRepository` is trusted, and the memory file can restore a choice, never manufacture one.
	 */
	const trustedRoot = (): string | null => {
		const saved = memory.read();
		return saved !== null && isRepository(saved) && existsSync(join(saved, DESCRIPTOR_PATH)) ? saved : null;
	};

	/** The product's design repository's records, in the clone the person picked or beside the product (`recordsRootFor`). */
	const recordsRootOf = (productRoot: string): string | null => recordsRootFor(productRoot, { clones: designRepositories });
	const recordsFor = (productRoot: string): string => {
		const found = recordsRootOf(productRoot);
		if (found === null) throw new Error(designRepositoryMissing(productRoot));
		return found;
	};
	/**
	 * The design repository records, comments and pages go to: the one the trusted product belongs to (`designRepositoryOf`,
	 * kept as the window's product), else Flock's, the default with no product at all. Asked each time.
	 */
	const designRepos = new DesignRepos(designRepoOf ?? ((ref) => new DesignRepo(github, ref)), () => {
		const root = trustedRoot();
		return root === null ? DESIGN_REPO : designRepositoryOf(root);
	});
	const trustedRecords = (): { root: string; recordsRoot: string } | null => {
		const root = trustedRoot();
		const recordsRoot = root === null ? null : recordsRootOf(root);
		return root === null || recordsRoot === null ? null : { root, recordsRoot };
	};

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
							() =>
								syncBranches({
									root,
									descriptor,
									prototypes: new Set(readFolderPrototypes(recordsRoot).map((p) => p.id)),
									madeFrom: (prototypeId) => codebaseMadeFrom(recordsRoot, prototypeId),
								}),
							async (found) => {
								// Reviewers find a piece of work through its record, so work built in a terminal (a branch, a folder,
								// and no record) is recorded here, then published with the rest.
								for (const branch of found.mine) {
									const work = classify(descriptor, branch);
									if (work) await recordedWork(root, recordsRoot, descriptor, work.prototypeId, work.name).catch(() => undefined);
								}
								return syncRecords(dirname(recordsRoot), startedHere(prototypesRoot));
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

	const me = (): Person | null => {
		const s = github.state();
		return s.state === 'signedIn' ? { name: s.user.name ?? s.user.login, login: s.user.login } : null;
	};
	const signedInLogin = (): string | null => me()?.login ?? null;

	const libraryShown = new LibraryShown((showing) => emit('onLibraryShown', showing));
	const library = designLibrary ?? new DesignLibrary({ systems: designSystems, at: libraryShown.at });
	const shownSystem = () => {
		const shown = library.current();
		return typeof shown === 'string' ? null : shown;
	};
	// In a folder of this window's own: another window's DSNR builds in another, so neither deletes the other's builds.
	const previews = new StoryPreviews({ system: shownSystem, folder: windowFolder(storyPreviewsRoot), server: prototypeServer, at: libraryShown.at });
	const componentPictures = new ComponentPictures({ folder: componentPicturesRoot, server: prototypeServer, recipe: componentPictureRecipe });
	const componentTokens =
		injectedComponentTokens ??
		new ComponentTokens({ system: shownSystem, previews, measure: ports.headless.measure, pictures: componentPictures, at: libraryShown.at });
	// Got ready in the background so a component opened later is drawn at once; for a commit already ready it is nothing.
	const warm = () => void componentTokens.warm();
	if (warmAfterMs !== undefined) setTimeout(warm, warmAfterMs).unref();
	const branchDeps = (kind: ChangeKind) => ({ system: shownSystem, file: changeBranchFiles[kind], tools: ports.shareTools });
	const tokenBranches = new TokenBranches(branchDeps('tokens'));
	const valueAgent = new ValueAgent({
		system: shownSystem,
		tokens: componentTokens,
		run: async (cwd, task, readOnly) => runByChosen(await agent(), Object.values(agents), cwd, task, { readOnly }),
		readStandard: (path) => readSkillText(path),
	});
	const componentVariants = new ComponentVariants({
		tokens: componentTokens,
		previews,
		measure: ports.headless.measure,
		typeLibs: typeLibs(),
		folder: () => shownSystem()?.folder ?? '',
	});
	const splitProof = new SplitProof({ folder: windowFolder(splitChecksRoot) });
	const splitBranches = new SplitBranches({ system: shownSystem, file: splitBranchesFile, tools: ports.shareTools });
	const valueSources = new ValueSources({ tokens: componentTokens, previews, measure: ports.headless.measure, agent: valueAgent });
	const valueBranches = new ValueBranches({ ...branchDeps('values'), sources: valueSources });
	const valuesFound = async (file: string, tried: TriedValue[]) => {
		const found = await valueSources.of(file, tried);
		return found.state === 'ready' ? found : null;
	};
	const handOverBranches = new HandOverBranches({
		...branchDeps('handOver'),
		rules: () => readSkillText(DESIGN_SYSTEM_CODE),
		tasks: join(prototypesRoot, '_hand-over'),
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
	const voiceBranches = new VoiceBranches(branchDeps('voice'));

	const codebase = codebaseWork({
		records: (prototypeId) => work.records(prototypeId),
		login: signedInLogin,
		written,
	});

	const designClone = (): string | null => {
		const trusted = trustedRecords();
		return trusted === null ? null : dirname(trusted.recordsRoot);
	};
	// Everything prototypes write goes to the clone here when there is one, so the publisher sends it like every other
	// record, and otherwise to GitHub directly. Signed out there is none to ask: the clone is all there is.
	const store = designStore({
		clone: designClone,
		files: () => (me() === null ? null : designRepos.now().files),
		onWrite: () => void publisher.publish(true),
	});
	const readSkillText = (path: string): Promise<string> => work.skill(path);
	/** The product's design system, where it may be read: only once it is shown to be its package's source, or said to be. */
	const designSystemOf = (productRoot: string): Promise<string | null> => usableDesignSystem(productRoot, sourceAnswers);
	const work = versionWork({
		prototypesRoot,
		designSystemOf,
		recordsRootOf,
		productRoot: () => {
			const root = trustedRoot();
			return root === null ? null : opened.require(root);
		},
		store: store.records,
		readDesignFile: store.readFile,
		esbuild: esbuildEntry,
	});
	const servePrototype = (prototypeId: string, name: string, html: string): Promise<string> =>
		prototypeServer.servePage(`${prototypeId}/${name}`, withPageTheme(html), work.sharedText);
	/** This machine's newest build first (built again when its source changed), then the saved one. */
	const prototypePage = (prototypeId: string, name: string): Promise<string | null> => work.page(prototypeId, name);

	// Whether a version's page is on the site is worked out here, so the window never hands this an address to open.
	const deploys = siteDeploys({ github, designClone, ref: () => designRepos.now().ref, started: startedHere(prototypesRoot) });
	/** A build saved (`from`: the version a new one was started from) is published, as each save is. */
	const saveBuilt = async (prototypeId: string, name: string, from: string | null): Promise<SaveOutcome> => {
		const fresh = from === null ? null : { from, me: me(), note: `For a comment on ${workLabel({ name: from })}` };
		try {
			const saved = await work.saveBuilt(prototypeId, name, fresh);
			if (saved === 'saved') deploys.page(prototypeId, name);
			return saved;
		} catch (err) {
			if (err instanceof SavedSourceChanged) return { refused: err.message };
			throw err;
		}
	};

	return {
		emit,
		ports,
		opened,
		runtime,
		agent,
		chooseAgentNow: async (): Promise<null> => {
			await choose(true);
			return null;
		},
		/** The agent work goes to now, said without asking: null when it is still to be asked, or none is signed in. */
		agentShown: async (): Promise<string | null> => {
			const now = settled(await offered(), ports.agentChoice());
			return 'id' in now ? agents[now.id].name : null;
		},
		share,
		github,
		designRepos,
		/** Hands a repository that is not set up yet to the person's agent, to set it up (`handSetUp`); null when no design repository was picked. */
		setUp: (root: string) =>
			handSetUp({
				root,
				clones: designRepositories,
				prototypesRoot,
				choose: (startAt) => ports.chooseFolder({ title: 'Choose the design repository', ...(startAt === null ? {} : { defaultPath: startAt }) }),
				hand: async (prepare) => (await handTask(ports, await agent(), prepare)).handed,
			}),
		prototypesRoot,
		designSystems,
		designSystemOf,
		recordsRootOf,
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
		splitProof,
		splitBranches,
		valueAgent,
		componentVariants,
		voiceBranches,
		codebase,
		readSkillText,
		store,
		work,
		servePrototype,
		prototypePage,
		deploys,
		saveBuilt,
	};
};
export type CallsDeps = ReturnType<typeof composeCore>;
