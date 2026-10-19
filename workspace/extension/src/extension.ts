import { readDescriptor } from '../../src/core/services/projects/descriptor';
import { INSTALL_COMMAND } from '../../src/core/services/codebase/install';
import { httpProbe } from '../../src/core/services/codebase/runtime';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { served } from '../../src/core/handle';
import { type Context, findContext } from '../../src/core/services/projects/findContext';
import type { PublishStatus, SignInState } from '../../src/shared/contract';
import { addressComment } from './address';
import { Panels, hostApi } from './bridge';
import { type LocalRun, handOff, openCode, shareCodebase, runLocally } from './codebase';
import { startCore } from './core';
import { showFound, shownFrom } from './designSystem';
import { designSystemHost } from './designSystemHost';
import { registerVoice } from './voice';
import { valueOf } from '../../src/shared/result';
import { type CodebaseAction, type HostMessage, NO_TABS_SHOWN, type Review, readProjectArg, reviewsOf } from './messages';
import { askRoutes, readReview } from './asks';
import { type Given, newPrototype, readAsked, readyToStart } from './newPrototype';
import { watchBuild } from './watchBuild';
import { coalesce } from './coalesce';
import { PanelProvider } from './panel';
import { PANEL_VIEW_OPTIONS } from './panelOptions';
import { publishedLink } from './publishing';
import { copyProject } from '../../src/core/services/prototypes/projectCopy';
import { needsProduct } from '../../src/shared/projectScope';
import { productsOf } from '../../src/shared/work';
import { REVIEW_KEY, Reviews, answerReview, buildReviewSite, pickReview, siteIn } from './review';
import { AgentLog, SyncStatus, failed, failedFor, vscodeChoose, vscodeCopy, vscodeOffer, vscodeOpen, vscodeProgress, vscodeTell } from './ui';

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
	closing = () => Promise.all([headless.close(), core.runtime.stopAll(), core.agent.stop()]).then(() => undefined);
	const localAddresses = async () => ({ images: await core.prototypeServer.origin(), frames: await core.prototypeServer.pagesOrigin() });
	const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
	const located = () => context.globalState.get<string>(LOCATED) ?? null;

	const designSystemAt = async (root: string) => (await findContext({ folders: [], located: root })).designSystem;
	const findHere = async (): Promise<{ found: Context; unreadable: string | null }> => {
		const at = await findContext({ folders: folders(), located: located() });
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
	};
	await trust();
	void github.restore().catch(failed);

	const api = hostApi(served, panels);
	const agentLog = new AgentLog();
	const here = {
		api,
		progress: vscodeProgress,
		log: agentLog,
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
	const buildReview = buildReviewSite(site, join(context.extensionUri.fsPath, 'dist', 'viewer'));
	const reviews = new Reviews({
		vscode,
		onShown: () => tabsShown(),
		// Each prototype's page on the pages' address, another origin from the bar's.
		build: async (records) => buildReview(records, `${await core.prototypeServer.pagesOrigin()}/${REVIEW_KEY}/`),
		serve: () => core.prototypeServer.serveFolder(REVIEW_KEY, site),
		answer: (review, name, args, seen, from) =>
			answerReview(
				{
					routes: served,
					signIn: () => github.signIn(),
					written: () => projectsChanged(),
					address: (r, comment, asked, newVersion): Promise<string | null | void> => {
						const show: (shown: Review) => Promise<void> =
							asked === 'browser'
								? async (shown: Review) => reviews.showIfOpen({ records: await recordsFor(shown.projectId), ...shown })
								: openReview;
						const run = async () => {
							const project = valueOf(await api.listProjects()).find((p) => p.id === r.projectId);
							// Address changes the prototype's code, which is with the product it was made on: that one, open here.
							const why = needsProduct(project ? productsOf(project) : [], found.product === null ? null : found.productRepository);
							if (why !== null) throw new Error(why);
							// Titled as the project's records title it: a browser's page may have moved to another of its versions.
							return addressComment({ ...here, show }, (project && reviewsOf(project).find((x) => x.name === r.name)) || r, comment, newVersion);
						};
						// One place says what went wrong, a refusal included, and the caller is told too.
						return run().catch(failedFor(true));
					},
				},
				review,
				name,
				args,
				seen,
				from,
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

	const productNow = () => ({ root: found.product, why: found.missing[0] ?? 'No product is open.' });
	/** Ends with the window: nothing is saved after it is gone. */
	let watching = true;
	context.subscriptions.push({ dispose: () => void (watching = false) });
	const watchPrototype = (projectId: string, name: string) =>
		void watchBuild({
			saveBuilt: async () => valueOf(await api.saveBuilt(projectId, name)),
			// No notification for each save: accessibility is the build's own check, in the agent's run.
			onSaved: projectsChanged,
			now: Date.now,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			pollMs: 2000,
			giveUpMs: 2 * 60 * 60 * 1000,
			isLive: () => watching,
		});
	const startPrototype = (given: Given) =>
		newPrototype({ ...here, given, product: productNow(), onChanged: projectsChanged, watchBuild: watchPrototype });
	const localRun = (root: string): LocalRun => {
		const declared = () => readDescriptor(root).commands;
		return {
			port: (id) => declared().find((c) => c.id === id)?.servesPreviewOn ?? null,
			installCommand: () =>
				declared()
					.find((c) => c.id === INSTALL_COMMAND)
					?.argv.join(' ') ?? null,
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
			share: shareCodebase,
			'open-code': openCode,
			'run-locally': (deps: Parameters<typeof runLocally>[0], id: string) => runLocally(deps, localRun(root), id),
		}[action];
		try {
			await run({ ...here, root }, projectId);
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
	});
	const inFront = (act: (review: Review) => Promise<void>) => {
		const review = reviews.active();
		if (!review) return vscodeTell('Open a prototype for review first.');
		return act(review).catch(failed);
	};
	const sync = new SyncStatus();
	void api.publishStatus().then((r) => r.ok && sync.show(r.value));

	context.subscriptions.push(
		sync,
		{ dispose: panels.listen('onPublishStatus', (status) => sync.show(status as PublishStatus)) },
		agentLog,
		...voice.disposables,
		...design.disposables,
		vscode.window.registerWebviewViewProvider('dsnr.panel', provider, PANEL_VIEW_OPTIONS),
		vscode.commands.registerCommand('dsnr.newPrototype', async (raw: unknown) => {
			const asked = readAsked(raw);
			if (asked === 'ask')
				return readyToStart({ product: productNow() })
					.then(() => inPanel({ type: 'open-dialog', dialog: { kind: 'new' } }))
					.catch(failed);
			if (!asked) throw new Error('DSNR: New prototype was given something that is not a name and what it should explore.');
			return startPrototype(asked).catch(failedFor(true));
		}),
		vscode.commands.registerCommand('dsnr.open', () => vscode.commands.executeCommand('workbench.view.extension.dsnr')),
		vscode.commands.registerCommand('dsnr.getStarted', () => vscode.commands.executeCommand('git.clone')),
		vscode.commands.registerCommand('dsnr.openReview', async (raw: unknown) => {
			if (raw !== undefined) {
				const given = readReview(raw);
				if (!given) throw new Error('DSNR: Open a prototype for review was given something that is not a review.');
				return openReview(given).catch(failedFor(true));
			}
			const picked = await pickReview(vscode.window, api, vscodeTell).catch(failed);
			if (picked) await openReview(picked).catch(failed);
		}),
		vscode.commands.registerCommand('dsnr.openPublishedPage', () =>
			inFront(async (review) => {
				const url = await publishedLink(here, review);
				if (url) await vscodeOpen(url);
			}),
		),
		vscode.commands.registerCommand('dsnr.copyPublishedLink', () => inFront(copyPublishedLink)),
		vscode.commands.registerCommand('dsnr.assignFolder', (raw: unknown) => {
			const projectId = readProjectArg(raw) ?? reviews.active()?.projectId;
			if (!projectId) return vscodeTell('Right-click a project in DSNR, or open one for review, to assign its folder.');
			return inPanel({ type: 'open-dialog', dialog: { kind: 'assign', projectId } });
		}),
		vscode.commands.registerCommand('dsnr.buildInCodebase', () =>
			inFront((review) => inPanel({ type: 'open-dialog', dialog: { kind: 'build', projectId: review.projectId } })),
		),
		vscode.commands.registerCommand('dsnr.sync', () => inPanel({ type: 'open-dialog', dialog: { kind: 'sync' } })),
		vscode.commands.registerCommand('dsnr.signIn', () => github.signIn().catch(failed)),
		vscode.commands.registerCommand('dsnr.account', () => {
			if (github.state().state === 'signedIn') return inPanel({ type: 'open-dialog', dialog: { kind: 'account' } });
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh().catch(failed)),
		// Coming back to VS Code is a good moment to publish what was done meanwhile.
		vscode.window.onDidChangeWindowState((s) => {
			if (!s.focused) return;
			void shell.publish().catch(failed);
			// For comments made elsewhere while away, but not more than once in a while.
			if (Date.now() - lastRead > REREAD_MS) projectsChanged();
		}),
	);
};
