import { join } from 'node:path';
import * as vscode from 'vscode';
import { served } from '../../src/main/handle';
import { type Context, findContext } from '../../src/main/services/findContext';
import type { PublishStatus, SignInState, WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import { addressComment } from './address';
import { Panels, hostApi } from './bridge';
import { handOff, openCode, previewCodebase, shareCodebase } from './codebase';
import { startCore } from './core';
import { type CodebaseAction, type HostMessage, type Review, readProjectArg, readReview, reviewsOf } from './messages';
import { type Given, newPrototype, readGiven, readyToStart } from './newPrototype';
import { PanelProvider } from './panel';
import { publishedLink, syncItem, syncPicks } from './publishing';
import { Reviews, answerReview, buildReviewSite, siteIn } from './review';
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
		context: () => found,
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
	const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
	const located = () => context.globalState.get<string>(LOCATED) ?? null;

	let found: Context = await findContext({ folders: folders(), located: located() });
	/** The product folder the person opened: VS Code trusts it, so DSNR does, as the app trusts a checkout accepted. */
	const trust = async () => {
		if (found.product) await shell.open(found.product).catch((err: unknown) => log?.warn(`The product could not be opened: ${String(err)}`));
	};
	const refresh = async () => {
		found = await findContext({ folders: folders(), located: located() });
		await trust();
		panels.post({ type: 'context', context: found });
	};
	await trust();
	void github.restore();

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
	const site = siteIn(storage);
	const reviews = new Reviews({
		vscode,
		build: buildReviewSite(site, join(context.extensionUri.fsPath, 'dist', 'viewer')),
		serve: () => core.prototypeServer.serveFolder('review', site),
		// What a review's page asks: its comments, signing in, and Address, whose failure is said here as any is.
		answer: (review, name, args) =>
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
	/** The review's page in the person's browser, outside VS Code: the same page, from this machine. */
	const openReviewInBrowser = async (review: Review) => {
		await vscodeOpen(await reviews.address({ records: records(), ...review }));
	};
	const locate = async () => {
		const chosen = await core.ports.chooseFolder({ title: 'Locate design system' });
		if (chosen === null) return;
		await context.globalState.update(LOCATED, chosen);
		await refresh();
		if (found.designSystem?.how !== 'located' && found.designSystem?.root !== chosen)
			void vscode.window.showWarningMessage('That folder holds no design system: no Storybook stories and no tokens were found in it.');
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
			const picked = await pickPrototype(api);
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
		vscode.commands.registerCommand('dsnr.buildInCodebase', () => {
			const review = reviews.active();
			if (!review) return vscodeTell('Open a prototype for review first.');
			return inPanel({ type: 'open-dialog', dialog: { kind: 'build', projectId: review.projectId } });
		}),
		vscode.commands.registerCommand('dsnr.sync', async () => {
			const status = valueOf(await api.publishStatus());
			const picked = await vscode.window.showQuickPick(syncPicks(status), {
				title: 'DSNR: your work’s sync',
				placeHolder: syncItem(status)?.tooltip ?? '',
			});
			if (picked?.value === 'sync') sync.show(valueOf(await api.publishNow()));
		}),
		vscode.commands.registerCommand('dsnr.signIn', () => github.signIn().catch(failed)),
		vscode.commands.registerCommand('dsnr.account', async () => {
			const state = github.state();
			if (state.state !== 'signedIn') return;
			const signOut = { label: '$(sign-out) Sign out of DSNR', description: 'VS Code keeps your GitHub account in its Accounts menu' };
			const picked = await vscode.window.showQuickPick([signOut], { placeHolder: `Signed in to GitHub as ${state.user.login}` });
			if (picked === signOut) github.signOut();
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
		// Coming back to VS Code is a good moment to publish what was done meanwhile, as coming back to the app's window is.
		vscode.window.onDidChangeWindowState((s) => {
			if (!s.focused) return;
			void shell.publish();
			// Comments made elsewhere (the app, GitHub) while away: the counts are read again, not more than once in a while.
			if (Date.now() - lastRead > REREAD_MS) projectsChanged();
		}),
	);
};

/** Each project's prototypes, newest first (`reviewsOf`), to choose one for review: as the panel's rows open them. */
const pickPrototype = async (api: Pick<WorkspaceApi, 'listProjects'>): Promise<Review | undefined> => {
	const listed = await api.listProjects();
	if (!listed.ok) {
		failed(listed.error);
		return undefined;
	}
	const items = listed.value.flatMap(reviewsOf).map((review) => ({ label: review.title, review }));
	if (items.length === 0) {
		vscodeTell('There is no prototype to review here yet.');
		return undefined;
	}
	return (await vscode.window.showQuickPick(items, { placeHolder: 'Open a prototype for review' }))?.review;
};
