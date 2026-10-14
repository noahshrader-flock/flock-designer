import { join } from 'node:path';
import * as vscode from 'vscode';
import { served } from '../../src/main/handle';
import { type Context, findContext } from '../../src/main/services/findContext';
import type { PublishStatus, SignInState } from '../../src/shared/contract';
import { addressComment } from './address';
import { Panels, hostApi } from './bridge';
import { handOff, openCode, previewCodebase, shareCodebase } from './codebase';
import { startCore } from './core';
import { showFound, shownFrom } from './designSystem';
import { designSystemHost } from './designSystemHost';
import { registerVoice } from './voice';
import { type CodebaseAction, type HostMessage, type Review, readProjectArg, readReview } from './messages';
import { type Given, newPrototype, readGiven, readyToStart } from './newPrototype';
import { PanelProvider } from './panel';
import { publishedLink } from './publishing';
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
	const { core, github, shell, storage } = startCore(context, panels, showAccount);
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
		openExternal: vscodeOpen,
		tell: vscodeTell,
		failed,
		failedFor,
	});
	const site = siteIn(storage);
	const buildReview = buildReviewSite(site, join(context.extensionUri.fsPath, 'dist', 'viewer'));
	const reviews = new Reviews({
		vscode,
		// The bar on this machine's server's own address, and each prototype's page on the pages' address, another origin.
		build: async (records) => buildReview(records, `${await core.prototypeServer.pagesOrigin()}/${REVIEW_KEY}/`),
		serve: () => core.prototypeServer.serveFolder(REVIEW_KEY, site),
		// What a review's page asks: its comments, signing in, and Address, whose failure is said here as any is.
		answer: (review, name, args, seen) =>
			answerReview(
				{
					routes: served,
					signIn: () => github.signIn(),
					written: () => projectsChanged(),
					address: (r, comment) => addressComment({ ...here, openReview }, r, comment).catch(failedFor(true)),
				},
				review,
				name,
				args,
				seen,
			),
		...(log ? { log } : {}),
	});
	/** Where the projects' records are, or why they are not here. */
	const records = () => {
		if (!found.designRepository)
			throw new Error(found.missing.find((m) => m.startsWith('The design repository')) ?? 'The design repository is not here.');
		return found.designRepository;
	};
	const openReview = (review: Review) => reviews.open({ records: records(), ...review });
	/**
	 * The review's page in the person's browser, outside VS Code: the same page, from this machine, with a key of its own,
	 * so it comments through DSNR as a tab does (BROWSER_COMMENTS_PLAN).
	 */
	const openReviewInBrowser = async (review: Review) => {
		await vscodeOpen(await reviews.inBrowser({ records: records(), ...review }));
	};
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
	/** Makes a prototype from its answers (the panel's dialog, or code), with VS Code's notification, log and sync. */
	const startPrototype = (given: Given) => newPrototype({ ...here, given, product: productNow(), onChanged: projectsChanged, openReview });
	/**
	 * What the panel asked of a project's codebase work (ELECTRON_MIGRATION_PLAN 5.2, 5.3), in the product open here, with
	 * VS Code's notifications, the agent's log and the browser. Handoff and Share change its records: the list is read again.
	 */
	const codebaseWork = async (action: CodebaseAction, projectId: string) => {
		const root = found.product;
		if (root === null) throw new Error(productNow().why);
		const run = { preview: previewCodebase, 'hand-off': handOff, share: shareCodebase, 'open-code': openCode }[action];
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
	const projectsChanged = () => {
		lastRead = Date.now();
		panels.post({ type: 'projects-changed' });
	};
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
		vscode.window.registerWebviewViewProvider('dsnr.panel', provider),
		// Without answers, the panel's dialog asks them, once there is nothing in the way; given them, by code, it starts.
		vscode.commands.registerCommand('dsnr.newPrototype', async (raw: unknown) => {
			if (raw === undefined)
				return readyToStart({ api, product: productNow() })
					.then(() => inPanel({ type: 'open-dialog', dialog: { kind: 'new' } }))
					.catch(failed);
			const given = readGiven(raw);
			if (!given) throw new Error('DSNR: New prototype was given something that is not a name and what it should explore.');
			return startPrototype(given).catch(failedFor(true));
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
		vscode.commands.registerCommand('dsnr.copyPublishedLink', () =>
			inFront(async (review) => {
				const url = await publishedLink(here, review);
				if (url !== null) await vscodeCopy(url);
			}),
		),
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
