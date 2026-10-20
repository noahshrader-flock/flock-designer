import { readDescriptor } from '../../src/core/services/projects/descriptor';
import { installLine } from '../../src/core/services/codebase/install';
import { httpProbe } from '../../src/core/services/codebase/runtime';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { served } from '../../src/core/handle';
import { designRepositoryOf, isDesignRepository } from '../../src/core/services/projects/discovery';
import { formatRepo } from '../../src/shared/repoRef';
import { type Context, findContext } from '../../src/core/services/projects/findContext';
import type { PublishStatus, SignInState } from '../../src/shared/contract';
import { addressComment } from './address';
import { refreshPrototype } from './refresh';
import { Panels, hostApi } from './bridge';
import { type LocalRun, handOff, openCode, shareCodebase, runLocally, updateBranch } from './codebase';
import { startCore } from './core';
import { moveLocationSetting } from './agentWindows';
import { showFound, shownFrom, askSource } from './designSystem';
import { designSystemHost } from './designSystemHost';
import { registerVoice } from './voice';
import { errorText, valueOf } from '../../src/shared/result';
import { type CodebaseAction, type HostMessage, NO_TABS_SHOWN, type Review, reviewsOf } from './messages';
import { askRoutes } from './asks';
import { commands } from './commands';
import { type Given, newPrototype } from './newPrototype';
import { watchFor } from './watch';
import { coalesce } from './coalesce';
import { PanelProvider } from './panel';
import { PANEL_VIEW_OPTIONS } from './panelOptions';
import { publishedLink } from './publishing';
import { copyProject } from '../../src/core/services/prototypes/projectCopy';
import { needsProduct } from '../../src/shared/projectScope';
import { productsOf } from '../../src/shared/work';
import { REVIEW_KEY, Reviews, answerReview, buildReviewSite, pickReview, siteIn } from './review';
import { RunOutput, SyncStatus, failed, failedFor, vscodeChoose, vscodeCopy, vscodeOffer, vscodeOpen, vscodeProgress, vscodeTell } from './ui';

/** Coming back to VS Code rereads the projects only this long after the last read: each read asks GitHub. */
const REREAD_MS = 60_000;

const LOCATED = 'dsnr.located';

/** Here, not in a disposable: VS Code waits for `deactivate`, and not for a disposable. */
let closing: (() => Promise<void>) | null = null;
export const deactivate = (): Promise<void> | undefined => closing?.();

export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
	// From source, in Development or under VS Code's test runner; never once installed from a package.
	const development = context.extensionMode !== vscode.ExtensionMode.Production;
	const log = development ? vscode.window.createOutputChannel('DSNR', { log: true }) : undefined;
	if (log) context.subscriptions.push(log);

	const panels = new Panels();
	const provider = new PanelProvider({
		extensionUri: context.extensionUri,
		panels,
		local: () => localAddresses(),
		asks: () => asks,
		development,
		...(log ? { log } : {}),
	});
	const showAccount = (state: SignInState) => {
		void vscode.commands.executeCommand('setContext', 'dsnr.signedIn', state.state === 'signedIn');
		provider.showAccount(state.state === 'signedIn' ? state.user.login : undefined);
	};
	const { core, github, shell, storage, headless } = startCore(context, panels, showAccount);
	closing = () => Promise.all([headless.close(), core.runtime.stopAll()]).then(() => undefined);
	void moveLocationSetting(vscode).then(
		(moved) => moved && vscodeTell('DSNR’s setting dsnr.claudeCode.location is now dsnr.agent.location, and yours was moved to it.'),
		failed,
	);
	const localAddresses = async () => ({ images: await core.prototypeServer.origin(), frames: await core.prototypeServer.pagesOrigin() });
	const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
	const located = () => context.globalState.get<string>(LOCATED) ?? null;

	const designSystemAt = async (root: string) => (await findContext({ folders: [], located: root })).designSystem;
	const findHere = async (): Promise<{ found: Context; unreadable: string | null }> => {
		const at = await findContext({ folders: folders(), located: located(), answers: core.sourceAnswers, clones: core.designRepositories });
		const shown = await shownFrom(at.designSystem, located(), { show: (f) => showFound(core.designSystems, f), at: designSystemAt });
		return { found: { ...at, designSystem: shown.designSystem }, unreadable: shown.unreadable };
	};
	let { found, unreadable } = await findHere();
	const placed = panels.share('placed', { context: found, unreadable });
	/** VS Code trusts the product folder the person opened, so DSNR does. */
	const trust = async () => {
		if (found.product) await shell.open(found.product).catch(failed);
	};
	const refresh = async () => {
		const before = core.designSystems.current()?.id;
		({ found, unreadable } = await findHere());
		if (core.designSystems.current()?.id !== before) design.anotherShown();
		await trust();
		placed.set({ context: found, unreadable });
		void askAboutSource().catch(failed);
	};
	/** A design system beside the product that could not be confirmed: asked once, and what is found read again on an answer. */
	const askedSources = new Set<string>();
	const askAboutSource = async () => {
		if (await askSource({ offer: vscodeOffer, answers: core.sourceAnswers, asked: askedSources }, found.source)) await refresh();
	};
	void askAboutSource().catch(failed);
	await trust();
	void github.restore().catch(failed);

	const api = hostApi(served, panels);
	const runOutput = new RunOutput();
	const here = {
		api,
		progress: vscodeProgress,
		log: runOutput,
		tell: vscodeTell,
		offer: vscodeOffer,
		choose: vscodeChoose,
		openExternal: vscodeOpen,
		copy: vscodeCopy,
	};
	const voice = registerVoice(vscode, { api, offer: vscodeOffer, choose: vscodeChoose, openExternal: vscodeOpen, failed });
	const design = designSystemHost({
		vscode,
		dist: vscode.Uri.joinPath(context.extensionUri, 'dist'),
		api,
		panels,
		asks: () => asks,
		systems: core.designSystems,
		local: () => localAddresses(),
		openVoiceAndTone: voice.open,
		openChanges: () => inPanel({ type: 'open-dialog', dialog: { kind: 'changes' } }),
		openExternal: vscodeOpen,
		tell: vscodeTell,
		failed,
		failedFor,
		onShown: () => tabsShown(),
		kept: context.globalState,
	});
	void design.read();
	const site = siteIn(storage);
	/**
	 * A change to a prototype's code is made with the product it was made on: that one, open here. Titled as the project's
	 * records title it, since a browser's page may have moved to another of its versions.
	 */
	const withItsProduct = async (r: Review): Promise<{ root: string; titled: Review }> => {
		const project = valueOf(await api.listProjects()).find((p) => p.id === r.projectId);
		const why = needsProduct(project ? productsOf(project) : [], found.product === null ? null : found.productRepository);
		if (why !== null || found.product === null) throw new Error(why ?? productNow().why);
		return { root: found.product, titled: (project && reviewsOf(project).find((x) => x.name === r.name)) || r };
	};
	const buildReview = buildReviewSite(site, join(context.extensionUri.fsPath, 'dist', 'viewer'));
	const reviews = new Reviews({
		vscode,
		onShown: () => tabsShown(),
		// Each prototype's page on the pages' address, another origin from the bar's.
		build: async (records) => buildReview(records, `${await core.prototypeServer.pagesOrigin()}/${REVIEW_KEY}/`),
		serve: () => core.prototypeServer.serveFolder(REVIEW_KEY, site),
		answer: (review, name, args, seen) =>
			answerReview(
				{
					routes: served,
					signIn: () => github.signIn(),
					written: () => projectsChanged(),
					// One place says what went wrong, a refusal included, and the caller is told too.
					address: (r, comment, newVersion) =>
						withItsProduct(r)
							.then(({ root, titled }) => addressComment({ ...here, watch: watchPrototype }, root, titled, comment, newVersion))
							.catch(failedFor(true)),
					baseBehind: async (r) => valueOf(await api.prototypeBehind(r.projectId, r.name)),
					refresh: (r) =>
						withItsProduct(r)
							.then(({ root, titled }) => refreshPrototype({ ...here, watch: watchPrototype }, root, titled))
							.catch(failedFor(true)),
					designSystemBuild: async (r) => valueOf(await api.prototypeDesignSystem(r.projectId, r.name)),
					buildDesignSystemFrom: (r, from) =>
						withItsProduct(r)
							.then(async ({ root }) => valueOf(await api.setPrototypeDesignSystem(root, r.projectId, r.name, from)))
							.catch((err: unknown) => {
								failedFor(true)(err);
								throw err;
							}),
				},
				review,
				name,
				args,
				seen,
			),
		...(log ? { log } : {}),
	});
	/** The copy's storage is shared by every window, so two windows opening reviews at once write the same folders. */
	const recordsFor = (projectId: string): Promise<string> =>
		found.designRepository !== null
			? Promise.resolve(found.designRepository)
			: copyProject(core.designRepo.files, projectId, join(storage, 'review-copy'), reviews.inUse());
	/**
	 * Saved when it is opened (`openPrototype`), so the review shows what reviewers get; the list is read again for the
	 * picture a built page now has.
	 */
	const openReview = async (review: Review): Promise<void> => {
		await api.openPrototype(review.projectId, review.name);
		await reviews.open({ records: await recordsFor(review.projectId), ...review });
		projectsChanged();
	};
	const openReviewInBrowser = async (review: Review) => {
		await vscodeOpen(await reviews.inBrowser({ records: await recordsFor(review.projectId), ...review }));
	};
	const withPublishedLink = (act: (url: string) => Promise<void>) => async (review: Review) => {
		const url = await publishedLink(here, review);
		if (url !== null) await act(url);
	};
	const copyPublishedLink = withPublishedLink(vscodeCopy);
	const openPublishedPage = withPublishedLink(vscodeOpen);
	core.prototypeServer.answerAsks((key, ask) => reviews.answerBrowser(key, ask));
	const locate = async () => {
		const chosen = await core.ports.chooseFolder({ title: 'Locate design system' });
		if (chosen === null) return;
		if ((await designSystemAt(chosen)) === null)
			throw new Error('That folder holds no design system: no Storybook stories and no tokens were found in it.');
		await context.globalState.update(LOCATED, chosen);
		await refresh();
	};

	/** The product's design repository, from a folder the person picks: kept for that repository on this machine. */
	const locateDesignRepository = async () => {
		if (found.product === null) throw new Error(productNow().why);
		const repository = formatRepo(designRepositoryOf(found.product));
		const chosen = await core.ports.chooseFolder({ title: `Locate ${repository}` });
		if (chosen === null) return;
		if (!isDesignRepository(chosen))
			throw new Error(`${chosen} is not a design repository: it is not a git repository with an agents or a projects folder.`);
		core.designRepositories.set(repository, chosen);
		await refresh();
		projectsChanged();
	};

	const productNow = () => ({ root: found.product, why: found.missing[0] ?? 'No product is open.' });
	/** Ends with the window: nothing is saved after it is gone. */
	let watching = true;
	context.subscriptions.push({ dispose: () => void (watching = false) });
	/** `couldNot` says what failed, before the error's own words; `after` what to do then, if anything. */
	const watchUntil = (
		isThere: () => Promise<boolean>,
		{ couldNot, after = '', pollMs, giveUpMs, once = false }: { couldNot: string; after?: string; pollMs: number; giveUpMs: number; once?: boolean },
	) =>
		void watchFor({
			found: isThere,
			onFound: projectsChanged,
			onGaveUp: (err) => failed(new Error(`${couldNot}: ${errorText(err, { firstLine: true }).replace(/\.?$/, '.')}${after}`)),
			now: Date.now,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			pollMs,
			giveUpMs,
			isLive: () => watching,
			once,
		});
	// No notification for each save: accessibility is the build's own check, in the agent's run.
	const watchPrototype = (projectId: string, name: string, title: string, from: string | null = null) =>
		watchUntil(async () => valueOf(await api.saveBuilt(projectId, name, from)) === 'saved', {
			couldNot: `DSNR could not save the build of ${title} (${name})`,
			after: ' Opening it for review saves it.',
			pollMs: 2000,
			giveUpMs: 2 * 60 * 60 * 1000,
		});
	const watchHandoff = (check: () => Promise<boolean>) =>
		watchUntil(check, { couldNot: "DSNR could not read the handoff's result", pollMs: 5000, giveUpMs: 4 * 60 * 60 * 1000, once: true });
	const startPrototype = (given: Given) =>
		newPrototype({ ...here, given, product: productNow(), onChanged: projectsChanged, watchBuild: watchPrototype });
	const localRun = (root: string): LocalRun => {
		const declared = () => readDescriptor(root).commands;
		return {
			port: (id) => declared().find((c) => c.id === id)?.servesPreviewOn ?? null,
			installCommand: () => installLine(readDescriptor(root)),
			answers: httpProbe,
			loads: (url) => headless.loads(url),
		};
	};
	/** Handoff and its draft pull request change the project's records, so the list is read again after them. */
	const codebaseWork = async (action: CodebaseAction, projectId: string) => {
		const root = found.product;
		if (root === null) throw new Error(productNow().why);
		const run = {
			'hand-off': handOff,
			update: updateBranch,
			share: shareCodebase,
			'open-code': openCode,
			'run-locally': (deps: Parameters<typeof runLocally>[0], id: string) => runLocally(deps, localRun(root), id),
		}[action];
		try {
			await run({ ...here, root, watch: watchHandoff }, projectId);
		} finally {
			if (action === 'hand-off' || action === 'share') projectsChanged();
		}
	};
	const inPanel = async (message: HostMessage) => {
		await vscode.commands.executeCommand('workbench.view.extension.dsnr');
		panels.show(message);
	};
	let lastRead = Date.now();
	// Once for a burst (a build's save, the review it opens, a comment written): each read of the projects asks GitHub
	// for every project's files, so several in a moment would spend the hourly limit for nothing.
	const projectsChanged = coalesce(() => {
		lastRead = Date.now();
		panels.post({ type: 'projects-changed' });
	}, 1500);
	const tabs = panels.share('tabs', NO_TABS_SHOWN);
	/** Said where work is handed over; read again whenever the choice, or who is signed in, may have changed. */
	const agentShown = panels.share('agent', { name: null });
	const showAgent = async () => agentShown.set({ name: valueOf(await api.agentShown()) });
	// What is kept is a setting, and shown again when it changes.
	const chooseAgent = async () => valueOf(await api.chooseAgent());
	void showAgent().catch(failed);
	const tabsShown = () => tabs.set({ projects: reviews.shown(), components: design.shownComponents() });
	const asks = askRoutes({
		...design.handlers,
		locateDesignSystem: () => locate(),
		getStarted: () => vscode.commands.executeCommand('dsnr.getStarted'),
		askNewPrototype: () => vscode.commands.executeCommand('dsnr.newPrototype'),
		newPrototype: (title, task, folder) => startPrototype({ title, task, folder }),
		codebase: (action, projectId) => codebaseWork(action, projectId),
		openReview,
		openReviewInBrowser,
		copyReviewLink: copyPublishedLink,
		openReviewPublished: openPublishedPage,
		chooseAgent,
	});
	const sync = new SyncStatus();
	void api.publishStatus().then((r) => r.ok && sync.show(r.value));

	context.subscriptions.push(
		sync,
		{ dispose: panels.listen('onPublishStatus', (status) => sync.show(status as PublishStatus)) },
		runOutput,
		...voice.disposables,
		...design.disposables,
		vscode.window.registerWebviewViewProvider('dsnr.panel', provider, PANEL_VIEW_OPTIONS),
		...Object.entries(
			commands({
				run: (command) => vscode.commands.executeCommand(command),
				tell: vscodeTell,
				inPanel,
				product: productNow,
				api,
				startPrototype,
				openReview,
				pickReview: () => pickReview(vscode.window, api, vscodeTell),
				activeReview: () => reviews.active(),
				openPublishedPage,
				copyPublishedLink,
				signIn: () => github.signIn(),
				signedIn: () => github.state().state === 'signedIn',
				failed,
				failedFor,
				chooseAgent,
				locateDesignRepository,
			}),
		).map(([id, handler]) => vscode.commands.registerCommand(id, handler)),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh().catch(failed)),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('dsnr.agent.use')) void showAgent().catch(failed);
		}),
		vscode.window.onDidChangeWindowState((s) => {
			if (!s.focused) return;
			// Signed in or out of an agent meanwhile.
			void showAgent().catch(failed);
			// Coming back to VS Code is a good moment to publish what was done meanwhile.
			void shell.publish().catch(failed);
			// For comments made elsewhere while away, but not more than once in a while.
			if (Date.now() - lastRead > REREAD_MS) projectsChanged();
		}),
	);
};
