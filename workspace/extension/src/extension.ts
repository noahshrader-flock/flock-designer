import { readDescriptor } from '../../src/main/services/descriptor';
import { INSTALL_COMMAND } from '../../src/main/services/install';
import { httpProbe } from '../../src/main/services/runtime';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { served } from '../../src/main/handle';
import { type Context, findContext } from '../../src/main/services/findContext';
import type { PublishStatus, SignInState } from '../../src/shared/contract';
import { addressComment } from './address';
import { Panels, hostApi } from './bridge';
import { type LocalRun, handOff, openCode, shareCodebase, runLocally } from './codebase';
import { startCore } from './core';
import { showFound, shownFrom } from './designSystem';
import { designSystemHost } from './designSystemHost';
import { registerVoice } from './voice';
import { valueOf } from '../../src/shared/result';
import { type CodebaseAction, type HostMessage, type Review, readProjectArg, readReview, reviewsOf } from './messages';
import { type Given, newPrototype, readAsked, readyToStart } from './newPrototype';
import { watchBuild } from './watchBuild';
import { coalesce } from './coalesce';
import { PanelProvider } from './panel';
import { PANEL_VIEW_OPTIONS } from './panelOptions';
import { publishedLink } from './publishing';
import { copyProject } from '../../src/main/services/projectCopy';
import { needsProduct } from '../../src/shared/projectScope';
import { productsOf } from '../../src/shared/work';
import { REVIEW_KEY, Reviews, answerReview, buildReviewSite, pickReview, siteIn } from './review';
import { AgentLog, SyncStatus, failed, failedFor, vscodeChoose, vscodeCopy, vscodeOffer, vscodeOpen, vscodeProgress, vscodeTell } from './ui';

/** How long since the projects were last read before coming back to VS Code reads them again: they are read from GitHub. */
const REREAD_MS = 60_000;

/** Kept by the extension: the design system the person located, when nothing open holds one. */
const LOCATED = 'dsnr.located';

/**
 * DSNR, started when its panel is first shown or a command of its is run. The core starts in VS Code's shell, finds what
 * is open (the product, its design system, the design repository), trusts the product folder the person opened, and
 * restores their GitHub session without asking.
 */
export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
	// Run from its source, in Development or under VS Code's test runner; never once installed from a package.
	const development = context.extensionMode !== vscode.ExtensionMode.Production;
	const log = development ? vscode.window.createOutputChannel('DSNR', { log: true }) : undefined;
	if (log) context.subscriptions.push(log);

	const panels = new Panels();
	const provider = new PanelProvider({
		extensionUri: context.extensionUri,
		panels,
		context: () => said(),
		local: () => localAddresses(),
		design: () => design.asks,
		locate: () => locate(),
		openReview: (review) => openReview(review),
		openReviewInBrowser: (review) => openReviewInBrowser(review),
		copyReviewLink: (review) => copyPublishedLink(review),
		openReviewPublished: (review) => openPublishedPage(review),
		startPrototype: (answers) => startPrototype(answers).catch(failed),
		codebase: (action, projectId) => codebaseWork(action, projectId).catch(failed),
		development,
		...(log ? { log } : {}),
	});
	/** Who is signed in, in VS Code's own title bar: the username beside the DSNR mark, and Sign in or the account at its far right. */
	const showAccount = (state: SignInState) => {
		void vscode.commands.executeCommand('setContext', 'dsnr.signedIn', state.state === 'signedIn');
		provider.showAccount(state.state === 'signedIn' ? state.user.login : undefined);
	};
	const { core, github, shell, storage, headless } = startCore(context, panels, showAccount);
	/** This machine's server's addresses, as DSNR's pages name them: pictures from its own, a library's code from the pages'. */
	const localAddresses = async () => ({ images: await core.prototypeServer.origin(), frames: await core.prototypeServer.pagesOrigin() });
	const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
	const located = () => context.globalState.get<string>(LOCATED) ?? null;

	/** A folder's design system, as locating it finds it. */
	const designSystemAt = async (root: string) => (await findContext({ folders: [], located: root })).designSystem;
	/**
	 * What is open, found, and its design system told to the core: the one found, or the one the person located when that
	 * cannot be read; and why it cannot be read, when neither can be.
	 */
	const findHere = async (): Promise<{ found: Context; unreadable: string | null }> => {
		const at = await findContext({ folders: folders(), located: located() });
		const shown = await shownFrom(at.designSystem, located(), { show: (f) => showFound(core.designSystems, f), at: designSystemAt });
		return { found: { ...at, designSystem: shown.designSystem }, unreadable: shown.unreadable };
	};
	let { found, unreadable } = await findHere();
	/** What is open, as the panel is told it. */
	const said = (): Extract<HostMessage, { type: 'context' }> => ({ type: 'context', context: found, ...(unreadable === null ? {} : { unreadable }) });
	/** The product folder the person opened: VS Code trusts it, so DSNR does, as the app trusts a checkout accepted. */
	const trust = async () => {
		if (found.product) await shell.open(found.product).catch(failed);
	};
	const refresh = async () => {
		const before = core.designSystems.current()?.id;
		({ found, unreadable } = await findHere());
		if (core.designSystems.current()?.id !== before) design.anotherShown();
		await trust();
		panels.post(said());
	};
	await trust();
	void github.restore().catch(failed);

	const api = hostApi(served, panels);
	const agentLog = new AgentLog();
	/** What every flow is given of VS Code: the core's API, its notifications, the agent's log, the browser and the clipboard. */
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
	// The voice and tone (6.3), a document in the editor; and the design system (6.1, 6.2), its tabs and what its pages ask.
	const voice = registerVoice(vscode, { api, offer: vscodeOffer, choose: vscodeChoose, openExternal: vscodeOpen, failed });
	const design = designSystemHost({
		vscode,
		dist: vscode.Uri.joinPath(context.extensionUri, 'dist'),
		api,
		panels,
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
	const site = siteIn(storage);
	const buildReview = buildReviewSite(site, join(context.extensionUri.fsPath, 'dist', 'viewer'));
	const reviews = new Reviews({
		vscode,
		onShown: () => tabsShown(),
		// The bar on this machine's server's own address, and each prototype's page on the pages' address, another origin.
		build: async (records) => buildReview(records, `${await core.prototypeServer.pagesOrigin()}/${REVIEW_KEY}/`),
		serve: () => core.prototypeServer.serveFolder(REVIEW_KEY, site),
		// What a review's page asks: its comments, signing in, and Address, whose failure is said here as any is. Address shows
		// its change where it was asked from: in the tab; or in the browser, which goes to it, and a tab open on the project.
		answer: (review, name, args, seen, from) =>
			answerReview(
				{
					routes: served,
					signIn: () => github.signIn(),
					written: () => projectsChanged(),
					address: (r, comment, asked): Promise<string | null | void> => {
						const show: (shown: Review) => Promise<void> =
							asked === 'browser'
								? async (shown: Review) => reviews.showIfOpen({ records: await recordsFor(shown.projectId), ...shown })
								: openReview;
						const run = async () => {
							const project = valueOf(await api.listProjects()).find((p) => p.id === r.projectId);
							// Address changes the prototype's code, which is with the product it was made on: that one, open here.
							const why = needsProduct(project ? productsOf(project) : [], found.product === null ? null : found.productRepository);
							if (why !== null) throw new Error(why);
							// Titled as the project's records title it: a browser's page may have moved to another of its iterations.
							return addressComment({ ...here, show }, (project && reviewsOf(project).find((x) => x.name === r.name)) || r, comment);
						};
						// One place says what went wrong, a refusal included.
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
	/**
	 * Where a project's records are, to build its review from: the design repository's checkout beside the product, or with
	 * none (only VS Code open), that project alone, read through GitHub into DSNR's own storage, kept while a review uses it.
	 * That storage is VS Code's for the extension, shared by every window, as the review site's folder already is: two
	 * windows opening reviews at once write the same folders.
	 */
	const recordsFor = (projectId: string): Promise<string> =>
		found.designRepository !== null
			? Promise.resolve(found.designRepository)
			: copyProject(core.designRepo.files, projectId, join(storage, 'review-copy'), reviews.inUse());
	/**
	 * A prototype Claude Code built is saved when it is opened, as the app saves it (`openPrototype`): its page built from
	 * its source, and kept in the design repository, so what the review shows is what reviewers get. Nothing then, and no
	 * error, for one with nothing built here. The list is read again, for the picture a built page now has.
	 */
	const openReview = async (review: Review): Promise<void> => {
		await api.openPrototype(review.projectId, review.name);
		await reviews.open({ records: await recordsFor(review.projectId), ...review });
		projectsChanged();
	};
	/**
	 * The review's page in the person's browser, outside VS Code: the same page, from this machine, with a key of its own,
	 * so it comments through DSNR as a tab does (BROWSER_COMMENTS_PLAN).
	 */
	const openReviewInBrowser = async (review: Review) => {
		await vscodeOpen(await reviews.inBrowser({ records: await recordsFor(review.projectId), ...review }));
	};
	/** Does `act` with the link of the review's published page; when there is none, what says so (`publishedLink`). */
	const withPublishedLink = (act: (url: string) => Promise<void>) => async (review: Review) => {
		const url = await publishedLink(here, review);
		if (url !== null) await act(url);
	};
	/** The link of the review's published page onto the clipboard. */
	const copyPublishedLink = withPublishedLink(vscodeCopy);
	/** The review's published page in the person's browser, as reviewers see it. */
	const openPublishedPage = withPublishedLink(vscodeOpen);
	core.prototypeServer.answerAsks((key, ask) => reviews.answerBrowser(key, ask));
	/** Locate design system: a folder that holds one is remembered and shown; one that does not is refused, and not kept. */
	const locate = async () => {
		const chosen = await core.ports.chooseFolder({ title: 'Locate design system' });
		if (chosen === null) return;
		if ((await designSystemAt(chosen)) === null)
			throw new Error('That folder holds no design system: no Storybook stories and no tokens were found in it.');
		await context.globalState.update(LOCATED, chosen);
		await refresh();
	};

	const productNow = () => ({ root: found.product, why: found.missing[0] ?? 'No product is open.' });
	/** Watching builds Claude Code does ends with the window: nothing is saved after it is gone. */
	let watching = true;
	context.subscriptions.push({ dispose: () => void (watching = false) });
	const watchPrototype = (projectId: string, name: string) =>
		void watchBuild({
			read: async () => valueOf(await api.prototypeProgress(projectId, name)),
			save: async () => (await api.savePrototype(projectId, name)).ok,
			// Saved: the list read again for its picture. Accessibility is the build's own check, in the agent's run (its task
			// gives the command), and saving puts what it left on the page's record: no notification for each save.
			onSaved: projectsChanged,
			since: Date.now(),
			now: Date.now,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			pollMs: 2000,
			settleMs: 6000,
			giveUpMs: 2 * 60 * 60 * 1000,
			isLive: () => watching,
		});
	const startPrototype = (given: Given) =>
		newPrototype({ ...here, given, product: productNow(), onChanged: projectsChanged, watchBuild: watchPrototype });
	/** How the product open here runs on this machine (its own `.dsnr/workspace.json`), for Run locally. */
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
	/**
	 * What the panel asked of a project's codebase work (ELECTRON_MIGRATION_PLAN 5.2, 5.3), in the product open here, with
	 * VS Code's notifications, the agent's log and the browser. Handoff and its draft pull request change its records: the
	 * list is read again.
	 */
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
	/** Shows DSNR's panel and tells it to open a dialog, held until its page is listening if it is not yet. */
	const inPanel = async (message: HostMessage) => {
		await vscode.commands.executeCommand('workbench.view.extension.dsnr');
		panels.show(message);
	};
	/** The panels are told the projects changed, so each reads them again. */
	let lastRead = Date.now();
	// Once for a burst (a build's save, the review it opens, a comment written): each read of the projects asks GitHub
	// for every project's files, so several in a moment would spend the hourly limit for nothing.
	const projectsChanged = coalesce(() => {
		lastRead = Date.now();
		panels.post({ type: 'projects-changed' });
	}, 1500);
	/** The panel marks what is open in the editor: the projects whose review is in front, and the components whose tab is. */
	const tabsShown = () => panels.showTabs({ projects: reviews.shown(), components: design.shownComponents() });
	/** What a review tab's title bar does, on the review in front; said when there is none. */
	const inFront = (act: (review: Review) => Promise<void>) => {
		const review = reviews.active();
		if (!review) return vscodeTell('Open a prototype for review first.');
		return act(review).catch(failed);
	};
	// The sync in the status bar: as it is now, then as the core says it moves.
	const sync = new SyncStatus();
	void api.publishStatus().then((r) => r.ok && sync.show(r.value));

	context.subscriptions.push(
		sync,
		{ dispose: panels.listen('onPublishStatus', (status) => sync.show(status as PublishStatus)) },
		agentLog,
		...voice.disposables,
		...design.disposables,
		vscode.window.registerWebviewViewProvider('dsnr.panel', provider, PANEL_VIEW_OPTIONS),
		// Without answers, the panel's dialog asks them, once there is nothing in the way; given them, by code, it starts.
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
		// A product onto this machine with VS Code's own clone, which offers to open it; New prototype then offers the install.
		vscode.commands.registerCommand('dsnr.getStarted', () => vscode.commands.executeCommand('git.clone')),
		vscode.commands.registerCommand('dsnr.openReview', async (raw: unknown) => {
			// Given the review, by code rather than a person: opened, and the caller told if it could not be.
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
		// From a row's right-click menu (its project) or a review tab's menu (the review in front): the panel's dialog.
		vscode.commands.registerCommand('dsnr.assignFolder', (raw: unknown) => {
			const projectId = readProjectArg(raw) ?? reviews.active()?.projectId;
			if (!projectId) return vscodeTell('Right-click a project in DSNR, or open one for review, to assign its folder.');
			return inPanel({ type: 'open-dialog', dialog: { kind: 'assign', projectId } });
		}),
		// From a review tab's menu: Build in the codebase, for the prototype in front, in the panel's dialog.
		vscode.commands.registerCommand('dsnr.buildInCodebase', () =>
			inFront((review) => inPanel({ type: 'open-dialog', dialog: { kind: 'build', projectId: review.projectId } })),
		),
		// From the status bar: whether the work is synced, what is held back and Sync now, in the panel's dialog.
		vscode.commands.registerCommand('dsnr.sync', () => inPanel({ type: 'open-dialog', dialog: { kind: 'sync' } })),
		vscode.commands.registerCommand('dsnr.signIn', () => github.signIn().catch(failed)),
		// From the title bar: who is signed in, and Sign out, in the panel's dialog.
		vscode.commands.registerCommand('dsnr.account', () => {
			if (github.state().state === 'signedIn') return inPanel({ type: 'open-dialog', dialog: { kind: 'account' } });
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh().catch(failed)),
		// Coming back to VS Code is a good moment to publish what was done meanwhile, as coming back to the app's window is.
		vscode.window.onDidChangeWindowState((s) => {
			if (!s.focused) return;
			void shell.publish().catch(failed);
			// Comments made elsewhere (the app, GitHub) while away: the counts are read again, not more than once in a while.
			if (Date.now() - lastRead > REREAD_MS) projectsChanged();
		}),
	);
};
